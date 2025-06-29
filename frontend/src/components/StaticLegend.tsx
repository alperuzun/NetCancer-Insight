import React from 'react';

interface LegendItem {
  color: string;
  label: string;
}

interface Props {
  items: LegendItem[];
}

const StaticLegend: React.FC<Props> = ({ items }) => {
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
        zIndex: 1000,
      }}
    >
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Legend</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, index) => (
          <li key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <div
              style={{
                width: '15px',
                height: '15px',
                backgroundColor: item.color,
                marginRight: '8px',
                borderRadius: '3px',
              }}
            ></div>
            <span style={{ fontSize: '12px' }}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StaticLegend; 