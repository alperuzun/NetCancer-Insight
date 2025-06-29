# ingest/embed_and_index.py
"""
Embed and index context chunks into a Pinecone vector store using the Pinecone Python client (v3),
with simple retry logic for OpenAI embedding calls.
"""
import os
import json
import time
import openai
from pinecone import Pinecone, ServerlessSpec, CloudProvider, AwsRegion, VectorType

# Configure OpenAI API key
openai.api_key = os.getenv("OPENAI_API_KEY")

# Configure Pinecone client
pinecone_api_key = os.getenv("PINECONE_API_KEY")
pc = Pinecone(api_key=pinecone_api_key)

# Directory of consolidated chunk files
CHUNKS_DIR = "data/chunks"
# Batch size for embedding calls
BATCH_SIZE = 50
# Embedding model
EMBED_MODEL = "text-embedding-ada-002"
# Retry parameters
MAX_RETRIES = 5
BASE_DELAY = 1  # seconds

# Ensure Pinecone index exists
def ensure_index(client, name):
    try:
        indexes = client.list_indexes()
    except Exception as e:
        print(f"Warning: could not list indexes: {e}")
        indexes = []
    if name not in indexes:
        try:
            client.create_index(
                name=name,
                dimension=1536,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud=CloudProvider.AWS,
                    region="us-east-1"
                )
            )
            print(f"✔ Created Pinecone index '{name}'")
        except Exception as e:
            msg = str(e)
            if 'ALREADY_EXISTS' in msg or 'Conflict' in msg:
                print(f"➜ Index '{name}' already exists; skipping creation.")
            else:
                raise
    else:
        print(f"➜ Pinecone index '{name}' already exists")

# Main script setup
INDEX_NAME = "gene-chunks"
ensure_index(pc, INDEX_NAME)
index = pc.Index(INDEX_NAME)

# Helper: fetch embeddings with retry
def get_embeddings(texts):
    delay = BASE_DELAY
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = openai.embeddings.create(model=EMBED_MODEL, input=texts)
            # Access .data attribute, not subscript
            return [datum.embedding for datum in resp.data]
        except Exception as e:
            msg = str(e)
            # Retry on rate limit or quota errors
            if attempt < MAX_RETRIES and ('rate limit' in msg.lower() or 'quota' in msg.lower()):
                print(f"Retry {attempt}/{MAX_RETRIES} after {delay}s: {msg}")
                time.sleep(delay)
                delay *= 2
                continue
            # Non-retryable or max attempts reached
            raise
    return []

# Main indexing loop
for filename in os.listdir(CHUNKS_DIR):
    if not filename.endswith('.jsonl'):
        continue
    context = filename.replace('.jsonl', '')
    path = os.path.join(CHUNKS_DIR, filename)
    print(f"Indexing context '{context}' from {path}")

    texts, metas, ids = [], [], []
    with open(path) as f:
        for line in f:
            rec = json.loads(line)
            text = rec.get("text")
            if not text:
                continue
            uid = f"{context}::{rec['gene']}::{abs(hash(text))}"
            texts.append(text)
            ids.append(uid)
            metas.append({
                "gene": rec['gene'],
                "context": context,
                "source": rec['source'],
                "text": text  # include chunk text for retrieval
            })
            if len(texts) >= BATCH_SIZE:
                embeddings = get_embeddings(texts)
                upsert_items = [(ids[i], embeddings[i], metas[i]) for i in range(len(ids))]
                index.upsert(vectors=upsert_items)
                texts, ids, metas = [], [], []

    # Upsert any remaining
    if texts:
        embeddings = get_embeddings(texts)
        upsert_items = [(ids[i], embeddings[i], metas[i]) for i in range(len(ids))]
        index.upsert(vectors=upsert_items)

    print(f"Finished indexing '{context}'")
