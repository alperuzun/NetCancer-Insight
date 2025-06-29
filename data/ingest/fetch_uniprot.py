# ingest/fetch_and_process_uniprot.py
import requests, os, json

# Where to write your minimal outputs
OUT_DIR = "data/processed/uniprot"
os.makedirs(OUT_DIR, exist_ok=True)

# Your gene list
with open("data/genes.txt") as f:
    genes = [g.strip() for g in f if g.strip()]

# First, get accession numbers for all genes
print("Step 1: Fetching accession numbers...")
gene_to_accession = {}

for gene in genes:
    # Search for the gene to get accession number
    query = f"gene_exact:{gene} AND organism_id:9606"
    resp = requests.get("https://rest.uniprot.org/uniprotkb/search", 
                       params={"query": query, "format": "json"})
    resp.raise_for_status()
    data = resp.json()
    
    results = data.get("results", [])
    if results:
        accession = results[0].get("primaryAccession", "")
        if accession:
            gene_to_accession[gene] = accession
            print(f"Found accession {accession} for gene {gene}")
        else:
            print(f"No accession found for gene {gene}")
    else:
        print(f"No UniProt entry for gene {gene}")

print(f"\nStep 2: Fetching detailed data for {len(gene_to_accession)} genes...")

# Now fetch detailed data for each gene using their accession numbers
for gene, accession in gene_to_accession.items():
    print(f"Processing {gene} (accession: {accession})...")
    
    # Use the new API approach with specific fields
    params = {
        "fields": [
            "accession",
            "protein_name",
            "cc_function",
            "ft_binding",
            "cc_disease"
        ]
    }
    headers = {
        "accept": "application/json"
    }
    base_url = f"https://rest.uniprot.org/uniprotkb/{accession}"
    
    try:
        response = requests.get(base_url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Extract the relevant information
        minimal = {
            "gene": gene,
            "accession": accession,
            "protein_name": "",
            "function": "",
            "disease": ""
        }
        
        # Extract protein name from the nested structure
        if "proteinDescription" in data:
            protein_desc = data["proteinDescription"]
            if "recommendedName" in protein_desc:
                recommended_name = protein_desc["recommendedName"]
                if "fullName" in recommended_name and "value" in recommended_name["fullName"]:
                    minimal["protein_name"] = recommended_name["fullName"]["value"]
        
        # Extract function information
        if "comments" in data:
            for comment in data["comments"]:
                if comment.get("commentType") == "FUNCTION":
                    texts = comment.get("texts", [])
                    combined = "\n".join(t.get("value", "") for t in texts)
                    minimal["function"] += combined + ". "
        
        # Extract disease information
        if "comments" in data:
            for comment in data["comments"]:
                if comment.get("commentType") == "DISEASE" and "disease" in comment:
                    # print(comment)
                    disease_id = comment["disease"]["diseaseId"]
                    disease_desc = comment["disease"]["description"]
                    combined = disease_id + ": " + disease_desc
                    minimal["disease"] += combined + ". "
        
        # Write the minimal JSON
        out_path = os.path.join(OUT_DIR, f"{gene}.json")
        with open(out_path, "w") as fw:
            json.dump(minimal, fw, indent=2)
        print(f"▶ Processed {gene} → {out_path}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching data for {gene} ({accession}): {e}")
    except Exception as e:
        print(f"❌ Unexpected error processing {gene}: {e}")

print(f"\nCompleted! Processed {len(gene_to_accession)} genes.")
