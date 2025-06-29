import { useEffect, useState } from 'react'

export default function ForceGraph3DWrapper({ graphData, onNodeClick }: any) {
  const [ForceGraph3D, setForceGraph3D] = useState<any>(null)

  useEffect(() => {
    import('react-force-graph-3d').then((mod) => {
      setForceGraph3D(() => mod.default)
    })
  }, [])

  if (!ForceGraph3D) return <div>Loading 3D graph...</div>

  return (
    <ForceGraph3DWrapper
        graphData={graphData}
        onNodeClick={onNodeClick}
    />
  )
}
