import os
import openai
from pinecone import Pinecone

pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("gene-chunks")

def get_passages(gene: str, context: str, k: int = 5) -> list[str]:
    # 1) Embed a query that scopes to this gene+context
    query_text = f"{context} of {gene}"
    resp = openai.embeddings.create(
        model="text-embedding-ada-002",
        input=[query_text]
    )
    q_vec = resp.data[0].embedding

    # 2) Retrieve top-k vectors filtered by gene & context
    results = index.query(
        vector=q_vec,
        top_k=k,
        include_metadata=True,
        filter={
            "gene": {"$eq": gene},
            "context": {"$eq": context}
        }
    )
    snippets = []
    for match in results.matches:
        snippets.append(match.metadata.get("text", "[no text available]"))
    return snippets
