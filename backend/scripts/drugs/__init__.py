"""
Drug data ingestion package.

Standalone, opt-in pipeline that pulls drug-gene interactions (DGIdb),
target tractability (Open Targets), and Target Development Level (Pharos),
formats the results as JSONL chunks matching the existing
llm_data/chunks/*.jsonl schema, and optionally bulk-loads them into the
ChromaDB collection used by the retriever.

Nothing in this package is imported by the running FastAPI app. The drug
chunks remain invisible to the current function/pathway/disease views
until Phase 2 (view restructure) wires them in.
"""
