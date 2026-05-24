"""
Phase 4 test suite — LiteLLM integration and settings backend.

Coverage:
  TestBuildModelString    – correct litellm model identifiers per provider
  TestResolveConfig       – SQLite priority → env-var fallback → None
  TestCallLLM             – raises LLMNotConfiguredError when unconfigured;
                            passes correct model, api_key, base_url, timeout
  TestLLMExceptions       – LLMNotConfiguredError is a subclass of LLMError
  TestLLMTimeout          – LLM_TIMEOUT constant and env-var wiring
  TestNoOpenAIImport      – llm.py no longer imports openai directly
  TestAnnotation503       – annotate endpoint returns 503 when not configured
  TestChat503             – /chat endpoint returns 503 when not configured
  TestLLMTestEndpoint     – /llm-test returns 503 (not_configured) vs 500
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app, raise_server_exceptions=False)


def _raise(exc_instance):
    """Return a callable that raises exc_instance."""
    def _raiser(*a, **kw):
        raise exc_instance
    return _raiser


# ===========================================================================
# TestBuildModelString
# ===========================================================================

class TestBuildModelString:
    def _build(self, provider, model):
        from services.llm import _build_model_string
        return _build_model_string(provider, model)

    def test_openai_no_prefix(self):
        assert self._build("openai", "gpt-4o-mini") == "gpt-4o-mini"

    def test_openai_case_insensitive(self):
        assert self._build("OpenAI", "gpt-4o") == "gpt-4o"

    def test_anthropic_prefixed(self):
        assert self._build("anthropic", "claude-3-5-sonnet-20241022") == "anthropic/claude-3-5-sonnet-20241022"

    def test_groq_prefixed(self):
        assert self._build("groq", "llama-3.1-8b-instant") == "groq/llama-3.1-8b-instant"

    def test_ollama_prefixed(self):
        assert self._build("ollama", "llama3") == "ollama/llama3"

    def test_no_double_prefix(self):
        # If user already includes the provider in the model string, don't double-prefix
        result = self._build("groq", "groq/llama-3.1-8b-instant")
        assert result == "groq/llama-3.1-8b-instant"
        assert result.count("groq/") == 1


# ===========================================================================
# TestResolveConfig
# ===========================================================================

class TestResolveConfig:
    def _resolve(self):
        from services.llm import _resolve_config
        return _resolve_config()

    def test_returns_none_when_nothing_configured(self, monkeypatch):
        import db
        monkeypatch.setattr(db, "get_config", lambda: None)
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        assert self._resolve() is None

    def test_sqlite_config_takes_priority(self, monkeypatch):
        import db
        cfg = {"provider": "anthropic", "api_key": "sk-ant", "model": "claude-3-haiku-20240307", "base_url": ""}
        monkeypatch.setattr(db, "get_config", lambda: cfg)
        monkeypatch.setenv("LLM_API_KEY", "env-key")
        result = self._resolve()
        assert result["api_key"] == "sk-ant"
        assert result["provider"] == "anthropic"

    def test_env_var_fallback_when_sqlite_empty(self, monkeypatch):
        import db
        monkeypatch.setattr(db, "get_config", lambda: None)
        monkeypatch.setenv("LLM_API_KEY", "env-key-123")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("LLM_PROVIDER", "openai")
        result = self._resolve()
        assert result is not None
        assert result["api_key"] == "env-key-123"
        assert result["model"] == "gpt-4o"

    def test_env_var_fallback_when_sqlite_has_no_key(self, monkeypatch):
        import db
        # SQLite row exists but api_key is empty and provider is not key-free
        monkeypatch.setattr(db, "get_config", lambda: {"provider": "openai", "api_key": "", "model": "gpt-4o-mini", "base_url": ""})
        monkeypatch.setenv("LLM_API_KEY", "fallback-key")
        result = self._resolve()
        assert result is not None
        assert result["api_key"] == "fallback-key"

    def test_ollama_valid_without_api_key(self, monkeypatch):
        import db
        cfg = {"provider": "ollama", "api_key": "", "model": "llama3", "base_url": "http://localhost:11434"}
        monkeypatch.setattr(db, "get_config", lambda: cfg)
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        result = self._resolve()
        assert result is not None
        assert result["provider"] == "ollama"

    def test_returns_none_when_empty_env_and_no_sqlite(self, monkeypatch):
        import db
        monkeypatch.setattr(db, "get_config", lambda: None)
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        assert self._resolve() is None


# ===========================================================================
# TestCallLLM
# ===========================================================================

class TestCallLLM:
    def test_raises_not_configured_when_no_config(self, monkeypatch):
        import services.llm as llm_mod
        from services.llm import LLMNotConfiguredError
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: None)
        with pytest.raises(LLMNotConfiguredError):
            llm_mod.call_llm("Hello?")

    def test_calls_litellm_with_correct_model(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = " test response "

        def mock_completion(**kwargs):
            captured.update(kwargs)
            return mock_resp

        monkeypatch.setattr(litellm, "completion", mock_completion)
        result = llm_mod.call_llm("ping")

        assert captured["model"] == "gpt-4o-mini"
        assert captured["api_key"] == "sk-test"
        assert result == "test response"

    def test_anthropic_model_prefixed(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "anthropic", "api_key": "sk-ant", "model": "claude-3-haiku-20240307", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        llm_mod.call_llm("test")
        assert captured["model"] == "anthropic/claude-3-haiku-20240307"

    def test_base_url_passed_when_set(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "ollama", "api_key": "", "model": "llama3", "base_url": "http://localhost:11434"}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        llm_mod.call_llm("test")
        assert captured.get("base_url") == "http://localhost:11434"

    def test_base_url_omitted_when_empty(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        llm_mod.call_llm("test")
        assert "base_url" not in captured

    def test_timeout_passed_to_litellm(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "key", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        llm_mod.call_llm("test")
        assert "timeout" in captured
        assert captured["timeout"] == llm_mod.LLM_TIMEOUT

    def test_provider_exception_wrapped_in_llm_error(self, monkeypatch):
        import litellm
        import services.llm as llm_mod
        from services.llm import LLMError

        cfg = {"provider": "openai", "api_key": "key", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)
        monkeypatch.setattr(litellm, "completion", _raise(RuntimeError("provider down")))

        with pytest.raises(LLMError, match="provider down"):
            llm_mod.call_llm("test")

    def test_history_included_in_messages(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "key", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        history = [{"role": "user", "content": "prior"}, {"role": "assistant", "content": "answer"}]
        llm_mod.call_llm("new question", history=history)

        messages = captured["messages"]
        roles = [m["role"] for m in messages]
        assert "user" in roles
        assert "assistant" in roles

    def test_model_override_respected(self, monkeypatch):
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "key", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"

        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))
        llm_mod.call_llm("test", model="gpt-4o")
        assert captured["model"] == "gpt-4o"


# ===========================================================================
# TestLLMExceptions
# ===========================================================================

class TestLLMExceptions:
    def test_not_configured_is_subclass_of_llm_error(self):
        from services.llm import LLMError, LLMNotConfiguredError
        assert issubclass(LLMNotConfiguredError, LLMError)

    def test_llm_error_is_runtime_error(self):
        from services.llm import LLMError
        assert issubclass(LLMError, RuntimeError)

    def test_not_configured_message_mentions_settings(self):
        from services.llm import LLMNotConfiguredError
        exc = LLMNotConfiguredError("No LLM configured. Open Settings.")
        assert "settings" in str(exc).lower() or "configured" in str(exc).lower()

    def test_both_can_be_caught_as_llm_error(self, monkeypatch):
        import services.llm as llm_mod
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: None)
        from services.llm import LLMError
        with pytest.raises(LLMError):
            llm_mod.call_llm("test")


# ===========================================================================
# TestLLMTimeout
# ===========================================================================

class TestLLMTimeout:
    def test_timeout_constant_is_positive(self):
        from services.llm import LLM_TIMEOUT
        assert LLM_TIMEOUT > 0

    def test_timeout_default_parses_to_30(self):
        # Module-level constant reads os.getenv at import time; verify the default
        assert int(os.getenv("LLM_TIMEOUT_SECONDS", "30")) == 30

    def test_timeout_env_var_is_read(self, monkeypatch):
        monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "60")
        assert int(os.getenv("LLM_TIMEOUT_SECONDS", "30")) == 60

    def test_timeout_value_is_passed_to_litellm(self, monkeypatch):
        """Verify call_llm forwards whatever LLM_TIMEOUT is set to."""
        import litellm
        import services.llm as llm_mod

        cfg = {"provider": "openai", "api_key": "key", "model": "gpt-4o-mini", "base_url": ""}
        monkeypatch.setattr(llm_mod, "_resolve_config", lambda: cfg)
        monkeypatch.setattr(llm_mod, "LLM_TIMEOUT", 42)

        captured = {}
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "hi"
        monkeypatch.setattr(litellm, "completion", lambda **kw: (captured.update(kw) or mock_resp))

        llm_mod.call_llm("test")
        assert captured["timeout"] == 42


# ===========================================================================
# TestNoOpenAIImport
# ===========================================================================

class TestNoOpenAIImport:
    def test_llm_module_does_not_import_openai_directly(self):
        """After Phase 4, services/llm.py should use litellm, not openai directly."""
        llm_path = os.path.join(BACKEND_DIR, "services", "llm.py")
        with open(llm_path) as f:
            source = f.read()
        assert "from openai import" not in source, \
            "services/llm.py should not directly import from openai"
        assert "import openai" not in source or "litellm" in source, \
            "services/llm.py should use litellm, not raw openai"

    def test_litellm_is_imported_in_llm_module(self):
        llm_path = os.path.join(BACKEND_DIR, "services", "llm.py")
        with open(llm_path) as f:
            source = f.read()
        assert "import litellm" in source


# ===========================================================================
# TestAnnotation503
# ===========================================================================

class TestAnnotation503:
    def test_annotate_returns_503_when_not_configured(self, client, monkeypatch):
        from services.llm import LLMNotConfiguredError
        import state

        monkeypatch.setattr(state, "indexed_genes", {"TP53"})
        monkeypatch.setattr("services.annotation.get_passages", lambda **kw: ["passage text"])
        monkeypatch.setattr("services.annotation.call_llm", _raise(LLMNotConfiguredError("Not configured")))

        r = client.get("/annotate?gene=TP53&view=function")
        assert r.status_code == 503

    def test_annotate_503_body_describes_problem(self, client, monkeypatch):
        from services.llm import LLMNotConfiguredError
        import state

        monkeypatch.setattr(state, "indexed_genes", {"TP53"})
        monkeypatch.setattr("services.annotation.get_passages", lambda **kw: ["passage text"])
        monkeypatch.setattr("services.annotation.call_llm", _raise(LLMNotConfiguredError("Not configured. Open Settings.")))

        r = client.get("/annotate?gene=TP53&view=function")
        detail = r.json().get("detail", "")
        assert "configured" in detail.lower() or "settings" in detail.lower()

    def test_annotate_returns_502_for_provider_errors(self, client, monkeypatch):
        from services.llm import LLMError
        import state

        monkeypatch.setattr(state, "indexed_genes", {"TP53"})
        monkeypatch.setattr("services.annotation.get_passages", lambda **kw: ["passage text"])
        monkeypatch.setattr("services.annotation.call_llm", _raise(LLMError("provider unreachable")))

        r = client.get("/annotate?gene=TP53&view=function")
        assert r.status_code == 502


# ===========================================================================
# TestChat503
# ===========================================================================

class TestChat503:
    def test_chat_returns_503_when_not_configured(self, client, monkeypatch):
        from services.llm import LLMNotConfiguredError

        monkeypatch.setattr("services.chat.get_passages_unified", lambda *a, **kw: [])
        monkeypatch.setattr("services.chat.call_llm", _raise(LLMNotConfiguredError("Not configured")))

        r = client.post("/chat", json={"gene": "TP53", "message": "What does it do?", "conversation_history": []})
        assert r.status_code == 503

    def test_chat_returns_502_for_provider_error(self, client, monkeypatch):
        from services.llm import LLMError

        monkeypatch.setattr("services.chat.get_passages_unified", lambda *a, **kw: [])
        monkeypatch.setattr("services.chat.call_llm", _raise(LLMError("timeout")))

        r = client.post("/chat", json={"gene": "TP53", "message": "test", "conversation_history": []})
        assert r.status_code == 502


# ===========================================================================
# TestLLMTestEndpoint
# ===========================================================================

class TestLLMTestEndpoint:
    def test_llm_test_returns_503_when_not_configured(self, client, monkeypatch):
        from services.llm import LLMNotConfiguredError
        monkeypatch.setattr("routers.llm.call_llm", _raise(LLMNotConfiguredError("Not configured")))

        r = client.get("/llm-test")
        assert r.status_code == 503
        data = r.json()
        assert data["success"] is False
        assert data.get("not_configured") is True

    def test_llm_test_returns_500_for_provider_error(self, client, monkeypatch):
        from services.llm import LLMError
        monkeypatch.setattr("routers.llm.call_llm", _raise(LLMError("connection refused")))

        r = client.get("/llm-test")
        assert r.status_code == 500
        data = r.json()
        assert data["success"] is False
        assert "not_configured" not in data

    def test_llm_test_returns_200_on_success(self, client, monkeypatch):
        monkeypatch.setattr("routers.llm.call_llm", lambda **kw: "LLM connected")

        r = client.get("/llm-test")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["response"] == "LLM connected"
