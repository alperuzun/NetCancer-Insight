"""
Per-gene orchestration: fetch from the three sources (using on-disk raw
caches when present), format chunks, validate, and return them.

Kept separate from the CLI so it can be exercised by unit tests without
parsing argv.
"""
import logging
from typing import Any, Dict, List, Optional

from scripts.drugs import dgidb, opentargets, pharos, symbol_mapping
from scripts.drugs._http import polite_sleep
from scripts.drugs.chunks import format_chunks
from scripts.drugs.jsonl_writer import validate_chunk

log = logging.getLogger(__name__)


class GeneRunResult:
    """Bag of per-gene stats so the CLI can report progress without leaking dicts."""
    __slots__ = ("gene", "chunks", "had_dgidb", "had_opentargets", "had_pharos", "had_error")

    def __init__(self, gene: str) -> None:
        self.gene = gene
        self.chunks: List[Dict[str, Any]] = []
        self.had_dgidb = False
        self.had_opentargets = False
        self.had_pharos = False
        self.had_error = False


def run_for_gene(
    gene: str,
    *,
    mapping: Dict[str, str],
    cache_dirs: Dict[str, str],
    use_network: bool,
    sleep_seconds: float,
) -> GeneRunResult:
    """
    Run the three-source fetch + format pipeline for a single gene.

    Args:
        mapping:       HGNC→Ensembl mapping (may be empty — OT step is skipped if so).
        cache_dirs:    {"dgidb": ..., "opentargets": ..., "pharos": ...} for raw responses.
        use_network:   When False, only on-disk cached responses are used. Lets us run
                       the full pipeline against fixtures with no internet access.
        sleep_seconds: Politeness delay after each successful network call.
    """
    gene = gene.upper()
    result = GeneRunResult(gene)

    interactions = _fetch_with_cache(
        loader=lambda: dgidb.load_from_cache(gene, cache_dirs["dgidb"]),
        fetcher=lambda: dgidb.fetch_interactions(gene),
        use_network=use_network,
        on_fetch=lambda v: dgidb.save_to_cache(gene, v, cache_dirs["dgidb"]),
        sleep_seconds=sleep_seconds,
    )
    if interactions is None:
        result.had_error = True
        log.warning("DGIdb fetch failed for %s", gene)
    else:
        result.had_dgidb = bool(interactions)
    normalised = [dgidb.normalise_interaction(i) for i in (interactions or [])]

    summary: Optional[Dict[str, Any]] = None
    ensembl = symbol_mapping.resolve(gene, mapping)
    if ensembl:
        target = _fetch_with_cache(
            loader=lambda: opentargets.load_from_cache(ensembl, cache_dirs["opentargets"]),
            fetcher=lambda: opentargets.fetch_target(ensembl),
            use_network=use_network,
            on_fetch=lambda v: opentargets.save_to_cache(ensembl, v, cache_dirs["opentargets"]),
            sleep_seconds=sleep_seconds,
        )
        if target is None:
            log.warning("Open Targets fetch failed for %s (%s)", gene, ensembl)
        elif target:
            summary = opentargets.summarise(target)
            result.had_opentargets = True

    tdl = _fetch_with_cache(
        loader=lambda: pharos.load_from_cache(gene, cache_dirs["pharos"]),
        fetcher=lambda: pharos.fetch_tdl(gene),
        use_network=use_network,
        on_fetch=lambda v: pharos.save_to_cache(gene, v, cache_dirs["pharos"]),
        sleep_seconds=sleep_seconds,
    )
    result.had_pharos = tdl is not None

    candidates = format_chunks(
        gene=gene,
        dgidb_interactions=normalised,
        opentargets_summary=summary,
        tdl=tdl,
    )

    for candidate in candidates:
        errs = validate_chunk(candidate)
        if errs:
            log.warning("Invalid chunk for %s discarded: %s", gene, "; ".join(errs))
            continue
        result.chunks.append(candidate)

    return result


def _fetch_with_cache(*, loader, fetcher, use_network, on_fetch, sleep_seconds):
    """Cache-first fetch helper. Returns None on hard failure, or fetched value."""
    cached = loader()
    if cached is not None:
        return cached
    if not use_network:
        return None
    fetched = fetcher()
    if fetched is not None:
        on_fetch(fetched)
        polite_sleep(sleep_seconds)
    return fetched
