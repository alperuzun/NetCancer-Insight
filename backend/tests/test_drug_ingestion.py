"""
Unit tests for the scripts/drugs package.

These tests deliberately avoid any network call. They exercise:
  - chunk formatting (with and without each data source)
  - confidence-score filter behaviour
  - HGNC mapping load
  - JSONL writer + idempotency tracker
  - the per-gene pipeline using disk-cached fixtures
"""
import json
import os
import shutil
import sys

import pytest

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_TESTS_DIR)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from scripts.drugs import chunks as chunks_mod
from scripts.drugs import dgidb as dgidb_mod
from scripts.drugs import opentargets as opentargets_mod
from scripts.drugs import pharos as pharos_mod
from scripts.drugs import symbol_mapping
from scripts.drugs import jsonl_writer
from scripts.drugs import pipeline as pipeline_mod

FIXTURES = os.path.join(_TESTS_DIR, "fixtures")


@pytest.fixture
def cache_dirs(tmp_path):
    """Pre-populated raw-response cache so pipeline.run_for_gene works offline."""
    base = tmp_path / "raw"
    for sub in ("dgidb", "opentargets", "pharos"):
        (base / sub).mkdir(parents=True, exist_ok=True)

    shutil.copy(os.path.join(FIXTURES, "dgidb_TP53.json"), base / "dgidb" / "TP53.json")
    shutil.copy(os.path.join(FIXTURES, "dgidb_OR1A1.json"), base / "dgidb" / "OR1A1.json")
    shutil.copy(
        os.path.join(FIXTURES, "opentargets_ENSG00000141510.json"),
        base / "opentargets" / "ENSG00000141510.json",
    )
    shutil.copy(os.path.join(FIXTURES, "pharos_TP53.json"), base / "pharos" / "TP53.json")
    return {
        "dgidb":       str(base / "dgidb"),
        "opentargets": str(base / "opentargets"),
        "pharos":      str(base / "pharos"),
    }


# ── Chunk formatting ─────────────────────────────────────────────────────────

class TestFormatChunks:
    def _normalised_tp53(self):
        with open(os.path.join(FIXTURES, "dgidb_TP53.json")) as fh:
            raw = json.load(fh)
        return [dgidb_mod.normalise_interaction(i) for i in raw]

    def _opentargets_summary(self):
        with open(os.path.join(FIXTURES, "opentargets_ENSG00000141510.json")) as fh:
            return opentargets_mod.summarise(json.load(fh))

    def test_full_data_produces_multiple_chunks(self):
        result = chunks_mod.format_chunks(
            "TP53",
            self._normalised_tp53(),
            self._opentargets_summary(),
            tdl="Tchem",
        )
        assert len(result) >= 3
        assert all(c["type"] == "drug" for c in result)
        assert all(c["gene"] == "TP53" for c in result)

    def test_filters_low_confidence_unapproved_interactions(self):
        result = chunks_mod.format_chunks("TP53", self._normalised_tp53(), None, tdl=None)
        # "WeakAssociation" has score 0.21 and is not approved → must be dropped
        assert not any("WeakAssociation" in c["text"] for c in result)

    def test_skips_drug_named_unknown(self):
        result = chunks_mod.format_chunks("TP53", self._normalised_tp53(), None, tdl=None)
        assert not any("targeted by unknown" in c["text"].lower() for c in result)

    def test_no_drug_data_returns_empty(self):
        result = chunks_mod.format_chunks("OR1A1", [], None, tdl=None)
        assert result == []

    def test_only_tdl_still_produces_one_chunk(self):
        result = chunks_mod.format_chunks("OR1A1", [], None, tdl="Tdark")
        assert len(result) == 1
        assert "Tdark" in result[0]["text"]

    def test_chunk_text_length_bounds(self):
        result = chunks_mod.format_chunks(
            "TP53",
            self._normalised_tp53(),
            self._opentargets_summary(),
            tdl="Tchem",
        )
        for chunk in result:
            assert chunks_mod.MIN_CHUNK_CHARS <= len(chunk["text"]) <= chunks_mod.MAX_CHUNK_CHARS

    def test_dedup_within_one_gene(self):
        normalised = self._normalised_tp53()
        # Push the same approved interaction twice; dedupe by concept ID should kick in
        normalised.append(normalised[0])
        result = chunks_mod.format_chunks("TP53", normalised, None, tdl=None)
        texts = [c["text"] for c in result]
        assert len(texts) == len(set(texts))


# ── Source-specific normalisers ──────────────────────────────────────────────

class TestNormalisers:
    def test_dgidb_normalise_handles_missing_fields(self):
        n = dgidb_mod.normalise_interaction({})
        assert n["drug_name"] == ""
        assert n["approved"] is False
        assert n["score"] == 0.0
        assert n["sources"] == []

    def test_opentargets_summarise_extracts_max_phase(self):
        with open(os.path.join(FIXTURES, "opentargets_ENSG00000141510.json")) as fh:
            summary = opentargets_mod.summarise(json.load(fh))
        assert summary["max_phase"] == 3
        assert any(d["name"] == "APR-246" for d in summary["known_drugs"])

    def test_pharos_describe_known_label(self):
        text = pharos_mod.describe("Tclin")
        assert "Tclin" in text and "approved" in text.lower()

    def test_pharos_describe_unknown(self):
        text = pharos_mod.describe(None)
        assert "unknown" in text.lower()


# ── Symbol mapping ───────────────────────────────────────────────────────────

class TestSymbolMapping:
    def test_load_mapping_from_fixture(self):
        mapping = symbol_mapping.load_mapping(os.path.join(FIXTURES, "hgnc_to_ensembl_sample.tsv"))
        assert mapping["TP53"] == "ENSG00000141510"
        assert mapping["EGFR"] == "ENSG00000146648"

    def test_resolve_case_insensitive(self):
        mapping = symbol_mapping.load_mapping(os.path.join(FIXTURES, "hgnc_to_ensembl_sample.tsv"))
        assert symbol_mapping.resolve("tp53", mapping) == "ENSG00000141510"

    def test_missing_file_returns_empty_dict(self, tmp_path):
        assert symbol_mapping.load_mapping(str(tmp_path / "does-not-exist.tsv")) == {}


# ── JSONL writer + tracker ───────────────────────────────────────────────────

class TestJsonlWriter:
    def test_write_chunks_appends(self, tmp_path):
        out = tmp_path / "out" / "drug.jsonl"
        c1 = [{"gene": "A", "type": "drug", "source": "X", "text": "A" * 40}]
        c2 = [{"gene": "B", "type": "drug", "source": "X", "text": "B" * 40}]
        assert jsonl_writer.write_chunks(str(out), c1) == 1
        assert jsonl_writer.write_chunks(str(out), c2) == 1
        with open(out) as fh:
            lines = fh.readlines()
        assert len(lines) == 2

    def test_tracker_round_trip(self, tmp_path):
        tracker = tmp_path / "tracker.txt"
        jsonl_writer.mark_completed(str(tracker), "TP53")
        jsonl_writer.mark_completed(str(tracker), "EGFR")
        assert jsonl_writer.load_completed_genes(str(tracker)) == {"TP53", "EGFR"}

    def test_validate_chunk_catches_bad_schema(self):
        assert jsonl_writer.validate_chunk({}) != []
        good = {"gene": "TP53", "type": "drug", "source": "DGIdb", "text": "x" * 50}
        assert jsonl_writer.validate_chunk(good) == []
        bad_type = {"gene": "TP53", "type": "function", "source": "DGIdb", "text": "x" * 50}
        assert jsonl_writer.validate_chunk(bad_type) != []


# ── Pipeline integration (offline) ───────────────────────────────────────────

class TestPipelineOffline:
    def test_run_for_gene_with_fixtures(self, cache_dirs):
        mapping = symbol_mapping.load_mapping(os.path.join(FIXTURES, "hgnc_to_ensembl_sample.tsv"))
        result = pipeline_mod.run_for_gene(
            "TP53",
            mapping=mapping,
            cache_dirs=cache_dirs,
            use_network=False,
            sleep_seconds=0.0,
        )
        assert result.gene == "TP53"
        assert result.had_dgidb
        assert result.had_opentargets
        assert result.had_pharos
        assert result.chunks
        for chunk in result.chunks:
            assert chunk["type"] == "drug"
            assert chunk["gene"] == "TP53"

    def test_run_for_gene_no_data(self, cache_dirs):
        mapping = symbol_mapping.load_mapping(os.path.join(FIXTURES, "hgnc_to_ensembl_sample.tsv"))
        result = pipeline_mod.run_for_gene(
            "OR1A1",
            mapping=mapping,
            cache_dirs=cache_dirs,
            use_network=False,
            sleep_seconds=0.0,
        )
        assert result.gene == "OR1A1"
        assert result.chunks == []
        assert not result.had_dgidb
        assert not result.had_opentargets
        assert not result.had_pharos

    def test_run_for_gene_without_mapping_skips_opentargets(self, cache_dirs):
        result = pipeline_mod.run_for_gene(
            "TP53",
            mapping={},  # no symbol mapping → no Open Targets call
            cache_dirs=cache_dirs,
            use_network=False,
            sleep_seconds=0.0,
        )
        assert result.had_dgidb
        assert not result.had_opentargets
        # Should still produce at least one chunk from DGIdb + Pharos
        assert result.chunks
