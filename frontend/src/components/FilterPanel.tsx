import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface FilterPanelProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  minDegree: number;
  maxDegree: number;
  onMinDegreeChange: (value: number) => void;
  onMaxDegreeChange: (value: number) => void;
  showSharedGenes?: boolean;
  onShowSharedGenesChange?: (value: boolean) => void;
  hasSecondGraph?: boolean;
  isFilterTouched: boolean;
  onResetFilter: () => void;
  expressionColumns: string[];
  selectedExpressionColumn: string | null;
  onExpressionColumnChange: (column: string | null) => void;
  clusteringOptions: string[];
  selectedClustering: string;
  onClusteringChange: (algorithm: string) => void;
  onBulkSelect?: (genes: string[]) => void;
}

interface SectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, open, onToggle, colors, children }) => (
  <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 10, paddingTop: 8 }}>
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        marginBottom: open ? 8 : 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </span>
      <ChevronDown
        size={12}
        style={{ color: colors.textFaint, transform: open ? 'none' : 'rotate(180deg)', transition: 'transform 0.18s' }}
      />
    </button>
    {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>}
  </div>
);

const inputStyle = (colors: ReturnType<typeof useTheme>['colors']): React.CSSProperties => ({
  width: '100%',
  padding: '5px 9px',
  background: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  color: colors.textPrimary,
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
});

const FilterPanel: React.FC<FilterPanelProps> = ({
  searchValue,
  onSearchChange,
  minDegree,
  maxDegree,
  onMinDegreeChange,
  onMaxDegreeChange,
  showSharedGenes = false,
  onShowSharedGenesChange,
  hasSecondGraph = false,
  isFilterTouched,
  onResetFilter,
  expressionColumns,
  selectedExpressionColumn,
  onExpressionColumnChange,
  clusteringOptions,
  selectedClustering,
  onClusteringChange,
  onBulkSelect,
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(true);
  const [expressionsOpen, setExpressionsOpen] = useState(true);
  const [clusteringOpen, setClusteringOpen] = useState(true);
  const [bulkText, setBulkText] = useState('');

  return (
    <div
      style={{
        width: 228,
        background: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: colors.bgPanelSecondary,
          borderBottom: open ? `1px solid ${colors.border}` : 'none',
          cursor: 'pointer',
          border: 'none',
          outline: 'none',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>Filters</span>
        <ChevronDown
          size={14}
          style={{ color: colors.textMuted, transform: open ? 'none' : 'rotate(180deg)', transition: 'transform 0.18s' }}
        />
      </button>

      {open && (
        <div style={{ padding: '12px 12px' }}>
          {/* Search */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Search
            </label>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Enter keyword…"
              style={inputStyle(colors)}
            />
          </div>

          {/* Degree Range */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Degree Range
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                value={minDegree}
                onChange={(e) => onMinDegreeChange(Number(e.target.value))}
                placeholder="Min"
                style={{ ...inputStyle(colors), width: '50%' }}
              />
              <input
                type="number"
                value={maxDegree}
                onChange={(e) => onMaxDegreeChange(Number(e.target.value))}
                placeholder="Max"
                style={{ ...inputStyle(colors), width: '50%' }}
              />
            </div>
          </div>

          {/* Shared Genes */}
          {hasSecondGraph && onShowSharedGenesChange && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showSharedGenes}
                onChange={(e) => onShowSharedGenesChange(e.target.checked)}
                style={{ accentColor: colors.accent, width: 13, height: 13 }}
              />
              <span style={{ fontSize: 12, color: colors.textPrimary }}>Show Shared Genes</span>
            </label>
          )}

          {/* Clustering */}
          <Section title="Clustering" open={clusteringOpen} onToggle={() => setClusteringOpen(v => !v)} colors={colors}>
            {clusteringOptions.map(option => (
              <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="clustering-algorithm"
                  value={option}
                  checked={selectedClustering === option}
                  onChange={() => onClusteringChange(option)}
                  style={{ accentColor: colors.accent, width: 12, height: 12 }}
                />
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </span>
              </label>
            ))}
          </Section>

          {/* Expression */}
          {expressionColumns.length > 0 && (
            <Section title="Expression" open={expressionsOpen} onToggle={() => setExpressionsOpen(v => !v)} colors={colors}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="expression-column"
                  checked={selectedExpressionColumn === null}
                  onChange={() => onExpressionColumnChange(null)}
                  style={{ accentColor: colors.accent, width: 12, height: 12 }}
                />
                <span style={{ fontSize: 12, color: colors.textMuted }}>None</span>
              </label>
              {expressionColumns.map(col => (
                <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="expression-column"
                    value={col}
                    checked={selectedExpressionColumn === col}
                    onChange={() => onExpressionColumnChange(col)}
                    style={{ accentColor: colors.accent, width: 12, height: 12 }}
                  />
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{col}</span>
                </label>
              ))}
            </Section>
          )}

          {/* Bulk Gene Select */}
          {onBulkSelect && (
            <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 10, paddingTop: 10 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Select Gene List
              </label>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={'BRCA1\nTP53\nEGFR\n…'}
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '5px 8px', borderRadius: 6,
                  background: colors.bgInput,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  fontSize: 11, fontFamily: 'monospace',
                  resize: 'vertical', outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  const genes = bulkText
                    .split(/[\n,\s]+/)
                    .map(g => g.trim().toUpperCase())
                    .filter(Boolean);
                  if (genes.length > 0) onBulkSelect(genes);
                }}
                disabled={!bulkText.trim()}
                style={{
                  width: '100%', marginTop: 5,
                  padding: '5px 10px', borderRadius: 6,
                  background: bulkText.trim() ? colors.accentFaint : colors.bgPanelSecondary,
                  color: bulkText.trim() ? colors.accent : colors.textFaint,
                  border: `1px solid ${bulkText.trim() ? colors.accent : colors.border}`,
                  fontSize: 11, fontWeight: 600, cursor: bulkText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Highlight Genes
              </button>
            </div>
          )}

          {/* Reset */}
          {isFilterTouched && (
            <button
              onClick={onResetFilter}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '6px 10px',
                background: 'transparent',
                color: colors.danger,
                border: `1px solid ${colors.danger}`,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterPanel;
