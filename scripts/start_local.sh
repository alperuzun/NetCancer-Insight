#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> NetCancer local startup"

# Build/update the ChromaDB index if missing or rebuild is forced
CHROMA_DIR="${CHROMA_DIR:-llm_data/chroma}"
REBUILD_INDEX=${REBUILD_INDEX:-0}

if [[ ! -d "$CHROMA_DIR" || "$REBUILD_INDEX" == "1" ]]; then
  echo "==> Building ChromaDB vector store (this may take a minute)..."
  python3 llm_data/ingest/embed_and_index.py
else
  echo "==> Existing ChromaDB store found at ${CHROMA_DIR}"
fi

echo "==> Starting Docker services..."
docker compose up --build
