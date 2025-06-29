import React, { useRef } from 'react';

interface SvgForceGraphProps {
  width: number;
  height: number;
}

const SvgForceGraph: React.FC<SvgForceGraphProps> = ({ width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <svg 
      ref={svgRef} 
      width={width} 
      height={height} 
      style={{ background: '#fff' }}
    />
  );
};

export default SvgForceGraph; 