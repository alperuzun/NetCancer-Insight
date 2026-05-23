import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface GradientLegendProps {
  min: number;
  max: number;
  title: string;
}

const GradientLegend: React.FC<GradientLegendProps> = ({ min, max, title }) => {
  const { colors } = useTheme();
  const mid = (min + max) / 2;
  const gradient = 'linear-gradient(to right, rgb(0,0,255), rgb(255,255,255), rgb(255,0,0))';

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
        minWidth: 160,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </p>
      <div style={{ background: gradient, height: 12, borderRadius: 4, minWidth: 140 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 10, color: colors.textMuted }}>{min.toFixed(2)}</span>
        <span style={{ fontSize: 10, color: colors.textMuted }}>{mid.toFixed(2)}</span>
        <span style={{ fontSize: 10, color: colors.textMuted }}>{max.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default GradientLegend;
