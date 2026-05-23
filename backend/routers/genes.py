"""Gene detail, interaction, and enrichment routes."""
import concurrent.futures
import os

from bioservices import KEGG
from fastapi import APIRouter
from fastapi.responses import JSONResponse

import db
import state
from utils import clean_gene_info

router = APIRouter()

KEGG_TIMEOUT = int(os.getenv("KEGG_TIMEOUT_SECONDS", "15"))


def _fetch_kegg_results(gene_symbol: str) -> list:
    """Blocking KEGG fetch — run inside a thread with a timeout."""
    kegg = KEGG()
    pathway_dict = kegg.get_pathway_by_gene(gene_symbol, "hsa")
    if not pathway_dict:
        return []
    results = []
    for pathway_id in list(pathway_dict.keys())[:3]:
        pathway_info = kegg.get(pathway_id)
        parsed = kegg.parse(pathway_info)
        results.append({
            "source": "KEGG",
            "term_id": pathway_id,
            "term_name": pathway_dict[pathway_id],
            "description": (
                parsed.get("DESCRIPTION", "No description available")
                if parsed else "No description available"
            ),
        })
    return results


@router.get("/gene/{gene_name}")
def get_gene_details(gene_name: str):
    gene = gene_name.upper()
    info = state.gene_info_db.get(gene)
    if info is None:
        return JSONResponse(
            content={"gene": gene, "data": {"Information": None}, "message": "Gene not found in database."}
        )
    try:
        return {"gene": gene, "data": clean_gene_info(info)}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc), "gene": gene_name})


@router.get("/interaction/{gene1}/{gene2}")
def get_interaction(gene1: str, gene2: str):
    idb = state.interaction_info_db
    if gene1 not in idb or gene2 not in idb.get(gene1, {}):
        return JSONResponse(content={"message": "No interaction found between the two genes"})
    return {"sources": list(set(idb[gene1][gene2]))}


@router.get("/gene-enrichment/{gene_symbol}")
def get_gene_enrichment(gene_symbol: str):
    cached = db.get_kegg_cache(gene_symbol)
    if cached is not None:
        return {"gene": gene_symbol, "results": cached, "cached": True}

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_fetch_kegg_results, gene_symbol)
            results = future.result(timeout=KEGG_TIMEOUT)

        db.save_kegg_cache(gene_symbol, results)

        if not results:
            return {"gene": gene_symbol, "results": [], "message": "No pathways found for this gene"}
        return {"gene": gene_symbol, "results": results}

    except concurrent.futures.TimeoutError:
        return JSONResponse(
            status_code=504,
            content={"message": f"KEGG lookup timed out for {gene_symbol}. Try again later."},
        )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"message": f"Failed to fetch enrichment for {gene_symbol}: {exc}"},
        )
