import { useEffect, useRef, useState } from 'react'

// Color scale function for cancer drivers
const getColorForCancerDrivers = (count: number) => {
  if (count === 0) return '#ffa726' // Orange for 0
  if (count >= 3) return '#d32f2f' // Dark red for 3+
  
  // Gradient between orange and red for 1-2
  const t = count / 3 // This will give us 0.33 for count=1, 0.67 for count=2
  
  // Convert hex to RGB for interpolation
  const orange = { r: 255, g: 167, b: 38 } // #ffa726
  const red = { r: 211, g: 47, b: 47 }    // #d32f2f
  
  const r = Math.round(orange.r + (red.r - orange.r) * t)
  const g = Math.round(orange.g + (red.g - orange.g) * t)
  const b = Math.round(orange.b + (red.b - orange.b) * t)
  
  return `rgb(${r}, ${g}, ${b})`
}

type Props = {
  rightBoundary: number
  onClose: () => void
  items: { color: string; label: string }[];
}

export default function DraggablePaneLegend({ rightBoundary }: Props) {
  const width = 150;
  const height = 20;
  const margin = { top: 10, right: 10, bottom: 25, left: 10 };
  const prevRightBoundaryRef = useRef(rightBoundary);
  const [legendPosition, setLegendPosition] = useState(rightBoundary);

  useEffect(() => {
    const delta = rightBoundary - prevRightBoundaryRef.current;
    setLegendPosition(prev => prev + delta);
    console.log(delta)
    console.log(rightBoundary)
    console.log(legendPosition)
    prevRightBoundaryRef.current = rightBoundary;
  }, [rightBoundary]);

  // Calculate the left position based on rightBoundary
  // const leftPosition = `calc(100% - ${rightBoundary}px - ${width}px)`;

  return (
    <div
      style={{
        position: 'absolute',
        top: '85%',
        right: legendPosition,
        background: 'transparent',
        padding: 0,
        maxWidth: '150px',
        zIndex: 1000
      }}
    >
        <div>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: 'black', textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', padding: '2px 4px', borderRadius: '4px' }}>Cancer Driver Count</p>
        </div>
      <svg width={width} height={height + margin.top + margin.bottom}>
        <defs>
          <linearGradient id="legendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: getColorForCancerDrivers(0), stopOpacity: 1 }} />
            <stop offset="33%" style={{ stopColor: getColorForCancerDrivers(1), stopOpacity: 1 }} />
            <stop offset="67%" style={{ stopColor: getColorForCancerDrivers(2), stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: getColorForCancerDrivers(3), stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          <rect
            width={width - margin.left - margin.right}
            height={height}
            fill="url(#legendGradient)"
          />
          {/* Tick marks and labels */}
          {[0, 1, 2, '3+'].map((value, i) => (
            <g key={i} transform={`translate(${(i / 3) * (width - margin.left - margin.right)}, ${height})`}>
              <line y2="6" stroke="black" />
              <text
                y="20"
                textAnchor="middle"
                fontSize="12"
                fill="black"
              >
                {value}
              </text>
            </g>
          ))}
        </g>

      </svg>
    </div>
  )
} 