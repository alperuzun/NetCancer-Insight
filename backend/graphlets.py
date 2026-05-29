"""
Graphlet counting — no external dependencies.

3-node: exact analytic O(m√m), always precise.
4-node: exact enumeration for n≤MAX_EXACT_4, random-sampling estimate above that.
        Never raises; large graphs get a fast frequency estimate instead.

Graphlet taxonomy (11 non-isomorphic 4-node induced subgraphs, G0–G10):
  G0:  4 isolated nodes          (0 edges)
  G1:  one edge + 2 isolated     (1 edge)
  G2:  path P3 + 1 isolated      (2 edges, component sizes 3+1)
  G3:  matching 2K2              (2 edges, component sizes 2+2)
  G4:  star K_{1,3}              (3 edges, max-degree 3)
  G5:  path P4                   (3 edges, no triangle)
  G6:  triangle K3 + 1 isolated  (3 edges, has triangle)
  G7:  paw  (K3 + pendant)       (4 edges, max-degree 3)
  G8:  cycle C4                  (4 edges, all degrees 2)
  G9:  diamond K4-e              (5 edges)
  G10: complete K4               (6 edges)
"""
import itertools
import math
import random
from typing import Dict

import networkx as nx

_G3 = ("G0", "G1", "G2", "G3")
_G4 = ("G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10")

MAX_EXACT_4 = 100       # n above this switches to sampling; C(100,4)≈3.9M ≈1-2s in Python
SAMPLE_COUNT = 200_000  # random 4-tuples for the sampling path
_SAMPLE_SEED = 42       # fixed seed — reproducible estimates across identical inputs


# ── 3-node analytic ───────────────────────────────────────────────────────────

def analyze_3node(G: nx.Graph) -> dict:
    """
    Exact 3-node graphlet counts using closed-form O(m√m) formulas.
    Returns counts for G0–G3 plus frequency and total.
    """
    n = G.number_of_nodes()
    m = G.number_of_edges()

    T = sum(nx.triangles(G).values()) // 3
    W = sum(d * (d - 1) // 2 for _, d in G.degree())

    g3 = T
    g2 = W - 3 * T
    g1 = m * (n - 2) - 2 * W + 3 * T
    g0 = n * (n - 1) * (n - 2) // 6 - g1 - g2 - g3

    counts: Dict[str, int] = {"G0": g0, "G1": g1, "G2": g2, "G3": g3}
    total = sum(counts.values())
    freqs = {k: v / total for k, v in counts.items()} if total else {k: 0.0 for k in counts}
    return {"counts": counts, "frequencies": freqs, "total_graphlets": total, "exact": True}


# ── 4-node classifier (pure Python, no NetworkX per-call) ─────────────────────

def _classify(a, b, c, d, adj: dict) -> str:
    """
    Classify the 4-node induced subgraph {a,b,c,d} using pre-built adjacency sets.
    Runs in O(1) — 6 set lookups and integer arithmetic only.
    """
    ab = b in adj[a]; ac = c in adj[a]; ad = d in adj[a]
    bc = c in adj[b]; bd = d in adj[b]; cd = d in adj[c]

    e = ab + ac + ad + bc + bd + cd
    if e == 0: return "G0"
    if e == 1: return "G1"

    # degree sequence of the 4 nodes (ascending)
    deg = sorted((ab + ac + ad, ab + bc + bd, ac + bc + cd, ad + bd + cd))

    if e == 2:
        # 2K2 matching: all degrees == 1; P3+isolated: degrees [0,1,1,2]
        return "G3" if deg[0] == 1 else "G2"

    if e == 3:
        if deg[3] == 3: return "G4"          # star: one hub with degree 3
        # triangle present iff any 3 mutually adjacent nodes exist
        has_tri = (ab and ac and bc) or (ab and ad and bd) or \
                  (ac and ad and cd) or (bc and bd and cd)
        return "G6" if has_tri else "G5"     # K3+isolated vs P4

    if e == 4:
        return "G7" if deg[3] == 3 else "G8" # paw (has degree-3 node) vs C4

    if e == 5: return "G9"   # diamond K4-e
    return "G10"             # K4


# ── 4-node counting strategies ────────────────────────────────────────────────

def _exact(G: nx.Graph, adj: dict) -> Dict[str, int]:
    counts = dict.fromkeys(_G4, 0)
    nodes = list(G.nodes())
    for a, b, c, d in itertools.combinations(nodes, 4):
        counts[_classify(a, b, c, d, adj)] += 1
    return counts


def _sampled(G: nx.Graph, adj: dict, k: int) -> Dict[str, int]:
    nodes = list(G.nodes())
    n = len(nodes)
    rng = random.Random(_SAMPLE_SEED)  # isolated RNG — doesn't affect global state
    raw = dict.fromkeys(_G4, 0)
    for _ in range(k):
        a, b, c, d = rng.sample(nodes, 4)
        raw[_classify(a, b, c, d, adj)] += 1
    # Scale sample counts to estimated true counts
    scale = math.comb(n, 4) / k
    return {g: round(v * scale) for g, v in raw.items()}


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_4node(G: nx.Graph) -> dict:
    """
    4-node graphlet counts (G0–G10).

    Exact enumeration for graphs with ≤MAX_EXACT_4 nodes.
    Random-sampling estimate for larger graphs (fast, ~200K samples).
    Always returns a result — never raises for graph size.
    """
    n = G.number_of_nodes()
    zero = dict.fromkeys(_G4, 0)
    if n < 4:
        return {"counts": zero, "frequencies": {g: 0.0 for g in _G4},
                "total_graphlets": 0, "exact": True}

    adj = {v: set(G.neighbors(v)) for v in G.nodes()}
    exact = n <= MAX_EXACT_4
    counts = _exact(G, adj) if exact else _sampled(G, adj, SAMPLE_COUNT)

    total = sum(counts.values())
    freqs = {k: v / total for k, v in counts.items()} if total else {k: 0.0 for k in counts}
    return {"counts": counts, "frequencies": freqs, "total_graphlets": total, "exact": exact}
