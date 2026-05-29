import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface ExpressionColumnSelectorModalProps {
  columns: string[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: { expressionColumns: string[]; geneColumn: string }) => void;
}

const GENE_COL_HINTS = ['gene', 'symbol', 'gene_symbol', 'geneid', 'gene_id', 'name', 'id', 'gene_name'];

function guessGeneColumn(columns: string[]): string | null {
  const lower = columns.map(c => c.toLowerCase().trim());
  for (const hint of GENE_COL_HINTS) {
    const idx = lower.indexOf(hint);
    if (idx !== -1) return columns[idx];
  }
  for (const hint of GENE_COL_HINTS) {
    const idx = lower.findIndex(c => c.includes(hint));
    if (idx !== -1) return columns[idx];
  }
  return null;
}

const ExpressionColumnSelectorModal: React.FC<ExpressionColumnSelectorModalProps> = ({
  columns,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const { colors } = useTheme();
  const [selectedExpressionColumns, setSelectedExpressionColumns] = useState<string[]>([]);
  const [selectedGeneColumn, setSelectedGeneColumn] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && columns.length > 0) {
      const guess = guessGeneColumn(columns);
      setSelectedGeneColumn(guess);
      // Pre-select all non-gene columns as expression columns
      setSelectedExpressionColumns(guess ? columns.filter(c => c !== guess) : []);
    }
  }, [isOpen, columns]);

  const toggleExprColumn = (col: string) => {
    setSelectedExpressionColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const expressionCandidates = columns.filter(c => c !== selectedGeneColumn);

  const handleConfirm = () => {
    if (selectedGeneColumn && selectedExpressionColumns.length > 0) {
      onConfirm({ expressionColumns: selectedExpressionColumns, geneColumn: selectedGeneColumn });
      onClose();
    }
  };

  if (!isOpen) return null;

  const sectionStyle: React.CSSProperties = {
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    maxHeight: 220,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  };

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    background: selected ? `${colors.accent}22` : 'transparent',
    border: selected ? `1px solid ${colors.accent}44` : '1px solid transparent',
    transition: 'all 0.1s',
    userSelect: 'none',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const pillBtn = (label: string, onClick: () => void, disabled?: boolean): React.ReactNode => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        background: 'transparent',
        color: disabled ? colors.textFaint : colors.textMuted,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  const canConfirm = !!selectedGeneColumn && selectedExpressionColumns.length > 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          width: 600,
          maxWidth: '92vw',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary, marginBottom: 4 }}>
            Map Expression Data
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            Select which column contains gene names and which columns contain expression values.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Gene identifier column */}
          <div>
            <div style={sectionHeaderStyle}>
              <span>Gene identifier column</span>
              <span style={{ fontSize: 11, color: colors.textFaint, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {selectedGeneColumn ? '1 selected' : 'none'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 8 }}>
              The column whose values are gene symbols (e.g. TP53, BRCA1).
            </div>
            <div style={sectionStyle}>
              {columns.map(col => (
                <div
                  key={`gene-${col}`}
                  style={rowStyle(selectedGeneColumn === col)}
                  onClick={() => {
                    setSelectedGeneColumn(col);
                    setSelectedExpressionColumns(prev => prev.filter(c => c !== col));
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selectedGeneColumn === col ? colors.accent : colors.border}`,
                    background: selectedGeneColumn === col ? colors.accent : 'transparent',
                    transition: 'all 0.1s',
                  }} />
                  <span style={labelStyle} title={col}>{col}</span>
                  {col === guessGeneColumn(columns) && (
                    <span style={{ fontSize: 10, color: colors.accent, fontWeight: 600, flexShrink: 0 }}>auto</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Expression columns */}
          <div>
            <div style={sectionHeaderStyle}>
              <span>Expression columns</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {pillBtn('All', () => setSelectedExpressionColumns(expressionCandidates), expressionCandidates.length === 0)}
                {pillBtn('None', () => setSelectedExpressionColumns([]))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 8 }}>
              {selectedExpressionColumns.length} of {expressionCandidates.length} selected — each becomes a switchable overlay.
            </div>
            <div style={sectionStyle}>
              {expressionCandidates.length === 0 ? (
                <div style={{ fontSize: 12, color: colors.textFaint, padding: '8px 4px' }}>
                  Select a gene column first.
                </div>
              ) : expressionCandidates.map(col => {
                const checked = selectedExpressionColumns.includes(col);
                return (
                  <div
                    key={`expr-${col}`}
                    style={rowStyle(checked)}
                    onClick={() => toggleExprColumn(col)}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${checked ? colors.accent : colors.border}`,
                      background: checked ? colors.accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.1s',
                    }}>
                      {checked && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={labelStyle} title={col}>{col}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, fontWeight: 500,
              padding: '7px 16px', borderRadius: 7,
              border: `1px solid ${colors.border}`,
              background: 'transparent',
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              fontSize: 13, fontWeight: 600,
              padding: '7px 18px', borderRadius: 7,
              border: 'none',
              background: canConfirm ? colors.accent : colors.bgHover,
              color: canConfirm ? '#fff' : colors.textFaint,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpressionColumnSelectorModal;
