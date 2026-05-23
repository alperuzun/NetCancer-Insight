import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface LegendItem {
  color: string;
  label: string;
}

interface Props {
  items: LegendItem[];
}

const StaticLegend: React.FC<Props> = ({ items }) => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        background: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        minWidth: 130,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Legend
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, index) => (
          <li key={index} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: item.color,
                borderRadius: 3,
                border: `1px solid ${colors.border}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: colors.textMuted }}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StaticLegend;
