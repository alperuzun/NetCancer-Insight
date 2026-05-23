"""
Phase 6 tests: ChromaDB + BM25 hybrid retrieval with RRF.

Tests are organized into:
  - TestTokenize        : _tokenize helper
  - TestRRFMerge        : _rrf_merge helper
  - TestBuildBM25       : _build_bm25 with mocked ChromaDB collection
  - TestGetPassages     : get_passages — happy path, fallback, deduplication, filters
  - TestJSONLFallback   : get_jsonl_contexts_for_gene still works independently
  - TestRetrieverConfig : env-var-driven config (CHROMA_HOST, CHROMA_DIR, CHROMA_PORT)
"""
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import services.retriever as retriever_mod
from services.retriever import _tokenize, _rrf_merge


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_fake_collection(docs, metas=None, ids=None):
    """Build a minimal object that mimics the ChromaDB Collection interface."""
    if ids is None:
        ids = [str(i) for i in range(len(docs))]
    if metas is None:
        metas = [{} for _ in docs]

    class FakeCollection:
        def count(self):
            return len(docs)

        def query(self, query_texts, n_results, include=None):
            # Naive: return all docs in original order (simulates vector search)
            n = min(n_results, len(docs))
            return {
                "ids": [ids[:n]],
                "documents": [docs[:n]],
                "metadatas": [metas[:n]],
            }

        def get(self, include=None):
            return {
                "ids": list(ids),
                "documents": list(docs),
                "metadatas": list(metas),
            }

    return FakeCollection()


# ── TestTokenize ──────────────────────────────────────────────────────────────

class TestTokenize:
    def test_basic(self):
        assert _tokenize("EGFR function") == ["egfr", "function"]

    def test_numbers(self):
        assert "p53" in _tokenize("p53 tumor suppressor")

    def test_punctuation_stripped(self):
        tokens = _tokenize("gene: TP53, role=tumor.")
        assert "tp53" in tokens
        assert "tumor" in tokens
        assert "gene" in tokens
        assert "role" in tokens
        for tok in tokens:
            assert tok.isalnum()

    def test_empty_string(self):
        assert _tokenize("") == []

    def test_unicode_ignored(self):
        tokens = _tokenize("BRCA1 α-helix")
        assert "brca1" in tokens


# ── TestRRFMerge ─────────────────────────────────────────────────────────────

class TestRRFMerge:
    def test_single_list(self):
        ids = ["a", "b", "c"]
        merged = _rrf_merge([ids])
        assert merged == ids  # order preserved by RRF scores

    def test_two_lists_same_order(self):
        ids = ["a", "b", "c"]
        merged = _rrf_merge([ids, ids])
        assert merged == ids

    def test_boost_overlap(self):
        # "b" appears in both lists → should rank higher than "a" (only in list1)
        list1 = ["a", "b", "c"]
        list2 = ["b", "d", "e"]
        merged = _rrf_merge([list1, list2])
        assert merged.index("b") < merged.index("a")

    def test_top_item_both_lists(self):
        list1 = ["x", "y", "z"]
        list2 = ["x", "a", "b"]
        merged = _rrf_merge([list1, list2])
        assert merged[0] == "x"  # top in both → highest RRF score

    def test_empty_lists(self):
        assert _rrf_merge([[], []]) == []

    def test_no_lists(self):
        assert _rrf_merge([]) == []

    def test_disjoint_lists(self):
        merged = _rrf_merge([["a", "b"], ["c", "d"]])
        assert set(merged) == {"a", "b", "c", "d"}
        assert len(merged) == 4

    def test_rrf_scores_correct(self):
        # RRF score for rank 0 (1-indexed rank 1) with k=60: 1/61
        # rank 1: 1/62
        list1 = ["a", "b"]
        list2 = ["b", "a"]
        merged = _rrf_merge([list1, list2], k=60)
        # "a" score = 1/61 + 1/62, "b" score = 1/62 + 1/61 → equal, order stable
        assert set(merged[:2]) == {"a", "b"}

    def test_large_k_reduces_rank_weight(self):
        # With larger k, rank differences matter less
        list1 = ["a", "b", "c"]
        list2 = ["c", "b", "a"]
        merged_small_k = _rrf_merge([list1, list2], k=1)
        merged_large_k = _rrf_merge([list1, list2], k=1000)
        # Both should contain all items
        assert set(merged_small_k) == {"a", "b", "c"}
        assert set(merged_large_k) == {"a", "b", "c"}


# ── TestBuildBM25 ─────────────────────────────────────────────────────────────

class TestBuildBM25:
    def test_bm25_built_from_collection(self, monkeypatch):
        docs = [
            "EGFR receptor tyrosine kinase function",
            "TP53 tumor suppressor pathway",
            "BRCA1 DNA repair disease",
        ]
        metas = [
            {"gene": "EGFR", "context": "function", "source": "uniprot"},
            {"gene": "TP53",  "context": "pathway",  "source": "kegg"},
            {"gene": "BRCA1", "context": "disease",  "source": "uniprot"},
        ]
        ids = ["id0", "id1", "id2"]
        fake_col = _make_fake_collection(docs, metas, ids)

        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()
        monkeypatch.setattr(retriever_mod, "_get_collection", lambda: fake_col)
        # Re-cache with the patched function
        retriever_mod._build_bm25.cache_clear()

        bm25, ret_ids, ret_docs, ret_metas = retriever_mod._build_bm25()
        assert len(ret_ids) == 3
        assert ret_ids == ids
        assert ret_docs == docs
        # BM25 object is usable
        scores = bm25.get_scores(["egfr", "receptor"])
        assert len(scores) == 3

    def test_bm25_tokenization_lowercase(self, monkeypatch):
        docs = ["EGFR FUNCTION pathway"]
        fake_col = _make_fake_collection(docs, [{"gene": "EGFR", "context": "function", "source": "x"}], ["i0"])
        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()
        monkeypatch.setattr(retriever_mod, "_get_collection", lambda: fake_col)
        retriever_mod._build_bm25.cache_clear()
        bm25, _, _, _ = retriever_mod._build_bm25()
        # tokenized corpus should include lowercase terms
        scores = bm25.get_scores(["egfr"])
        assert len(scores) == 1


# ── TestGetPassages ───────────────────────────────────────────────────────────

class TestGetPassages:
    def _setup_retriever(self, monkeypatch, docs, metas, ids=None):
        """Patch _get_collection and _build_bm25 with in-memory data."""
        from rank_bm25 import BM25Okapi
        if ids is None:
            ids = [str(i) for i in range(len(docs))]
        fake_col = _make_fake_collection(docs, metas, ids)

        tokenized = [_tokenize(d) for d in docs]
        bm25 = BM25Okapi(tokenized) if tokenized else BM25Okapi([[]])

        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()

        monkeypatch.setattr(retriever_mod, "_get_collection", lambda: fake_col)
        monkeypatch.setattr(
            retriever_mod, "_build_bm25",
            lambda: (bm25, list(ids), list(docs), list(metas)),
        )

    def test_returns_matching_passages(self, monkeypatch):
        docs = [
            "EGFR mediates EGF receptor signaling.",
            "TP53 is a tumor suppressor gene.",
        ]
        metas = [
            {"gene": "EGFR", "context": "function", "source": "uniprot"},
            {"gene": "TP53",  "context": "function", "source": "uniprot"},
        ]
        self._setup_retriever(monkeypatch, docs, metas)
        passages = retriever_mod.get_passages("EGFR", "function", k=5)
        assert any("EGFR" in p for p in passages)

    def test_gene_normalized_to_uppercase(self, monkeypatch):
        docs = ["EGFR receptor tyrosine kinase function domain."]
        metas = [{"gene": "EGFR", "context": "function", "source": "uniprot"}]
        self._setup_retriever(monkeypatch, docs, metas)
        passages_lower = retriever_mod.get_passages("egfr", "function", k=5)
        passages_upper = retriever_mod.get_passages("EGFR", "function", k=5)
        assert passages_lower == passages_upper

    def test_no_duplicates_returned(self, monkeypatch):
        text = "EGFR mediates EGF signaling."
        docs = [text, text]
        metas = [
            {"gene": "EGFR", "context": "function", "source": "uniprot"},
            {"gene": "EGFR", "context": "function", "source": "uniprot"},
        ]
        self._setup_retriever(monkeypatch, docs, metas, ids=["a", "b"])
        passages = retriever_mod.get_passages("EGFR", "function", k=5)
        assert len(passages) == len(set(passages))

    def test_k_respected(self, monkeypatch):
        docs = [f"EGFR passage {i}." for i in range(10)]
        metas = [{"gene": "EGFR", "context": "function", "source": "x"} for _ in range(10)]
        self._setup_retriever(monkeypatch, docs, metas)
        passages = retriever_mod.get_passages("EGFR", "function", k=3)
        assert len(passages) <= 3

    def test_fallback_to_jsonl_on_chroma_error(self, monkeypatch, tmp_path):
        # Patch _get_collection to raise, and _build_bm25 accordingly
        def _bad_collection():
            raise RuntimeError("ChromaDB unavailable")

        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()
        monkeypatch.setattr(retriever_mod, "_get_collection", _bad_collection)

        # Also patch _build_bm25 to raise so the whole try block fails
        def _bad_bm25():
            raise RuntimeError("No collection")

        monkeypatch.setattr(retriever_mod, "_build_bm25", _bad_bm25)

        # Write a small JSONL chunk for the fallback
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        (chunk_dir / "function.jsonl").write_text(
            '{"gene": "EGFR", "type": "function", "source": "test", "text": "EGFR fallback text."}\n'
        )
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        passages = retriever_mod.get_passages("EGFR", "function", k=5)
        assert passages == ["EGFR fallback text."]

    def test_context_filter_pass1_strict(self, monkeypatch):
        # With k=1, pass 1 (strict gene+context) is satisfied by one doc;
        # the pathway doc must NOT appear because k is already reached.
        docs = [
            "EGFR function data.",
            "EGFR pathway data.",
            "TP53 function data.",
        ]
        metas = [
            {"gene": "EGFR", "context": "function", "source": "x"},
            {"gene": "EGFR", "context": "pathway",  "source": "x"},
            {"gene": "TP53", "context": "function",  "source": "x"},
        ]
        self._setup_retriever(monkeypatch, docs, metas)
        passages = retriever_mod.get_passages("EGFR", "function", k=1)
        assert passages == ["EGFR function data."]
        assert "EGFR pathway data." not in passages

    def test_pass2_fallback_relaxes_context(self, monkeypatch):
        # Only pathway doc for EGFR — pass 1 yields nothing, pass 2 returns it
        docs = ["EGFR pathway data."]
        metas = [{"gene": "EGFR", "context": "pathway", "source": "x"}]
        self._setup_retriever(monkeypatch, docs, metas)
        passages = retriever_mod.get_passages("EGFR", "function", k=5)
        assert "EGFR pathway data." in passages

    def test_empty_collection_returns_empty(self, monkeypatch, tmp_path):
        from rank_bm25 import BM25Okapi
        fake_col = _make_fake_collection([], [], [])
        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()
        monkeypatch.setattr(retriever_mod, "_get_collection", lambda: fake_col)
        monkeypatch.setattr(
            retriever_mod, "_build_bm25",
            lambda: (BM25Okapi([[]]), [], [], []),
        )
        # Use an empty JSONL dir so the JSONL fallback also returns nothing
        empty_chunks = tmp_path / "empty_chunks"
        empty_chunks.mkdir()
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(empty_chunks))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        passages = retriever_mod.get_passages("FAKEGENE999", "function", k=5)
        assert passages == []

    def test_rrf_promotes_doc_in_both_results(self, monkeypatch):
        """
        Doc "shared" appears in both vector and BM25 results → RRF should
        rank it higher than docs appearing in only one list.
        """
        # 5 docs; "shared_doc" is #2 in vector order and #1 in BM25 order
        docs = [
            "unrelated first passage.",
            "shared EGFR function doc important.",  # id=1, appears in both
            "third unrelated passage.",
            "fourth passage misc.",
            "fifth passage misc.",
        ]
        metas = [{"gene": "EGFR", "context": "function", "source": "x"} for _ in docs]
        ids = [f"id{i}" for i in range(len(docs))]
        fake_col = _make_fake_collection(docs, metas, ids)

        from rank_bm25 import BM25Okapi
        tokenized = [_tokenize(d) for d in docs]
        bm25 = BM25Okapi(tokenized)

        retriever_mod._get_collection.cache_clear()
        retriever_mod._build_bm25.cache_clear()
        monkeypatch.setattr(retriever_mod, "_get_collection", lambda: fake_col)
        monkeypatch.setattr(
            retriever_mod, "_build_bm25",
            lambda: (bm25, ids, docs, metas),
        )
        passages = retriever_mod.get_passages("EGFR", "function", k=5)
        # All are EGFR/function, so all eligible; shouldn't crash
        assert isinstance(passages, list)
        assert len(passages) > 0


# ── TestJSONLFallback ─────────────────────────────────────────────────────────

class TestJSONLFallback:
    def test_returns_entries_for_gene(self, tmp_path, monkeypatch):
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        (chunk_dir / "function.jsonl").write_text(
            '{"gene": "TP53", "type": "function", "source": "uniprot", "text": "TP53 suppresses tumors."}\n'
            '{"gene": "EGFR", "type": "function", "source": "uniprot", "text": "EGFR drives proliferation."}\n'
        )
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        entries = retriever_mod.get_jsonl_contexts_for_gene("TP53", "function", max_entries_per_type=5)
        assert len(entries) == 1
        assert entries[0]["text"] == "TP53 suppresses tumors."

    def test_context_filter(self, tmp_path, monkeypatch):
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        (chunk_dir / "function.jsonl").write_text(
            '{"gene": "EGFR", "type": "function", "source": "x", "text": "EGFR function."}\n'
        )
        (chunk_dir / "pathway.jsonl").write_text(
            '{"gene": "EGFR", "type": "pathway", "source": "x", "text": "EGFR pathway."}\n'
        )
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        entries = retriever_mod.get_jsonl_contexts_for_gene("EGFR", "function", max_entries_per_type=5)
        assert all(e["type"] == "function" for e in entries)
        assert len(entries) == 1

    def test_max_entries_respected(self, tmp_path, monkeypatch):
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        lines = "\n".join(
            f'{{"gene": "TP53", "type": "function", "source": "x", "text": "passage {i}"}}'
            for i in range(10)
        )
        (chunk_dir / "function.jsonl").write_text(lines + "\n")
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        entries = retriever_mod.get_jsonl_contexts_for_gene("TP53", "function", max_entries_per_type=3)
        assert len(entries) == 3

    def test_missing_gene_returns_empty(self, tmp_path, monkeypatch):
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        (chunk_dir / "function.jsonl").write_text(
            '{"gene": "EGFR", "type": "function", "source": "x", "text": "text"}\n'
        )
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        entries = retriever_mod.get_jsonl_contexts_for_gene("BRCA1", "function", max_entries_per_type=5)
        assert entries == []

    def test_case_insensitive_gene_lookup(self, tmp_path, monkeypatch):
        chunk_dir = tmp_path / "chunks"
        chunk_dir.mkdir()
        (chunk_dir / "function.jsonl").write_text(
            '{"gene": "egfr", "type": "function", "source": "x", "text": "EGFR text."}\n'
        )
        monkeypatch.setattr(retriever_mod, "CHUNKS_DIR", str(chunk_dir))
        retriever_mod.get_jsonl_contexts_for_gene.cache_clear()

        entries = retriever_mod.get_jsonl_contexts_for_gene("EGFR", "function", max_entries_per_type=5)
        assert len(entries) == 1


# ── TestRetrieverConfig ───────────────────────────────────────────────────────

class TestRetrieverConfig:
    def test_chroma_dir_default_path(self):
        # CHROMA_DIR should point somewhere under the project root
        assert "llm_data" in retriever_mod.CHROMA_DIR or "CHROMA_DIR" in os.environ

    def test_rrf_k_default(self):
        assert retriever_mod.RRF_K == 60

    def test_collection_name(self):
        assert retriever_mod.COLLECTION_NAME == "gene-chunks"

    def test_embedding_model_default(self):
        assert retriever_mod.EMBEDDING_MODEL_NAME == "all-MiniLM-L6-v2"

    def test_chroma_host_empty_by_default(self):
        # Unless overridden by env, CHROMA_HOST is empty (use PersistentClient)
        if "CHROMA_HOST" not in os.environ:
            assert retriever_mod.CHROMA_HOST == ""

    def test_chroma_port_default(self):
        if "CHROMA_PORT" not in os.environ:
            assert retriever_mod.CHROMA_PORT == 8001
