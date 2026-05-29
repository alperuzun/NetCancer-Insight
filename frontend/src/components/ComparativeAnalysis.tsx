import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getComparativeAnalysis } from '../services/api';
import { useTheme } from '../context/ThemeContext';

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const N1 = '#6366f1';
const N2 = '#f59e0b';
const N1_BG = 'rgba(99,102,241,0.15)';
const N2_BG = 'rgba(245,158,11,0.15)';

type Tab = 'overview' | 'hubs' | 'genesets' | 'motifs';
type MotifSize = '3' | '4';

type HubGene = { gene: string; degree: number; centrality: number; cancer_drivers: number; is_cancer_driver: boolean };
type GeneEntry = { gene: string; degree: number; cancer_drivers: number };

type AnalysisData = {
  network1: {
    topology: Record<string, any>;
    hub_genes: HubGene[];
    graphlet_frequencies_4node: Record<string, number>;
    graphlet_frequencies_3node: Record<string, number>;
    graphlet_exact: boolean;
  };
  network2: {
    topology: Record<string, any>;
    hub_genes: HubGene[];
    graphlet_frequencies_4node: Record<string, number>;
    graphlet_frequencies_3node: Record<string, number>;
    graphlet_exact: boolean;
  };
  comparison: {
    node_jaccard: number;
    edge_jaccard: number;
    shared_node_count: number;
    unique_node_count_1: number;
    unique_node_count_2: number;
    shared_edge_count: number;
    unique_edge_count_1: number;
    unique_edge_count_2: number;
    divergence_score: number;
    hub_overlap: string[];
    degree_ks_statistic: number;
    shared_genes: GeneEntry[];
    unique_to_1: GeneEntry[];
    unique_to_2: GeneEntry[];
  };
};

type Props = {
  onClose: () => void;
  graph1: { nodes: any[]; links: any[] } | null;
  graph2: { nodes: any[]; links: any[] } | null;
  onHubGeneClick?: (gene: string) => void;
};

// ── Graphlet diagram definitions ──────────────────────────────────────────────

type GDef = { vb: string; nodes: [number, number][]; edges: [number, number][] };

const GDEFS_3: Record<string, GDef> = {
  G0: { vb: '0 0 54 44', nodes: [[10,22],[27,6],[44,22]], edges: [] },
  G1: { vb: '0 0 54 44', nodes: [[8,22],[27,22],[46,22]], edges: [[0,1]] },
  G2: { vb: '0 0 54 44', nodes: [[8,32],[27,8],[46,32]], edges: [[0,1],[1,2]] },
  G3: { vb: '0 0 54 44', nodes: [[8,32],[27,8],[46,32]], edges: [[0,1],[1,2],[0,2]] },
};

const GDEFS_4: Record<string, GDef> = {
  G0:  { vb: '0 0 56 52', nodes: [[12,12],[44,12],[12,40],[44,40]], edges: [] },
  G1:  { vb: '0 0 56 52', nodes: [[6,26],[22,26],[44,13],[44,39]], edges: [[0,1]] },
  G2:  { vb: '0 0 56 52', nodes: [[6,26],[22,26],[38,26],[38,46]], edges: [[0,1],[1,2]] },
  G3:  { vb: '0 0 56 52', nodes: [[10,13],[26,13],[10,39],[26,39]], edges: [[0,1],[2,3]] },
  G4:  { vb: '0 0 56 52', nodes: [[28,26],[6,10],[50,10],[50,42]], edges: [[0,1],[0,2],[0,3]] },
  G5:  { vb: '0 0 56 52', nodes: [[6,26],[20,26],[36,26],[50,26]], edges: [[0,1],[1,2],[2,3]] },
  G6:  { vb: '0 0 56 52', nodes: [[6,30],[28,8],[50,30],[28,50]], edges: [[0,1],[1,2],[0,2]] },
  G7:  { vb: '0 0 56 52', nodes: [[6,30],[28,8],[50,30],[50,50]], edges: [[0,1],[1,2],[0,2],[2,3]] },
  G8:  { vb: '0 0 56 52', nodes: [[10,11],[46,11],[46,41],[10,41]], edges: [[0,1],[1,2],[2,3],[3,0]] },
  G9:  { vb: '0 0 56 52', nodes: [[28,7],[8,30],[48,30],[28,47]], edges: [[0,1],[0,2],[0,3],[1,3],[2,3]] },
  G10: { vb: '0 0 56 52', nodes: [[28,7],[8,30],[48,30],[28,47]], edges: [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]] },
};

const GNAMES_3: Record<string, string> = {
  G0: '3 isolated', G1: '1 edge + iso', G2: 'Path P3', G3: 'Triangle',
};
const GNAMES_4: Record<string, string> = {
  G0: '4 isolated', G1: '1 edge + 2 iso', G2: 'P3 + isolated',
  G3: '2K2 matching', G4: 'Star K₁,₃', G5: 'Path P4',
  G6: 'Triangle + iso', G7: 'Paw', G8: 'Cycle C4',
  G9: 'Diamond K₄-e', G10: 'Complete K4',
};

function GraphletDiagram({ gkey, defs, nodeColor = N1, size = 44 }: {
  gkey: string; defs: Record<string, GDef>; nodeColor?: string; size?: number;
}) {
  const def = defs[gkey];
  if (!def) return null;
  const [vbW, vbH] = def.vb.split(' ').slice(2).map(Number);
  const h = (size / vbW) * vbH;
  return (
    <svg viewBox={def.vb} width={size} height={h} style={{ display: 'block', flexShrink: 0 }}>
      {def.edges.map(([i, j], idx) => (
        <line key={idx}
          x1={def.nodes[i][0]} y1={def.nodes[i][1]}
          x2={def.nodes[j][0]} y2={def.nodes[j][1]}
          stroke={nodeColor} strokeWidth={2} strokeOpacity={0.65}
        />
      ))}
      {def.nodes.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r={4.5}
          fill={nodeColor} stroke="white" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

// ── Shared UI pieces ─────────────────────────────────────────────────────────

function MetricRow({ label, v1, v2,
  format = (x: any) => x == null ? '—' : typeof x === 'number' ? x.toFixed(4) : String(x),
  colors,
}: { label: string; v1: any; v2: any; format?: (x: any) => string; colors: any }) {
  const [hov, setHov] = useState(false);
  const a = typeof v1 === 'number' ? v1 : null;
  const b = typeof v2 === 'number' ? v2 : null;
  const delta = a != null && b != null ? b - a : null;
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ borderBottom: `1px solid ${colors.border}`, background: hov ? colors.bgHover : 'transparent', transition: 'background 0.1s' }}
    >
      <td style={{ padding: '6px 8px', fontSize: 12, color: colors.textMuted, whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: N1, fontWeight: 600, textAlign: 'right' }}>{format(v1)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: N2, fontWeight: 600, textAlign: 'right' }}>{format(v2)}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right',
        color: delta == null ? colors.textMuted : delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : colors.textMuted }}>
        {delta == null ? '' : `${delta >= 0 ? '+' : ''}${Math.abs(delta) < 1 ? delta.toFixed(4) : delta.toFixed(1)}`}
      </td>
    </tr>
  );
}

function SummaryCard({ title, v1, v2, sub, colors }: { title: string; v1: string; v2: string; sub?: string; colors: any }) {
  return (
    <div style={{ background: colors.bgBase, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', flex: 1 }}>
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: N1 }}>{v1}</span>
        <span style={{ fontSize: 11, color: colors.textMuted }}>vs</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: N2 }}>{v2}</span>
      </div>
      {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SharedGenesCard({ shared, total, jaccard, colors }: { shared: number; total: number; jaccard: number; colors: any }) {
  const pct = total > 0 ? ((shared / total) * 100).toFixed(0) : '0';
  return (
    <div style={{ background: colors.bgBase, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', flex: 1 }}>
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>SHARED GENES</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#a855f7' }}>{shared.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>of {total.toLocaleString()} total genes ({pct}%)</div>
      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>Jaccard similarity: {jaccard.toFixed(3)}</div>
    </div>
  );
}

function DivergenceCard({ score, ks, colors }: { score: number; ks: number; colors: any }) {
  const label = score < 0.05 ? 'Nearly identical' : score < 0.15 ? 'Similar' : score < 0.35 ? 'Moderately different' : 'Highly divergent';
  const accent = score < 0.05 ? '#10b981' : score < 0.15 ? '#6366f1' : score < 0.35 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ background: colors.bgBase, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', flex: 1 }}>
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>NETWORK DIVERGENCE</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>{label}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Score: {score.toFixed(3)} &nbsp;(scale 0 – 1.73)</div>
      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>Degree dist. KS = {ks.toFixed(3)}</div>
    </div>
  );
}

function CancerBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 4px', marginLeft: 4 }}>
      CDx{count}
    </span>
  );
}

function GeneTag({ gene, degree, cancer_drivers, color, isSharedHub, onClick, colors }: {
  gene: string; degree: number; cancer_drivers: number; color: string;
  isSharedHub?: boolean; onClick?: () => void; colors: any;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6,
        cursor: onClick ? 'pointer' : 'default',
        background: hov && onClick ? colors.bgHover : 'transparent',
        border: `1px solid ${isSharedHub ? '#a855f7' : colors.border}`,
        marginBottom: 3, transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{gene}</span>
      <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 'auto' }}>deg {degree}</span>
      <CancerBadge count={cancer_drivers} />
      {isSharedHub && <span style={{ fontSize: 9, color: '#a855f7', fontWeight: 700 }}>★</span>}
    </div>
  );
}

function GeneList({ genes, limit = 20, color, sharedHubs, onGeneClick, colors }: {
  genes: GeneEntry[]; limit?: number; color: string;
  sharedHubs?: Set<string>; onGeneClick?: (g: string) => void; colors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? genes : genes.slice(0, limit);
  return (
    <div>
      {visible.map(g => (
        <GeneTag key={g.gene} gene={g.gene} degree={g.degree} cancer_drivers={g.cancer_drivers}
          color={color} isSharedHub={sharedHubs?.has(g.gene)}
          onClick={onGeneClick ? () => onGeneClick(g.gene) : undefined} colors={colors} />
      ))}
      {genes.length > limit && (
        <button onClick={() => setExpanded(e => !e)}
          style={{ fontSize: 11, color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' }}>
          {expanded ? 'Show less' : `Show all ${genes.length} genes`}
        </button>
      )}
    </div>
  );
}

function HubGeneRow({ hub, rank, nameColor, isShared, onClick, colors }: {
  hub: HubGene; rank: number; nameColor: string; isShared: boolean; onClick?: () => void; colors: any;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, marginBottom: 3,
        cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${isShared ? '#a855f7' : colors.border}`,
        background: hov ? colors.bgHover : isShared ? 'rgba(168,85,247,0.06)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 10, color: colors.textMuted, width: 16, textAlign: 'right', flexShrink: 0 }}>{rank}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: nameColor, flex: 1 }}>{hub.gene}</span>
      <span style={{ fontSize: 10, color: colors.textMuted }}>deg {hub.degree}</span>
      <CancerBadge count={hub.cancer_drivers} />
      {isShared && <span style={{ fontSize: 9, color: '#a855f7' }}>★</span>}
    </div>
  );
}

function PropBarSegment({ width, color, title }: { width: number; color: string; title: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: `${width}%`, background: color, cursor: 'default',
        filter: hov ? 'brightness(1.2)' : 'brightness(1)', transition: 'filter 0.15s' }} />
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ data, label1, label2, colors }: { data: AnalysisData; label1: string; label2: string; colors: any }) {
  const t1 = data.network1.topology;
  const t2 = data.network2.topology;
  const cmp = data.comparison;
  const total = t1.num_nodes + t2.num_nodes - cmp.shared_node_count;

  const intFmt = (x: any) => x == null ? '—' : Number(x).toLocaleString();
  const pctFmt = (x: any) => x == null ? '—' : `${(x * 100).toFixed(1)}%`;
  const numFmt = (x: any) => x == null ? '—' : typeof x === 'number' ? (Number.isInteger(x) ? x.toString() : x.toFixed(4)) : String(x);

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <SummaryCard title="NODES" v1={t1.num_nodes.toLocaleString()} v2={t2.num_nodes.toLocaleString()} colors={colors} />
        <SummaryCard title="EDGES" v1={t1.num_edges.toLocaleString()} v2={t2.num_edges.toLocaleString()} colors={colors} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <SharedGenesCard shared={cmp.shared_node_count} total={total} jaccard={cmp.node_jaccard} colors={colors} />
        <DivergenceCard score={cmp.divergence_score} ks={cmp.degree_ks_statistic} colors={colors} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: N1, display: 'inline-block' }} /> {label1}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: N2, display: 'inline-block' }} /> {label2}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Metric</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: N1, fontWeight: 700, fontSize: 11 }}>{label1}</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: N2, fontWeight: 700, fontSize: 11 }}>{label2}</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Nodes" v1={t1.num_nodes} v2={t2.num_nodes} format={intFmt} colors={colors} />
            <MetricRow label="Edges" v1={t1.num_edges} v2={t2.num_edges} format={intFmt} colors={colors} />
            <MetricRow label="Density" v1={t1.density} v2={t2.density} format={numFmt} colors={colors} />
            <MetricRow label="Avg Clustering" v1={t1.avg_clustering_coefficient} v2={t2.avg_clustering_coefficient} format={numFmt} colors={colors} />
            <MetricRow label="Avg Degree" v1={t1.avg_degree} v2={t2.avg_degree} format={numFmt} colors={colors} />
            <MetricRow label="Max Degree" v1={t1.max_degree} v2={t2.max_degree} format={intFmt} colors={colors} />
            <MetricRow label="Components" v1={t1.num_components} v2={t2.num_components} format={intFmt} colors={colors} />
            <MetricRow label="Avg Path Length" v1={t1.avg_path_length} v2={t2.avg_path_length} format={numFmt} colors={colors} />
            <MetricRow label="Assortativity" v1={t1.assortativity} v2={t2.assortativity} format={numFmt} colors={colors} />
            <MetricRow label="Cancer Drivers" v1={t1.cancer_driver_count} v2={t2.cancer_driver_count} format={intFmt} colors={colors} />
            <MetricRow label="Driver Fraction" v1={t1.cancer_driver_fraction} v2={t2.cancer_driver_fraction} format={pctFmt} colors={colors} />
            <MetricRow label="Edge Jaccard" v1={cmp.edge_jaccard} v2={null} format={x => x == null ? '—' : x.toFixed(3)} colors={colors} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HubGenesTab({ data, label1, label2, onHubGeneClick, colors }: {
  data: AnalysisData; label1: string; label2: string; onHubGeneClick?: (gene: string) => void; colors: any;
}) {
  const hubOverlapSet = new Set(data.comparison.hub_overlap);
  return (
    <div style={{ padding: '16px' }}>
      {hubOverlapSet.size > 0 && (
        <div style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#a855f7' }}>
          <strong>{hubOverlapSet.size} hub gene{hubOverlapSet.size > 1 ? 's' : ''}</strong> in both top-hub lists: {data.comparison.hub_overlap.join(', ')}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: N1, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label1} — Top Hubs</div>
          {data.network1.hub_genes.map((h, i) => (
            <HubGeneRow key={h.gene} hub={h} rank={i + 1} nameColor={N1}
              isShared={hubOverlapSet.has(h.gene)}
              onClick={onHubGeneClick ? () => onHubGeneClick(h.gene) : undefined} colors={colors} />
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: N2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label2} — Top Hubs</div>
          {data.network2.hub_genes.map((h, i) => (
            <HubGeneRow key={h.gene} hub={h} rank={i + 1} nameColor={N2}
              isShared={hubOverlapSet.has(h.gene)}
              onClick={onHubGeneClick ? () => onHubGeneClick(h.gene) : undefined} colors={colors} />
          ))}
        </div>
      </div>
      {onHubGeneClick && (
        <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 12 }}>
          Click any gene to highlight it in both network panels. ★ = shared hub. CDx = cancer driver count.
        </p>
      )}
    </div>
  );
}

function GeneSetsTab({ data, label1, label2, onGeneClick, colors }: {
  data: AnalysisData; label1: string; label2: string; onGeneClick?: (gene: string) => void; colors: any;
}) {
  const cmp = data.comparison;
  const total = cmp.unique_node_count_1 + cmp.shared_node_count + cmp.unique_node_count_2;
  const pct1 = total ? (cmp.unique_node_count_1 / total) * 100 : 0;
  const pctS = total ? (cmp.shared_node_count / total) * 100 : 0;
  const pct2 = total ? (cmp.unique_node_count_2 / total) * 100 : 0;
  const sharedHubSet = new Set(data.comparison.hub_overlap);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
        <PropBarSegment width={pct1} color={N1} title={`${label1} only: ${cmp.unique_node_count_1}`} />
        <PropBarSegment width={pctS} color='#a855f7' title={`Shared: ${cmp.shared_node_count}`} />
        <PropBarSegment width={pct2} color={N2} title={`${label2} only: ${cmp.unique_node_count_2}`} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.textMuted, marginBottom: 14 }}>
        <span style={{ color: N1 }}>{label1} only: {cmp.unique_node_count_1}</span>
        <span style={{ color: '#a855f7' }}>Shared: {cmp.shared_node_count}</span>
        <span style={{ color: N2 }}>{label2} only: {cmp.unique_node_count_2}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ label: 'Gene Jaccard', value: cmp.node_jaccard }, { label: 'Edge Jaccard', value: cmp.edge_jaccard }].map(s => (
          <div key={s.label} style={{ flex: 1, background: colors.bgBase, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#a855f7' }}>{s.value.toFixed(3)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { title: `${label1} only (${cmp.unique_node_count_1})`, genes: cmp.unique_to_1, color: N1 },
          { title: `Shared (${cmp.shared_node_count})`, genes: cmp.shared_genes, color: '#a855f7' },
          { title: `${label2} only (${cmp.unique_node_count_2})`, genes: cmp.unique_to_2, color: N2 },
        ].map(col => (
          <div key={col.title}>
            <div style={{ fontSize: 11, fontWeight: 700, color: col.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.title}</div>
            <GeneList genes={col.genes} color={col.color} sharedHubs={sharedHubSet} onGeneClick={onGeneClick} colors={colors} />
          </div>
        ))}
      </div>
      {onGeneClick && <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 12 }}>Click any gene to highlight it in both network panels.</p>}
    </div>
  );
}

function MotifsTab({ data, label1, label2, colors }: {
  data: AnalysisData; label1: string; label2: string; colors: any;
}) {
  const [size, setSize] = useState<MotifSize>('4');
  const isDark = colors.bgBase?.includes('0f1') || colors.bgBase?.includes('1e29');
  const textColor = isDark ? '#e2e8f0' : '#374151';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const defs = size === '3' ? GDEFS_3 : GDEFS_4;
  const names = size === '3' ? GNAMES_3 : GNAMES_4;
  const keys = Object.keys(defs);

  const f1 = size === '3' ? data.network1.graphlet_frequencies_3node : data.network1.graphlet_frequencies_4node;
  const f2 = size === '3' ? data.network2.graphlet_frequencies_3node : data.network2.graphlet_frequencies_4node;

  const chartData = {
    labels: keys,
    datasets: [
      { label: label1, data: keys.map(g => +(f1?.[g] ?? 0).toFixed(5)), backgroundColor: N1_BG, borderColor: N1, borderWidth: 1.5 },
      { label: label2, data: keys.map(g => +(f2?.[g] ?? 0).toFixed(5)), backgroundColor: N2_BG, borderColor: N2, borderWidth: 1.5 },
    ],
  };

  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textColor, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          title: (items: any[]) => `${items[0].label} — ${names[items[0].label] ?? ''}`,
          label: (item: any) => `${item.dataset.label}: ${(item.raw * 100).toFixed(3)}%`,
        },
      },
    },
    scales: {
      x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
      y: {
        ticks: { color: textColor, font: { size: 10 }, callback: (v: any) => `${(v * 100).toFixed(1)}%` },
        grid: { color: gridColor },
      },
    },
  };

  const diffs = keys.map(g => ({ g, diff: Math.abs((f1?.[g] ?? 0) - (f2?.[g] ?? 0)), d: (f2?.[g] ?? 0) - (f1?.[g] ?? 0) }))
    .sort((a, b) => b.diff - a.diff).slice(0, 3);

  return (
    <div style={{ padding: '16px' }}>
      {/* Sub-tab: 3-node / 4-node */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['3', '4'] as MotifSize[]).map(s => (
          <button key={s} onClick={() => setSize(s)} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: size === s ? 700 : 400, cursor: 'pointer',
            border: `1px solid ${size === s ? colors.accent : colors.border}`,
            background: size === s ? colors.accentFaint : 'transparent',
            color: size === s ? colors.accent : colors.textMuted,
            transition: 'all 0.15s',
          }}>
            {s}-node graphlets
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ height: 180, marginBottom: 16 }}>
        <Bar data={chartData} options={options as any} />
      </div>

      {size === '4' && (!data.network1.graphlet_exact || !data.network2.graphlet_exact) && (
        <p style={{ fontSize: 10, color: colors.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
          * Frequencies estimated via random sampling (graph too large for exact enumeration).
        </p>
      )}

      {/* Largest differences */}
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>Largest structural differences</div>
      {diffs.map(({ g, d }) => (
        <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <GraphletDiagram gkey={g} defs={defs} nodeColor={d > 0 ? N2 : N1} size={32} />
          <span style={{ fontSize: 11, fontWeight: 700, color: colors.textPrimary, width: 26 }}>{g}</span>
          <span style={{ fontSize: 10, color: colors.textMuted, flex: 1 }}>{names[g]}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: d > 0 ? N2 : N1 }}>
            {d > 0 ? `+${(d * 100).toFixed(2)}% in ${label2}` : `+${(-d * 100).toFixed(2)}% in ${label1}`}
          </span>
        </div>
      ))}

      {/* Visual graphlet key */}
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, margin: '16px 0 10px' }}>Graphlet key</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
        {keys.map(g => {
          const diff = (f2?.[g] ?? 0) - (f1?.[g] ?? 0);
          const dominated = Math.abs(diff) > 0.001 ? (diff > 0 ? N2 : N1) : colors.textMuted;
          return (
            <div key={g} style={{
              background: colors.bgBase, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <GraphletDiagram gkey={g} defs={defs} nodeColor={colors.accent} size={44} />
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textPrimary }}>{g}</div>
              <div style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', lineHeight: 1.3 }}>{names[g]}</div>
              <div style={{ display: 'flex', gap: 4, fontSize: 9, marginTop: 2 }}>
                <span style={{ color: N1 }}>{((f1?.[g] ?? 0) * 100).toFixed(1)}%</span>
                <span style={{ color: colors.textMuted }}>|</span>
                <span style={{ color: N2 }}>{((f2?.[g] ?? 0) * 100).toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export default function ComparativeAnalysis({ onClose, graph1, graph2, onHubGeneClick }: Props) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label1, setLabel1] = useState('Network 1');
  const [label2, setLabel2] = useState('Network 2');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!graph1 || !graph2) return;
    setLoading(true);
    setError(null);
    getComparativeAnalysis(0, 1)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load comparative analysis.'))
      .finally(() => setLoading(false));
  }, [graph1, graph2]);

  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [activeTab]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'hubs', label: 'Hub Genes' },
    { key: 'genesets', label: 'Gene Sets' },
    { key: 'motifs', label: 'Motifs' },
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100vh', width: 460,
      background: colors.bgPanel, borderLeft: `1px solid ${colors.border}`,
      display: 'flex', flexDirection: 'column', zIndex: 500,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
      animation: 'slideInRight 0.2s ease-out',
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>Comparative Analysis</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input value={label1} onChange={e => setLabel1(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: `1.5px solid ${N1}`, background: colors.bgBase, color: N1, fontWeight: 600, fontSize: 12 }} />
          <span style={{ color: colors.textMuted, fontWeight: 500 }}>vs</span>
          <input value={label2} onChange={e => setLabel2(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: `1.5px solid ${N2}`, background: colors.bgBase, color: N2, fontWeight: 600, fontSize: 12 }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
            color: activeTab === t.key ? colors.accent : colors.textMuted,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === t.key ? `2px solid ${colors.accent}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: colors.textMuted, fontSize: 13 }}>Computing analysis…</div>}
        {error && <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}
        {!loading && !error && !data && <div style={{ padding: 16, color: colors.textMuted, fontSize: 13 }}>Upload both graphs to run comparative analysis.</div>}
        {!loading && !error && data && (
          <>
            {activeTab === 'overview' && <OverviewTab data={data} label1={label1} label2={label2} colors={colors} />}
            {activeTab === 'hubs' && <HubGenesTab data={data} label1={label1} label2={label2} onHubGeneClick={onHubGeneClick} colors={colors} />}
            {activeTab === 'genesets' && <GeneSetsTab data={data} label1={label1} label2={label2} onGeneClick={onHubGeneClick} colors={colors} />}
            {activeTab === 'motifs' && <MotifsTab data={data} label1={label1} label2={label2} colors={colors} />}
          </>
        )}
      </div>
    </div>
  );
}
