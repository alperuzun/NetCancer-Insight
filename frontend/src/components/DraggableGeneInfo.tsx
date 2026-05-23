import { useState } from 'react';
import { Rnd } from 'react-rnd';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type Props = {
  gene: string
  data: any
  onClose: () => void
}

export default function DraggableGeneInfo({ gene, data, onClose }: Props) {
  const { colors } = useTheme();
  const [bounds, setBounds] = useState({ x: 100, y: 100, width: 360, height: 300 });
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

  const toggleDropdown = (key: string) => {
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Rnd
      size={{ width: bounds.width, height: bounds.height }}
      position={{ x: bounds.x, y: bounds.y }}
      onDragStop={(_e, d) => setBounds(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(_e, _dir, ref, _delta, position) => setBounds({ width: ref.offsetWidth, height: ref.offsetHeight, ...position })}
      minWidth={250}
      minHeight={150}
      maxWidth={800}
      maxHeight={600}
      style={{
        zIndex: 50,
        overflow: 'auto',
        background: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgPanelSecondary,
          borderRadius: '10px 10px 0 0',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.accent }}>{gene}</span>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5,
            background: 'transparent', color: colors.textMuted,
            border: `1px solid ${colors.border}`, cursor: 'pointer',
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 12px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Gene Information
        </p>
        {data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {Object.entries(data).map(([key, value]) => (
              <div key={key} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <button
                  onClick={() => toggleDropdown(key)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '6px 0', background: 'none', border: 'none',
                    cursor: 'pointer', color: colors.textPrimary, fontSize: 12, fontWeight: 600,
                    textAlign: 'left',
                  }}
                >
                  <span>{key.replace(/_/g, ' ').toUpperCase()}</span>
                  {openDropdowns[key]
                    ? <ChevronUp size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />
                    : <ChevronDown size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />}
                </button>
                {openDropdowns[key] && (
                  <div style={{ padding: '2px 0 8px 10px', fontSize: 11, color: colors.textMuted }}>
                    {Array.isArray(value) ? (
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {(value as any[]).map((item, idx) => <li key={idx}>{String(item)}</li>)}
                      </ul>
                    ) : (
                      <p style={{ margin: 0 }}>{String(value)}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: colors.textMuted }}>Gene not found in annotation database.</p>
        )}
      </div>
    </Rnd>
  );
}
