import React, { useMemo, useState } from 'react';
import { BarChart2, ChevronDown } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Props {
  graph: { nodes: any[]; links: any[] };
}

const NetworkStatsPanel: React.FC<Props> = ({ graph }) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(true);

  const stats = useMemo(() => {
    const N = graph.nodes.length;
    const E = graph.links.length;
    const density = N > 1 ? (2 * E) / (N * (N - 1)) : 0;
    const avgDegree = N > 0 ? (2 * E) / N : 0;
    const topHubs = [...graph.nodes]
      .sort((a, b) => (b.val || 0) - (a.val || 0))
      .slice(0, 5);
    return { N, E, density, avgDegree, topHubs };
  }, [graph]);

  if (graph.nodes.length === 0) return null;

  const metric = (label: string, value: string | number) => (
    <div key={label}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
        {value}
      </p>
    </div>
  );

  return (
    <div style={{
      width: 228,
      background: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '8px 12px',
          background: colors.bgPanelSecondary,
          borderBottom: open ? `1px solid ${colors.border}` : 'none',
          cursor: 'pointer', border: 'none', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChart2 size={12} style={{ color: colors.accent }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>Network Stats</span>
        </div>
        <ChevronDown size={14} style={{ color: colors.textMuted, transform: open ? 'none' : 'rotate(180deg)', transition: 'transform 0.18s' }} />
      </button>

      {open && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 10 }}>
            {metric('Nodes', stats.N)}
            {metric('Edges', stats.E)}
            {metric('Density', stats.density.toFixed(4))}
            {metric('Avg Degree', stats.avgDegree.toFixed(2))}
          </div>

          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Top Hubs
            </p>
            {stats.topHubs.map((node, i) => (
              <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: colors.textFaint, minWidth: 12 }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: colors.accent, fontWeight: 600 }}>{node.id}</span>
                </div>
                <span style={{ fontSize: 11, color: colors.textMuted }}>{node.val || 0} deg</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkStatsPanel;
