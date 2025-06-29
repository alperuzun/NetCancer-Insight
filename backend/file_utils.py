import pandas as pd
import os

def get_keys_from_file(name):
    if "go_biological" in name:
        # Process GO Biological file
        return ("go_biological", ["annotation"])
    elif "go_cellular" in name:
        # Process GO Cellular file
        return ("go_cellular", ["cellular_component"])
    elif "go_molecular" in name:
        # Process GO Molecular file
        return ("go_molecular", ["molecular_activity"])
    elif "reactome" in name:
        # Process Reactome file
        return ("reactome", ["annotation"])
    elif "biogrid" in name:
        # Process BioGRID file
        return ("biogrid", ["official_symbol_a", "official_symbol_b"])
    elif "appic" in name:
        # Process APPI-C file
        return ("appic", ["cancer", "subtype"])
    elif "CancerDrivers" in name:
        # Process Cancer Drivers file
        return ("cancer_drivers", ["type", "organ_system", "primary_site", "cancer_type"])
    elif "intact" in name:
        return ("intact", ["MoleculeA", "MoleculeB"])
    elif "string" in name:
        return ("string", ["gene1", "gene2"])
    else:
        raise ValueError("Unknown file type")
    
def update_gene_data_dict(gene_info_db, data_dir, fname, sep=','):
    dict_key, file_keys = get_keys_from_file(fname)
    df = pd.read_csv(os.path.join(data_dir, fname), sep=sep)
    for _, row in df.iterrows():
        gene = str(row.get("gene") or row.get("gene_name") or row.get("symbol"))
        if not gene in gene_info_db:
            gene_info_db[gene.upper()] = {}
        for file_key in file_keys:
            if file_key not in gene_info_db[gene.upper()]:
                gene_info_db[gene.upper()][file_key] = []
            gene_info_db[gene.upper()][file_key].append(row.to_dict()[file_key])

def update_link_data_dict(link_info_db, data_dir, fname, sep=','):
    dict_key, file_keys = get_keys_from_file(fname)
    df = pd.read_csv(os.path.join(data_dir, fname), sep=sep)
    for _, row in df.iterrows():
        gene1 = str(row.get(file_keys[0]))
        gene2 = str(row.get(file_keys[1]))
        if not gene1 in link_info_db:
            link_info_db[gene1] = {}
        if not gene2 in link_info_db:
            link_info_db[gene2] = {}
        if not gene2 in link_info_db[gene1]:
            link_info_db[gene1][gene2] = []
        if not gene1 in link_info_db[gene2]:
            link_info_db[gene2][gene1] = []
        link_info_db[gene1][gene2].append(dict_key)
        link_info_db[gene2][gene1].append(dict_key)
        