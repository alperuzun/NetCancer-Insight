"""
Phase 1 infrastructure test suite.

Validates every change introduced in Phase 1:
  #22  CORS — no wildcard fallback
  #23  ChromaDB healthcheck defined in compose
  #24  backend depends_on chromadb with condition: service_healthy
  #25  ./data/ host volume mounted for SQLite / runtime state
  #26  llm_data and gene_data mounted read-only
  #27  docker-compose.dev.yml is a proper override with hot-reload

Tests are split into two groups:
  Static  — parse config files and hit the FastAPI TestClient (no Docker needed)
  Docker  — exec into running containers to verify live behaviour
             Auto-skipped when containers are not running.

Run static only : pytest tests/test_phase1.py -m "not docker_runtime"
Run everything  : docker compose up -d && pytest tests/test_phase1.py
"""

import json
import os
import subprocess
import sys

import pytest
import yaml
from fastapi.testclient import TestClient

# ── Path setup ────────────────────────────────────────────────────────────────

BACKEND_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

sys.path.insert(0, BACKEND_DIR)

from main import app  # noqa: E402  (must come after sys.path insert)

client = TestClient(app)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_compose(filename="docker-compose.yml") -> dict:
    with open(os.path.join(PROJECT_ROOT, filename)) as f:
        return yaml.safe_load(f)


def _read_dockerfile(path: str) -> str:
    with open(os.path.join(PROJECT_ROOT, path)) as f:
        return f.read()


def _docker_exec(service: str, cmd: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "compose", "exec", "-T", service, "sh", "-c", cmd],
        capture_output=True, text=True, timeout=15,
        cwd=PROJECT_ROOT,
    )


def _running_services() -> set:
    """Return the set of currently running compose service names."""
    try:
        result = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True, text=True, timeout=10,
            cwd=PROJECT_ROOT,
        )
        if result.returncode != 0:
            return set()
        services = set()
        for line in result.stdout.strip().splitlines():
            try:
                svc = json.loads(line)
                if svc.get("State") == "running":
                    services.add(svc.get("Service", ""))
            except json.JSONDecodeError:
                continue
        return services
    except Exception:
        return set()


_RUNNING = _running_services()

docker_runtime = pytest.mark.skipif(
    "chromadb" not in _RUNNING or "backend" not in _RUNNING,
    reason="Docker containers not running — start with 'docker compose up -d' first",
)


# ════════════════════════════════════════════════════════════════════════════════
# #23 + #24 — Compose config: ChromaDB healthcheck + service_healthy condition
# ════════════════════════════════════════════════════════════════════════════════

class TestComposeConfig:

    def test_compose_parses_without_error(self):
        compose = _load_compose()
        assert isinstance(compose, dict)
        assert "services" in compose

    def test_chromadb_service_defined(self):
        compose = _load_compose()
        assert "chromadb" in compose["services"]

    def test_chromadb_has_healthcheck(self):
        hc = _load_compose()["services"]["chromadb"].get("healthcheck")
        assert hc is not None, "chromadb service is missing a healthcheck"

    def test_chromadb_healthcheck_hits_heartbeat(self):
        hc = _load_compose()["services"]["chromadb"]["healthcheck"]
        test_cmd = " ".join(hc["test"]) if isinstance(hc["test"], list) else hc["test"]
        assert "heartbeat" in test_cmd

    def test_chromadb_healthcheck_has_interval(self):
        hc = _load_compose()["services"]["chromadb"]["healthcheck"]
        assert "interval" in hc

    def test_chromadb_healthcheck_has_retries(self):
        hc = _load_compose()["services"]["chromadb"]["healthcheck"]
        assert "retries" in hc

    def test_backend_depends_on_chromadb(self):
        depends = _load_compose()["services"]["backend"].get("depends_on", {})
        assert "chromadb" in depends, "backend does not depend on chromadb"

    def test_backend_waits_for_chromadb_healthy(self):
        depends = _load_compose()["services"]["backend"]["depends_on"]
        condition = depends["chromadb"].get("condition")
        assert condition == "service_healthy", (
            f"Expected condition: service_healthy, got: {condition!r}"
        )

    def test_ollama_removed(self):
        """Ollama has been replaced by user-provided API keys (Phase 4)."""
        compose = _load_compose()
        assert "ollama" not in compose["services"]

    # ── #25 — data/ volume ───────────────────────────────────────────────────

    def test_data_volume_mounted_on_backend(self):
        volumes = _load_compose()["services"]["backend"].get("volumes", [])
        mounted = any("./data:/app/data" in str(v) for v in volumes)
        assert mounted, "backend is missing ./data:/app/data volume mount"

    def test_chromadb_data_volume_mounted(self):
        volumes = _load_compose()["services"]["chromadb"].get("volumes", [])
        mounted = any("data/chroma" in str(v) for v in volumes)
        assert mounted, "chromadb is missing data/chroma volume mount"

    # ── #26 — read-only mounts ───────────────────────────────────────────────

    def test_llm_data_mounted_readonly(self):
        volumes = _load_compose()["services"]["backend"].get("volumes", [])
        llm_mounts = [str(v) for v in volumes if "llm_data" in str(v)]
        assert llm_mounts, "No llm_data mount found on backend"
        assert all(":ro" in m for m in llm_mounts), (
            f"llm_data mount is not read-only: {llm_mounts}"
        )

    def test_gene_data_mounted_readonly(self):
        volumes = _load_compose()["services"]["backend"].get("volumes", [])
        gene_mounts = [str(v) for v in volumes if "gene_data" in str(v)]
        assert gene_mounts, "No gene_data mount found on backend"
        assert all(":ro" in m for m in gene_mounts), (
            f"gene_data mount is not read-only: {gene_mounts}"
        )

    def test_jsonl_chunks_dir_env_set(self):
        env = _load_compose()["services"]["backend"].get("environment", [])
        env_str = " ".join(str(e) for e in env)
        assert "JSONL_CHUNKS_DIR" in env_str

    def test_jsonl_chunks_dir_points_to_app(self):
        env = _load_compose()["services"]["backend"].get("environment", [])
        chunks_entries = [str(e) for e in env if "JSONL_CHUNKS_DIR" in str(e)]
        assert any("/app/llm_data/chunks" in e for e in chunks_entries)


# ════════════════════════════════════════════════════════════════════════════════
# #27 — docker-compose.dev.yml: proper hot-reload override
# ════════════════════════════════════════════════════════════════════════════════

class TestDevComposeOverride:

    def test_dev_compose_parses(self):
        dev = _load_compose("docker-compose.dev.yml")
        assert isinstance(dev, dict)

    def test_dev_backend_has_reload_command(self):
        dev = _load_compose("docker-compose.dev.yml")
        cmd = dev["services"]["backend"].get("command", "")
        assert "--reload" in cmd, "dev backend command should use --reload"

    def test_dev_backend_mounts_source(self):
        dev = _load_compose("docker-compose.dev.yml")
        volumes = dev["services"]["backend"].get("volumes", [])
        assert any("./backend:/app" in str(v) for v in volumes), (
            "dev backend should mount ./backend:/app for hot-reload"
        )

    def test_dev_backend_mounts_data(self):
        dev = _load_compose("docker-compose.dev.yml")
        volumes = dev["services"]["backend"].get("volumes", [])
        assert any("./data:/app/data" in str(v) for v in volumes)

    def test_dev_frontend_has_vite_port(self):
        dev = _load_compose("docker-compose.dev.yml")
        ports = dev["services"]["frontend"].get("ports", [])
        assert any("5173" in str(p) for p in ports), (
            "dev frontend should expose Vite's port 5173"
        )

    def test_dev_frontend_has_dev_build_target(self):
        dev = _load_compose("docker-compose.dev.yml")
        build = dev["services"]["frontend"].get("build", {})
        target = build.get("target") if isinstance(build, dict) else None
        assert target == "dev", (
            f"dev frontend build target should be 'dev', got {target!r}"
        )

    def test_dev_frontend_mounts_source(self):
        dev = _load_compose("docker-compose.dev.yml")
        volumes = dev["services"]["frontend"].get("volumes", [])
        assert any("./frontend/src" in str(v) for v in volumes)


# ════════════════════════════════════════════════════════════════════════════════
# #27 — Frontend Dockerfile: dev stage exists
# ════════════════════════════════════════════════════════════════════════════════

class TestFrontendDockerfile:

    def setup_method(self):
        self.content = _read_dockerfile("frontend/Dockerfile")

    def test_dev_stage_declared(self):
        assert "AS dev" in self.content, "Frontend Dockerfile missing 'AS dev' stage"

    def test_dev_stage_exposes_5173(self):
        lines = self.content.splitlines()
        in_dev = False
        for line in lines:
            if "AS dev" in line:
                in_dev = True
            if in_dev and line.startswith("FROM") and "AS dev" not in line:
                in_dev = False
            if in_dev and "EXPOSE" in line and "5173" in line:
                return
        pytest.fail("dev stage does not EXPOSE 5173")

    def test_dev_stage_runs_npm_dev(self):
        lines = self.content.splitlines()
        in_dev = False
        for line in lines:
            if "AS dev" in line:
                in_dev = True
            if in_dev and line.startswith("FROM") and "AS dev" not in line:
                in_dev = False
            if in_dev and "npm" in line and "dev" in line and "CMD" in line:
                return
        pytest.fail("dev stage CMD should run 'npm run dev'")

    def test_build_stage_still_exists(self):
        assert "AS build" in self.content

    def test_nginx_production_stage_still_exists(self):
        assert "nginx" in self.content


# ════════════════════════════════════════════════════════════════════════════════
# #22 — CORS: no wildcard fallback, correct origins allowed
# ════════════════════════════════════════════════════════════════════════════════

class TestCORSConfig:

    def test_localhost_5173_allowed(self):
        r = client.get("/", headers={"Origin": "http://localhost:5173"})
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_localhost_3000_allowed(self):
        r = client.get("/", headers={"Origin": "http://localhost:3000"})
        assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_unknown_origin_not_reflected(self):
        r = client.get("/", headers={"Origin": "http://evil.example.com"})
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao != "http://evil.example.com", (
            "Unknown origin should not be reflected in ACAO header"
        )

    def test_no_wildcard_returned(self):
        for origin in ["http://localhost:5173", "http://attacker.com"]:
            r = client.get("/", headers={"Origin": origin})
            assert r.headers.get("access-control-allow-origin") != "*", (
                "CORS must never return wildcard '*'"
            )

    def test_preflight_allowed_origin(self):
        r = client.options(
            "/",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert r.status_code in (200, 204)
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_preflight_disallowed_origin(self):
        r = client.options(
            "/",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        acao = r.headers.get("access-control-allow-origin", "")
        assert acao != "http://evil.example.com"


# ════════════════════════════════════════════════════════════════════════════════
# #25 — Filesystem: data/ directory structure
# ════════════════════════════════════════════════════════════════════════════════

class TestFilesystem:

    def test_data_directory_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "data")), \
            "data/ directory not found at project root"

    def test_data_chroma_directory_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "data", "chroma")), \
            "data/chroma/ directory not found"

    def test_data_gitkeep_exists(self):
        assert os.path.isfile(os.path.join(PROJECT_ROOT, "data", ".gitkeep"))

    def test_data_chroma_gitkeep_exists(self):
        assert os.path.isfile(os.path.join(PROJECT_ROOT, "data", "chroma", ".gitkeep"))

    def test_gitignore_excludes_chroma_contents(self):
        gitignore = os.path.join(PROJECT_ROOT, ".gitignore")
        content = open(gitignore).read()
        assert "data/chroma/*" in content, \
            ".gitignore should exclude data/chroma/* contents"

    def test_gitignore_excludes_sqlite(self):
        gitignore = os.path.join(PROJECT_ROOT, ".gitignore")
        content = open(gitignore).read()
        assert "data/db.sqlite" in content or "*.sqlite" in content, \
            ".gitignore should exclude SQLite database file"

    def test_gitignore_preserves_chroma_gitkeep(self):
        gitignore = os.path.join(PROJECT_ROOT, ".gitignore")
        content = open(gitignore).read()
        assert "!data/chroma/.gitkeep" in content, \
            ".gitignore should not exclude data/chroma/.gitkeep"

    def test_llm_data_dir_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "llm_data")), \
            "llm_data/ directory not found (needed for read-only mount)"

    def test_gene_data_dir_exists(self):
        assert os.path.isdir(os.path.join(BACKEND_DIR, "gene_data")), \
            "backend/gene_data/ directory not found (needed for read-only mount)"


# ════════════════════════════════════════════════════════════════════════════════
# Docker runtime tests — auto-skipped if containers not running
# ════════════════════════════════════════════════════════════════════════════════

class TestDockerRuntime:

    @docker_runtime
    def test_chromadb_heartbeat_responds(self):
        result = _docker_exec("chromadb", "curl -sf http://localhost:8001/api/v1/heartbeat")
        assert result.returncode == 0, \
            f"ChromaDB heartbeat failed: {result.stderr}"

    @docker_runtime
    def test_backend_root_endpoint_responds(self):
        result = _docker_exec("backend", "curl -sf http://localhost:8000/")
        assert result.returncode == 0, \
            f"Backend root endpoint did not respond: {result.stderr}"

    @docker_runtime
    def test_jsonl_chunks_dir_env_in_container(self):
        result = _docker_exec("backend", "echo $JSONL_CHUNKS_DIR")
        assert "/app/llm_data/chunks" in result.stdout, \
            f"JSONL_CHUNKS_DIR not set correctly in container: {result.stdout!r}"

    @docker_runtime
    def test_llm_data_is_readonly_in_container(self):
        result = _docker_exec("backend", "touch /app/llm_data/.write_test 2>&1; echo exit:$?")
        assert "Read-only" in result.stdout or result.returncode != 0, \
            "llm_data mount should be read-only but a write succeeded"

    @docker_runtime
    def test_gene_data_is_readonly_in_container(self):
        result = _docker_exec("backend", "touch /app/gene_data/.write_test 2>&1; echo exit:$?")
        assert "Read-only" in result.stdout or result.returncode != 0, \
            "gene_data mount should be read-only but a write succeeded"

    @docker_runtime
    def test_data_dir_is_writable_in_container(self):
        result = _docker_exec(
            "backend",
            "touch /app/data/.write_test && rm /app/data/.write_test && echo ok"
        )
        assert "ok" in result.stdout, \
            f"data/ mount should be writable: {result.stderr}"

    @docker_runtime
    def test_data_dir_is_on_host(self):
        """Write a sentinel file inside the container and confirm it appears on the host."""
        _docker_exec("backend", "echo phase1 > /app/data/.sentinel")
        sentinel = os.path.join(PROJECT_ROOT, "data", ".sentinel")
        try:
            assert os.path.isfile(sentinel), \
                "File written inside container not found on host — volume not mounted correctly"
            assert open(sentinel).read().strip() == "phase1"
        finally:
            if os.path.isfile(sentinel):
                os.remove(sentinel)

    @docker_runtime
    def test_chromadb_port_reachable_from_backend(self):
        result = _docker_exec("backend", "curl -sf http://chromadb:8001/api/v1/heartbeat")
        assert result.returncode == 0, \
            "Backend cannot reach ChromaDB on internal network — check service names"
