import { X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type InteractionData = {
  gene1: string;
  gene2: string;
  sources: string[];
};

type Props = {
  onClose: () => void;
  interactionData?: InteractionData;
};

export default function DraggableInteractionInfo({ onClose, interactionData }: Props) {
  const { colors } = useTheme();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          background: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          width: '90%',
          maxWidth: 360,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgPanelSecondary,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>Interaction Info</h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 6,
              background: 'transparent', color: colors.textMuted,
              border: `1px solid ${colors.border}`, cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1, fontSize: 13, color: colors.textPrimary }}>
          {interactionData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gene 1</span>
                <p style={{ margin: '2px 0 0', color: colors.accent, fontWeight: 600 }}>{interactionData.gene1}</p>
              </div>
              <div>
                <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gene 2</span>
                <p style={{ margin: '2px 0 0', color: colors.accent, fontWeight: 600 }}>{interactionData.gene2}</p>
              </div>
              <div>
                <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interaction Sources</span>
                {interactionData.sources.length > 0 ? (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {interactionData.sources.map((source, index) => (
                      <li key={index} style={{ marginBottom: 2, color: colors.textPrimary }}>{source}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: '4px 0 0', color: colors.textFaint }}>No interaction sources found</p>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: colors.textMuted }}>Loading interaction information…</p>
          )}
        </div>
      </div>
    </div>
  );
}
