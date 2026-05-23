import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Upload, Box, ZoomIn, BarChart2, Scissors, Download } from 'lucide-react'
import UploadFile from './UploadFile'
import ForceGraph from './ForceGraph'
import GeneTableModal from './GeneTableModal'
import GraphletAnalysis from './GraphletAnalysis'
import ComparativeAnalysis from './ComparativeAnalysis'
import { fetchGraph, getExpressionData, uploadFileDirect, clusterGraph } from '../services/api'
import FilterPanel from './FilterPanel'
import NetworkStatsPanel from './NetworkStatsPanel'
import html2canvas from 'html2canvas-pro'
import { useTheme } from '../context/ThemeContext'
// Import Canvas2Image - adjust import based on actual package export if needed
// import * as Canvas2Image from 'canvas2image-2'

interface ProgramProps {
  /** Called once when the first upload succeeds */
  onUploaded?: () => void
  /** True when App has split into two panels */
  paneSplit?: boolean
  /** Index of the panel (0 for first, 1 for second) */
  panelIndex?: number 
  /** Search query from the search bar */
  searchQuery?: string
  /** Callback to update search query in parent */
  onSearchChange?: (value: string) => void;
  showGeneList: boolean;
  setShowGeneList: (show: boolean) => void;
  /** Whether to show shared genes in this panel */
  showSharedGenes: boolean;
  /** Callback to update showSharedGenes in parent */
  onShowSharedGenesChange: (value: boolean) => void;
  /** List of shared genes between both graphs */
  sharedGenes: string[];
  /** The current graph data */
  graph: { nodes: any[]; links: any[] };
  /** Callback to update the graph data in the parent */
  onGraphChange: (graph: { nodes: any[]; links: any[] }) => void;
  expressionDataVersion: number;
  /** Called when user extracts a subgraph — parent can load it into the other panel */
  onSubgraphCreate?: (graph: { nodes: any[]; links: any[] }) => void;
}

// Helper function to convert oklch to rgb
// function oklchToRgb(oklch: string): string {
//   // Default to black if conversion fails
//   if (!oklch.startsWith('oklch')) return '#000000';
  
//   try {
//     // Create a temporary element to use the browser's color conversion
//     const temp = document.createElement('div');
//     temp.style.color = oklch;
//     document.body.appendChild(temp);
//     const rgb = window.getComputedStyle(temp).color;
//     document.body.removeChild(temp);
//     return rgb;
//   } catch (e) {
//     console.warn('Failed to convert oklch color:', oklch);
//     return '#000000';
//   }
// }

const Program = forwardRef<any, ProgramProps>(({
  onUploaded,
  paneSplit = false,
  panelIndex = 0,
  searchQuery = '',
  onSearchChange,
  showGeneList,
  setShowGeneList,
  showSharedGenes,
  onShowSharedGenesChange,
  sharedGenes,
  graph,
  onGraphChange,
  expressionDataVersion,
  onSubgraphCreate: _onSubgraphCreate,
}, ref) => {
  const { colors } = useTheme()
  const [is3D, setIs3D] = useState(false)
  const [selectedGenes, setSelectedGenes] = useState<string[]>([])
  const [graphStack, setGraphStack] = useState<Array<{ nodes: any[]; links: any[] }>>([])

  const [showGraphletAnalysis, setShowGraphletAnalysis] = useState(false)
  const [showComparativeAnalysis, setShowComparativeAnalysis] = useState(false)
  const [genes, setGenes] = useState<string[]>([])
  const [rightBoundary, setRightBoundary] = useState(16)
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const centerPosRef = useRef<{ x: number; y: number } | null>(null)
  const lastContainerWidthRef = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [minDegree, setMinDegree] = useState(0);
  const [maxDegree, setMaxDegree] = useState(20);
  const [isFilterTouched, setIsFilterTouched] = useState(false);
  const [expressionData, setExpressionData] = useState<any | null>(null);
  const [expressionColumns, setExpressionColumns] = useState<string[]>([]);
  const [selectedExpressionColumn, setSelectedExpressionColumn] = useState<string | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // Clustering state
  const [selectedClustering, setSelectedClustering] = useState<string>('none');
  const [nodeClusters, setNodeClusters] = useState<{ [nodeId: string]: number } | null>(null);
  const [clusteringLoading, setClusteringLoading] = useState(false);
  const clusteringOptions = ['none', 'louvain', 'leiden'];

  // Reset clustering when graph changes
  useEffect(() => {
    setSelectedClustering('none');
    setNodeClusters(null);
  }, [graph]);

  // Handler for clustering change
  const handleClusteringChange = async (algorithm: string) => {
    setSelectedClustering(algorithm);
    if (algorithm === 'none') {
      setNodeClusters(null);
      return;
    }
    setClusteringLoading(true);
    try {
      const res = await clusterGraph(panelIndex, algorithm);
      if (res && res.clusters) {
        setNodeClusters(res.clusters);
      } else {
        setNodeClusters(null);
      }
    } catch (err) {
      setNodeClusters(null);
      // Optionally show error
    } finally {
      setClusteringLoading(false);
    }
  };


  // Debounce localSearch updates to parent
  useEffect(() => {
    if (!onSearchChange) return;
    const handler = setTimeout(() => {
      onSearchChange(localSearch);
    }, 200);
    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange]);

  // Sync local search with prop (if parent changes externally)
  useEffect(() => { setLocalSearch(searchQuery); }, [searchQuery]);

  // Handlers that also set isFilterTouched
  const handleSearchChange = (value: string) => {
    setIsFilterTouched(true);
    setLocalSearch(value);
  };

  const handleMinDegreeChange = (value: number) => {
    setIsFilterTouched(true);
    setMinDegree(value);
  };

  const handleMaxDegreeChange = (value: number) => {
    setIsFilterTouched(true);
    setMaxDegree(value);
  };

  const handleShowSharedGenesChange = (value: boolean) => {
    onShowSharedGenesChange(value);
  };

  // Fetch expression data when graph loads or version changes
  useEffect(() => {
    const fetchExpressionData = async () => {
      if (graph.nodes.length > 0) {
        try {
          const res = await getExpressionData(panelIndex);
          const data = res.data;
          if (data && Object.keys(data).length > 0) {
            setExpressionData(data);
            const firstGene = Object.keys(data)[0];
            const columns = Object.keys(data[firstGene]);
            setExpressionColumns(columns);
            setSelectedExpressionColumn(columns[0]);
          } else {
            // Reset if no data
            setExpressionData(null);
            setExpressionColumns([]);
            setSelectedExpressionColumn(null);
          }
        } catch (error) {
          setExpressionData(null);
          setExpressionColumns([]);
          setSelectedExpressionColumn(null);
        }
      }
    };
    fetchExpressionData();
  }, [graph.nodes, panelIndex, expressionDataVersion]);

  // Upload and notify parent
  const refreshGraph = async () => {
    const res = await fetchGraph(panelIndex)
    onGraphChange(res.data) // Use the prop to update graph
    setGenes(res.data.nodes.map((n: any) => n.id))
    if (onUploaded) onUploaded()
  }


  // When pane is split or container size changes, recenter the graph
  useEffect(() => {
    if (!fgRef.current || graph.nodes.length === 0) return

    const recenterGraph = () => {
      if (!containerRef.current) return
      
      const containerWidth = containerRef.current.clientWidth
      // const containerHeight = containerRef.current.clientHeight

      // Wait for CSS/layout update so container dimensions are correct
      requestAnimationFrame(() => {
        if (!is3D) {
          let centerY = 0
          let centerX // Set default value for centerY
          
          // Second panel - keep existing centering logic
          if (centerPosRef.current && lastContainerWidthRef.current) {
            const widthDiff = containerWidth - lastContainerWidthRef.current
            if (panelIndex === 0) {
              centerX = centerPosRef.current.x - (widthDiff / 2)
            }
            else {
              centerX = centerPosRef.current.x - (widthDiff/2)
            }
            centerY = centerPosRef.current.y
          } else {
            // Initial positioning for both panels
            if (panelIndex === 0) {
              centerX = 0
            }
            else {
              // For the second panel, position it at the center of its container
              centerX = containerWidth / 2
            }
          }

          // Update the center position
          fgRef.current.centerAt(centerX, centerY)
          
          // Store the new center position and container width
          centerPosRef.current = { x: centerX, y: centerY }
          lastContainerWidthRef.current = containerWidth
        } else {
          // 3D centering is now handled by ForceGraph.tsx with zoomToFit
          // No need to manually position the camera here
        }
      })
    }

    recenterGraph()
    
    // Add resize observer to handle container size changes
    const resizeObserver = new ResizeObserver((_entries) => {
      // Update rightBoundary in real-time during resize
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        if (paneSplit) {
          if (panelIndex === 0) {
            setRightBoundary(containerWidth / 2 - 16)
          } else {
            setRightBoundary(16)
          }
        } else {
          setRightBoundary(16)
        }
      }
      recenterGraph()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [paneSplit, is3D, graph, panelIndex])

  // Store center position when graph is dragged
  const handleGraphDrag = () => {
    if (fgRef.current && !is3D) {
      const currentCenter = fgRef.current.centerAt();
      if (currentCenter) { // Check if currentCenter is defined
        centerPosRef.current = {
          x: currentCenter.x,
          y: currentCenter.y
        };

        if (containerRef.current) {
          lastContainerWidthRef.current = containerRef.current.clientWidth;
        }
      } else {
        console.warn("ForceGraph: centerAt did not return a valid center position.");
      }
    }
  };

  // Drag and drop handlers
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    setError(null);
    const files = e.dataTransfer.files;
    if (files.length !== 1) {
      setError('Please drop exactly one file.');
      return;
    }
    const file = files[0];
    setUploading(true);
    try {
      await uploadFileDirect(file, panelIndex);
      await refreshGraph();
    } catch (err) {
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleResetFilter = () => {
    setLocalSearch('');
    setMinDegree(0);
    setMaxDegree(20);
    onShowSharedGenesChange(false);
    setIsFilterTouched(false);
  };

  const handleBulkSelect = (genes: string[]) => {
    const nodeIds = new Set(graph.nodes.map((n: any) => n.id.toUpperCase()));
    const matched = genes.filter(g => nodeIds.has(g.toUpperCase()))
                         .map(g => graph.nodes.find((n: any) => n.id.toUpperCase() === g.toUpperCase())?.id)
                         .filter(Boolean) as string[];
    if (matched.length > 0) fgRef.current?.selectGenes(matched);
  };

  const handleExtractSubgraph = () => {
    if (selectedGenes.length === 0) return;
    const selectedSet = new Set(selectedGenes);

    // collect selected + 1-hop neighbors
    const subNodeIds = new Set(selectedGenes);
    graph.links.forEach((link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (selectedSet.has(src)) subNodeIds.add(tgt);
      if (selectedSet.has(tgt)) subNodeIds.add(src);
    });

    const subNodes = graph.nodes.filter((n: any) => subNodeIds.has(n.id));
    const subLinks = graph.links.filter((link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      return subNodeIds.has(src) && subNodeIds.has(tgt);
    });
    const subgraph = { nodes: subNodes, links: subLinks };

    // Drill-down: push current graph onto stack and navigate into subgraph
    setGraphStack(prev => [...prev, graph]);
    onGraphChange(subgraph);
    setSelectedGenes([]);

  };

  const handleGoBack = () => {
    if (graphStack.length === 0) return;
    const prev = graphStack[graphStack.length - 1];
    setGraphStack(s => s.slice(0, -1));
    onGraphChange(prev);
  };

  const handleExportGraph = async () => {
    if (!fgRef.current || !containerRef.current || !legendRef.current) {
      console.error('Export failed: Graph or legend ref not available.');
      return;
    }
    
    try {
      // Add a small delay to ensure the graph is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // A) Grab the graph's canvas using the exposed property
      const graphCanvas = fgRef.current.canvasElement as HTMLCanvasElement | null;
      if (!graphCanvas) {
        console.error('Export failed: ForceGraph canvas element not found via ref.');
        return;
      }

      // B) Grab the legend DOM node using the ref
      const legendEl = legendRef.current;
      
      // C) Snapshot legend into its own canvas using html2canvas-pro
      const legendSnapshotCanvas = await html2canvas(legendEl, {
        backgroundColor: '#ffffff', // Use white background for legend snapshot
        useCORS: true,
        allowTaint: true,
        logging: true,
      });

      // D) Create a master canvas that fits both graph + legend
      const graphRect = graphCanvas.getBoundingClientRect();
      const legendRect = legendSnapshotCanvas.getBoundingClientRect();
      
      // Calculate master canvas dimensions
      const masterWidth = graphRect.width; // Match graph width
      const spacing = 20; // Space between graph and legend
      const masterHeight = graphRect.height + legendRect.height + spacing; 

      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = masterWidth * 2; // Increase resolution
      masterCanvas.height = masterHeight * 2; // Increase resolution
      const ctx = masterCanvas.getContext('2d');

      if (!ctx) {
        console.error('Export failed: Could not get 2D context for master canvas.');
        return;
      }

      // E) Draw the graph's pixels onto the master canvas
      ctx.drawImage(
        graphCanvas,
        0, // source x
        0, // source y
        graphRect.width, // source width
        graphRect.height, // source height
        0, // destination x
        0, // destination y
        masterWidth * 2, // destination width (scaled)
        graphRect.height * 2 // destination height (scaled)
      );

      // F) Draw the legend snapshot right below, with a gap
      ctx.drawImage(
        legendSnapshotCanvas,
        0, // source x
        0, // source y
        legendRect.width, // source width
        legendRect.height, // source height
        0, // destination x (align with graph left)
        (graphRect.height + spacing) * 2, // destination y (below graph, scaled)
        legendRect.width * 2, // destination width (scaled)
        legendRect.height * 2 // destination height (scaled)
      );

      // G) Download the combined PNG
      const dataUrl = masterCanvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.download = `graph-with-legend-${panelIndex}-${new Date().toISOString()}.png`;
      link.href = dataUrl;
      link.click();

      // No temporary container to clean up in this approach

    } catch (error) {
      console.error('Error exporting graph with legend:', error);
    }
  };

  // Expose methods through ref
  useImperativeHandle(ref, () => ({
    handleExportGraph,
    exportAsSVG: () => {
      if (fgRef.current) {
        fgRef.current.exportAsSVG();
      }
    }
  }));

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full"
      style={{ background: colors.bgBase, transition: 'background 0.2s' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {graph.nodes.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: '60%',
              height: '70%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: dragOver ? colors.accent : colors.borderStrong,
              borderRadius: 20,
              background: dragOver ? colors.accentFaint : colors.bgPanel,
              transition: 'all 0.18s',
              padding: 32,
            }}
          >
            <Upload
              size={64}
              style={{ color: dragOver ? colors.accent : colors.textFaint, marginBottom: 16, transition: 'color 0.18s' }}
              strokeWidth={1.25}
            />
            <p style={{ color: colors.textMuted, marginBottom: 16, fontSize: 14 }}>Drag & drop a file, or</p>
            <UploadFile onUploadSuccess={refreshGraph} graphIndex={panelIndex} />
            {uploading && <p style={{ marginTop: 10, color: colors.accent, fontSize: 13 }}>Uploading…</p>}
            {error && <p style={{ marginTop: 10, color: colors.danger, fontSize: 13 }}>{error}</p>}
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              background: colors.bgPanel,
              borderBottom: `1px solid ${colors.border}`,
              zIndex: 10,
              position: 'relative',
              gap: 8,
            }}
          >
            <UploadFile onUploadSuccess={refreshGraph} graphIndex={panelIndex} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 3D toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <Box size={14} style={{ color: colors.textMuted }} />
                <input
                  type="checkbox"
                  checked={is3D}
                  onChange={e => setIs3D(e.target.checked)}
                  style={{ accentColor: colors.accent }}
                />
                <span style={{ fontSize: 12, color: colors.textMuted }}>3D</span>
              </label>

              {/* Zoom to fit (3D only) */}
              {is3D && (
                <button
                  onClick={() => fgRef.current?.zoomToFit(1000, 50)}
                  title="Zoom to Fit"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 8px', borderRadius: 6,
                    background: colors.accentFaint, color: colors.accent,
                    border: `1px solid ${colors.accent}`, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <ZoomIn size={13} />
                  Zoom to Fit
                </button>
              )}

              {/* Graphlet Analysis */}
              <button
                onClick={() => setShowGraphletAnalysis(true)}
                title="Graphlet Analysis"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 6,
                  background: colors.bgPanelSecondary,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <BarChart2 size={13} style={{ color: colors.accent }} />
                Graphlet Analysis
              </button>

              {/* Extract Subgraph — visible when genes are selected */}
              {selectedGenes.length > 0 && (
                <button
                  onClick={handleExtractSubgraph}
                  title="Extract selected genes + neighbors into a new subgraph"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 9px', borderRadius: 6,
                    background: colors.accentFaint,
                    color: colors.accent,
                    border: `1px solid ${colors.accent}`,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Scissors size={13} />
                  Extract Subgraph ({selectedGenes.length})
                </button>
              )}
            </div>
          </div>
          {/* Drill-down breadcrumb */}
          {graphStack.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 12px',
                background: colors.accentFaint,
                borderBottom: `1px solid ${colors.accent}44`,
                fontSize: 12, flexShrink: 0,
              }}
            >
              <button
                onClick={handleGoBack}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: colors.accent, fontWeight: 600, fontSize: 12, padding: '2px 6px', borderRadius: 4,
                }}
              >
                ← Back
              </button>
              <span style={{ color: colors.textFaint }}>Full Graph</span>
              <span style={{ color: colors.textFaint }}>›</span>
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>
                Subgraph · {graph.nodes.length} nodes, {graph.links.length} edges
              </span>
              <button
                onClick={() => {
                  const rows = graph.links.map((link: any) => {
                    const src = typeof link.source === 'object' ? link.source.id : link.source;
                    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
                    return `${src},${tgt}`;
                  });
                  const csv = ['gene1,gene2', ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `subgraph-${graph.nodes.slice(0, 3).map((n: any) => n.id).join('-')}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                style={{
                  marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 5,
                  background: 'transparent',
                  color: colors.accent,
                  border: `1px solid ${colors.accent}55`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Download size={11} />
                Save CSV
              </button>
            </div>
          )}

          {/* Overlay FilterPanel in top-right of ForceGraph */}
          <div className="relative w-full h-full flex-1">
            <div className="absolute top-4 left-4 z-30" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FilterPanel
                searchValue={localSearch}
                onSearchChange={handleSearchChange}
                minDegree={minDegree}
                maxDegree={isFinite(maxDegree) ? maxDegree : 0}
                onMinDegreeChange={handleMinDegreeChange}
                onMaxDegreeChange={handleMaxDegreeChange}
                showSharedGenes={showSharedGenes}
                onShowSharedGenesChange={handleShowSharedGenesChange}
                hasSecondGraph={paneSplit}
                isFilterTouched={isFilterTouched}
                onResetFilter={handleResetFilter}
                expressionColumns={expressionColumns}
                selectedExpressionColumn={selectedExpressionColumn}
                onExpressionColumnChange={setSelectedExpressionColumn}
                clusteringOptions={clusteringOptions}
                selectedClustering={selectedClustering}
                onClusteringChange={clusteringLoading ? () => {} : handleClusteringChange}
                onBulkSelect={handleBulkSelect}
              />
              {clusteringLoading && (
                <div style={{ marginTop: 4, fontSize: 11, color: colors.accent }}>Clustering…</div>
              )}
              <NetworkStatsPanel graph={graph} />
            </div>
            <div className="w-full h-full">
              <ForceGraph
                ref={fgRef}
                graph={graph}
                minDegree={minDegree}
                isFilterTouched={isFilterTouched}
                maxDegree={maxDegree}
                is3D={is3D}
                onDrag={handleGraphDrag}
                rightBoundary={rightBoundary}
                searchQuery={searchQuery}
                graphIndex={panelIndex}
                showSharedGenes={showSharedGenes}
                sharedGenes={sharedGenes}
                expressionData={expressionData}
                selectedExpressionColumn={selectedExpressionColumn}
                nodeClusters={nodeClusters}
                onSelectionChange={setSelectedGenes}
              />
            </div>
          </div>
          {showGeneList && (
            <GeneTableModal
              genes={genes}
              onClose={() => setShowGeneList(false)}
              onSelectGene={() => { /* Do nothing, handled by handleGeneClick */ }}
            />
          )}
          {showGraphletAnalysis && (
            <GraphletAnalysis
              graphIndex={panelIndex}
              secondGraphIndex={paneSplit ? (panelIndex === 0 ? 1 : 0) : undefined}
              onClose={() => setShowGraphletAnalysis(false)}
            />
          )}
          {showComparativeAnalysis && (
            <ComparativeAnalysis
              onClose={() => setShowComparativeAnalysis(false)}
              graph1={null} // Will pass actual graph data later
              graph2={null} // Will pass actual graph data later
            />
          )}
        </>
      )}
    </div>
  )
})

export default Program

