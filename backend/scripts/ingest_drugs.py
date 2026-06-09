"""
Drug data ingestion CLI.

Run from the backend/ directory:

    # Smoke test: 3 well-studied genes, no ChromaDB write, no network if cached
    python -m scripts.ingest_drugs --genes TP53,EGFR,BRAF --limit 3

    # Full run over every indexed gene (writes JSONL only — app is untouched)
    python -m scripts.ingest_drugs

    # After Phase 2 view restructure, opt-in to ChromaDB indexing:
    python -m scripts.ingest_drugs --load-chromadb

Defaults:
  output:           backend/llm_data/chunks/drug.jsonl
  raw cache dirs:   backend/llm_data/raw/{dgidb,opentargets,pharos}/<GENE>.json
  tracker:          backend/llm_data/ingested_drug_genes.txt
  provenance:       backend/llm_data/data_provenance.json

The CLI never touches the running FastAPI process or its in-memory caches.
"""
import argparse
import logging
import os
import sys
from typing import List

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_BACKEND_DIR)  # we're inside scripts/
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from scripts.drugs import dgidb, opentargets, pharos, provenance, symbol_mapping
from scripts.drugs.jsonl_writer import (
    load_completed_genes,
    mark_completed,
    write_chunks,
)
from scripts.drugs.pipeline import run_for_gene

LOG = logging.getLogger("ingest_drugs")

_DEFAULT_OUTPUT = os.path.join(_BACKEND_DIR, "..", "llm_data", "chunks", "drug.jsonl")
_DEFAULT_TRACKER = os.path.join(_BACKEND_DIR, "..", "llm_data", "ingested_drug_genes.txt")
_DEFAULT_CACHE_ROOT = os.path.join(_BACKEND_DIR, "..", "llm_data", "raw")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ingest_drugs",
        description="Pull drug-gene data from DGIdb, Open Targets, Pharos and write JSONL chunks.",
    )
    p.add_argument("--genes", help="Comma-separated gene symbols to process (overrides --gene-source).")
    p.add_argument(
        "--gene-source",
        choices=("indexed", "file"),
        default="indexed",
        help="Where to pull the gene list from (default: state.indexed_genes).",
    )
    p.add_argument("--gene-file", help="Path to a newline-delimited gene file (used when --gene-source=file).")
    p.add_argument("--limit", type=int, default=0, help="Process at most this many genes (0 = all).")
    p.add_argument("--output", default=_DEFAULT_OUTPUT, help="JSONL output path.")
    p.add_argument("--tracker", default=_DEFAULT_TRACKER, help="Path to the resume tracker file.")
    p.add_argument("--cache-root", default=_DEFAULT_CACHE_ROOT, help="Directory holding raw response caches.")
    p.add_argument("--hgnc-mapping", default=None, help="Override path to the HGNC→Ensembl TSV.")
    p.add_argument("--no-resume", action="store_true", help="Re-process genes already in the tracker.")
    p.add_argument("--offline", action="store_true", help="Use only cached raw responses; no network calls.")
    p.add_argument("--sleep", type=float, default=1.0, help="Seconds to sleep between network calls (politeness).")
    p.add_argument(
        "--load-chromadb",
        action="store_true",
        help="OPT-IN: bulk-load the resulting chunks into the live ChromaDB collection. "
             "Leaves the app's existing views untouched, but makes drug chunks discoverable "
             "to retrieval under context='drug'. Use only when ready for Phase 2.",
    )
    p.add_argument("--dry-run", action="store_true", help="Process and validate but do not write JSONL or ChromaDB.")
    p.add_argument("--verbose", "-v", action="store_true")
    return p


def _resolve_gene_list(args: argparse.Namespace) -> List[str]:
    if args.genes:
        return [g.strip().upper() for g in args.genes.split(",") if g.strip()]

    if args.gene_source == "file":
        if not args.gene_file or not os.path.exists(args.gene_file):
            raise SystemExit(f"--gene-source=file requires a valid --gene-file (got: {args.gene_file})")
        with open(args.gene_file) as fh:
            return [line.strip().upper() for line in fh if line.strip()]

    # Default: pull from state.indexed_genes — keeps us aligned with the genes
    # the app already knows about, instead of crawling 20k+ symbols.
    import state  # local import so the module loads cleanly when state is broken
    return sorted(state.indexed_genes)


def main(argv=None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    genes = _resolve_gene_list(args)
    if not genes:
        LOG.error("No genes resolved — nothing to do.")
        return 1

    completed = set() if args.no_resume else load_completed_genes(args.tracker)
    pending = [g for g in genes if g not in completed]
    if args.limit > 0:
        pending = pending[: args.limit]

    LOG.info(
        "Genes resolved=%d, already-completed=%d, pending=%d, offline=%s, load_chromadb=%s, dry_run=%s",
        len(genes), len(completed), len(pending), args.offline, args.load_chromadb, args.dry_run,
    )

    mapping = symbol_mapping.load_mapping(args.hgnc_mapping)
    if not mapping:
        LOG.warning(
            "HGNC→Ensembl mapping not found; Open Targets step will be skipped for all genes. "
            "Place a TSV at %s to enable.",
            symbol_mapping.DEFAULT_MAPPING_PATH,
        )

    cache_dirs = {
        "dgidb":       os.path.join(args.cache_root, "dgidb"),
        "opentargets": os.path.join(args.cache_root, "opentargets"),
        "pharos":      os.path.join(args.cache_root, "pharos"),
    }

    total_chunks = 0
    genes_with_data = 0

    for i, gene in enumerate(pending, 1):
        LOG.info("[%d/%d] %s", i, len(pending), gene)
        try:
            result = run_for_gene(
                gene,
                mapping=mapping,
                cache_dirs=cache_dirs,
                use_network=not args.offline,
                sleep_seconds=args.sleep,
            )
        except Exception:  # noqa: BLE001 — script-level catch so one bad gene doesn't abort the run
            LOG.exception("Unexpected error processing %s", gene)
            continue

        if result.chunks:
            genes_with_data += 1
            if not args.dry_run:
                total_chunks += write_chunks(args.output, result.chunks)
                mark_completed(args.tracker, gene)
            else:
                total_chunks += len(result.chunks)
            LOG.info(
                "  → %d chunks (dgidb=%s, opentargets=%s, pharos=%s)",
                len(result.chunks),
                result.had_dgidb,
                result.had_opentargets,
                result.had_pharos,
            )
        else:
            LOG.info("  → no drug data; skipping")
            if not args.dry_run:
                mark_completed(args.tracker, gene)

    LOG.info("Run complete: %d chunks written for %d genes.", total_chunks, genes_with_data)

    if not args.dry_run:
        provenance.record_drug_ingestion(
            genes_requested=len(pending),
            genes_with_data=genes_with_data,
            interactions_written=total_chunks,
            dgidb_endpoint=dgidb.DGIDB_ENDPOINT,
            dgidb_version=dgidb.DGIDB_VERSION,
            opentargets_endpoint=opentargets.OPENTARGETS_ENDPOINT,
            opentargets_version=opentargets.OPENTARGETS_VERSION,
            pharos_endpoint=pharos.PHAROS_ENDPOINT_TEMPLATE,
            pharos_version=pharos.PHAROS_VERSION,
            min_interaction_score=0.5,
            output_path=os.path.abspath(args.output),
        )

    if args.load_chromadb and not args.dry_run and total_chunks > 0:
        LOG.info("Opt-in --load-chromadb: bulk-loading %s into ChromaDB…", args.output)
        from scripts.drugs.indexer import chunk_iter_from_jsonl, load_chunks_into_chromadb
        chunks = list(chunk_iter_from_jsonl(args.output))
        added = load_chunks_into_chromadb(chunks)
        LOG.info("ChromaDB updated: %d documents added.", added)

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
