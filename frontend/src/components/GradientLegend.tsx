import React from 'react';

interface GradientLegendProps {
  min: number;
  max: number;
  title: string;
}

const GradientLegend: React.FC<GradientLegendProps> = ({ min, max, title }) => {
  const mid = (min + max) / 2;
  // This gradient should match the getExpressionColor function in ForceGraph.tsx
  const gradient = 'linear-gradient(to right, rgb(0, 0, 255), rgb(255, 255, 255), rgb(255, 0, 0))';

  return (
    <div
      className="graph-legend"
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '10px',
        borderRadius: '5px',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
        zIndex: 100,
      }}
    >
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>{title}</h4>
      <div className="w-full h-4 rounded-sm" style={{ background: gradient, minWidth: '150px' }}></div>
      <div className="flex justify-between text-xs mt-1 w-full" style={{ fontSize: '12px' }}>
        <span>{min.toFixed(2)}</span>
        <span>{mid.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default GradientLegend; 