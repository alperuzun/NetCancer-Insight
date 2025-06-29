# ingest/generate_context_chunks.py
"""
Generate consolidated chunk JSONL files for each context directly from processed data,
without creating per-gene intermediate files.
"""
import os
import json

# Directories for processed data
UNIPROT_IN  = "data/processed/uniprot"

# Output consolidated chunk files
CHUNKS_DIR  = "data/chunks"
os.makedirs(CHUNKS_DIR, exist_ok=True)

# Context definitions: mapping of context name to source directory and field key
CONTEXT_FIELDS = {
    "function": {
        "sources": [
            {"dir": UNIPROT_IN, "field": "function", "source": "uniprot"}
        ]
    },
    "disease": {
        "sources": [
            {"dir": UNIPROT_IN, "field": "disease", "source": "uniprot"},
        ]
    },
    "pathway": {
        "sources": [
            {"dir": UNIPROT_IN, "field": "pathway", "source": "uniprot"}
        ]
    }
}

# Chunk size in words
WORDS_PER_CHUNK = 200

for context, cfg in CONTEXT_FIELDS.items():
    out_file = os.path.join(CHUNKS_DIR, f"{context}.jsonl")
    with open(out_file, "w") as writer:
        # Iterate through each defined source for this context
        for src in cfg["sources"]:
            in_dir = src["dir"]
            field  = src["field"]
            src_name = src["source"]

            if not os.path.isdir(in_dir):
                print(f"Warning: Input directory not found: {in_dir}")
                continue

            for fname in os.listdir(in_dir):
                if not fname.endswith(".json"):
                    continue
                gene = fname[:-5]
                data = json.load(open(os.path.join(in_dir, fname)))

                # Determine text to chunk
                text = data.get(field)
                if not text or not isinstance(text, str):
                    continue

                # Split into chunks
                words = text.split()
                chunks = [" ".join(words[i:i+WORDS_PER_CHUNK])
                          for i in range(0, len(words), WORDS_PER_CHUNK)]

                # Write each chunk with metadata
                for chunk in chunks:
                    record = {
                        "gene": gene,
                        "type": context,
                        "source": src_name,
                        "text": chunk
                    }
                    writer.write(json.dumps(record) + "\n")
        print(f"Generated {context} chunks in {out_file}")
