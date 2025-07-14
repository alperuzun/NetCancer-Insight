import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import UploadFile from './UploadFile'
import ForceGraph from './ForceGraph'
import GeneTableModal from './GeneTableModal'
import GraphletAnalysis from './GraphletAnalysis'
import ComparativeAnalysis from './ComparativeAnalysis'
import { fetchGraph, getExpressionData, uploadFileDirect } from '../services/api'
import FilterPanel from './FilterPanel'
import html2canvas from 'html2canvas-pro'
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
}, ref) => {
  const [is3D, setIs3D] = useState(false)
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

  // Log when search query changes
  useEffect(() => {
    console.log('Program: Search query changed:', { searchQuery, panelIndex });
  }, [searchQuery, panelIndex]);

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
          console.log(`No expression data for graph ${panelIndex}.`);
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
    console.log('Program: Refreshing graph data for panel', panelIndex);
    const res = await fetchGraph(panelIndex)
    console.log('Program: Received graph data:', res.data);
    onGraphChange(res.data) // Use the prop to update graph
    setGenes(res.data.nodes.map((n: any) => n.id))
    if (onUploaded) onUploaded()
  }

  // Log when graphlet analysis is shown/hidden
  useEffect(() => {
    console.log('Program: Graphlet analysis visibility changed:', {
      showGraphletAnalysis,
      graphNodesCount: graph.nodes.length,
      panelIndex
    });
  }, [showGraphletAnalysis, graph.nodes.length, panelIndex]);

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
          
          console.log("Center position:", centerPosRef.current)
          console.log("Last container width:", lastContainerWidthRef.current)
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

          console.log(`Panel ${panelIndex} - Setting center to:`, centerX, centerY)
          
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
        console.log("ForceGraph center:", currentCenter, "Panel:", panelIndex);
        
        centerPosRef.current = { 
          x: currentCenter.x,
          y: currentCenter.y 
        };
        
        if (containerRef.current) {
          lastContainerWidthRef.current = containerRef.current.clientWidth;
        }

        console.log("Center position updated:", centerPosRef.current);
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
      const response = await uploadFileDirect(file, panelIndex);
      console.log('Upload successful:', response.data);
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
    onShowSharedGenesChange(false); // Use the prop setter
    setIsFilterTouched(false);
  };

  const handleExportGraph = async () => {
    if (!fgRef.current || !containerRef.current || !legendRef.current) {
      console.error('Export failed: Graph or legend ref not available.');
      return;
    }
    
    try {
      console.log('Starting export process - compositing canvas and legend...');

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
      console.log('Snapshotting legend with html2canvas-pro...');
      const legendSnapshotCanvas = await html2canvas(legendEl, {
        backgroundColor: '#ffffff', // Use white background for legend snapshot
        useCORS: true,
        allowTaint: true,
        logging: true,
      });
      console.log('Legend snapshot canvas created.', legendSnapshotCanvas);

      // D) Create a master canvas that fits both graph + legend
      const graphRect = graphCanvas.getBoundingClientRect();
      const legendRect = legendSnapshotCanvas.getBoundingClientRect();
      
      console.log('Graph canvas dimensions:', { width: graphRect.width, height: graphRect.height });
      console.log('Legend snapshot dimensions:', { width: legendRect.width, height: legendRect.height });

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

      console.log('Master canvas created, dimensions:', { width: masterCanvas.width, height: masterCanvas.height });

      // E) Draw the graph's pixels onto the master canvas
      console.log('Drawing graph canvas onto master canvas...');
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
      console.log('Graph drawn.');

      // F) Draw the legend snapshot right below, with a gap
      console.log('Drawing legend snapshot onto master canvas...');
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
      console.log('Legend drawn.');

      // G) Download the combined PNG
      console.log('Generating final PNG data URL...');
      const dataUrl = masterCanvas.toDataURL('image/png');
      
      console.log('Final data URL generated (first 100 chars):', dataUrl.substring(0, 100));
      console.log('Final data URL length:', dataUrl.length);

      const link = document.createElement('a');
      link.download = `graph-with-legend-${panelIndex}-${new Date().toISOString()}.png`;
      link.href = dataUrl;
      link.click();

      console.log('Export completed successfully.');

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
      className={`relative flex-1 ${dragOver ? 'bg-gray-100' : ''} h-full`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {graph.nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center" style={{height: "100%", backgroundColor: "white"}}>
          <div
            className={`bg-white rounded-lg shadow flex flex-col items-center justify-center border-dashed border-4 border-gray-500 transition-colors duration-150 ${dragOver ? 'bg-blue-50 border-blue-500' : ''}`}
            style={{
              width: "70%",
              height: "80%",
              padding: 32,
              borderStyle: "dashed",
              borderColor: dragOver ? "#3b82f6" : "#6b7280",
              borderWidth: 3,
              borderRadius: "2rem"
            }}
          >
            <div className="flex flex-col items-center justify-center w-full h-full">
              <img src="https://img.icons8.com/ios/100/upload-to-cloud--v1.png" alt="Upload" className="mb-4 opacity-40" style={{ width: 100, height: 100 }} />
              <div className="mb-4 text-gray-500">Drag and drop or</div>
              <UploadFile onUploadSuccess={refreshGraph} graphIndex={panelIndex} />
              {uploading && <div className="mt-2 text-blue-500">Uploading...</div>}
              {error && <div className="mt-2 text-red-500">{error}</div>}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center p-1 bg-white z-10 border-b">
            <UploadFile onUploadSuccess={refreshGraph} graphIndex={panelIndex} />
            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={is3D}
                  onChange={e => setIs3D(e.target.checked)}
                />
                <span className="text-black">3D Mode</span>
              </label>
              {is3D && (
                <button 
                  onClick={() => {
                    if (fgRef.current) {
                      fgRef.current.zoomToFit(1000, 50);
                    }
                  }}
                  className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                >
                  Zoom to Fit
                </button>
              )}
              {expressionColumns.length > 0 && (
                <div className="flex items-center space-x-2">
                  <label htmlFor={`expression-selector-${panelIndex}`} className="text-sm font-medium text-black">Expression:</label>
                  <select
                    id={`expression-selector-${panelIndex}`}
                    value={selectedExpressionColumn || ''}
                    onChange={(e) => setSelectedExpressionColumn(e.target.value)}
                    className="block w-full pl-2 pr-8 py-1 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    {expressionColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* <button 
                onClick={() => setShowGeneList(!showGeneList)}
                className="bg-blue-500 text-white px-2 py-1 rounded text-sm"
              >
                {showGeneList ? 'Hide Genes' : 'Show Genes'}
              </button> */}
              <button 
                onClick={() => {
                  console.log('Program: Graphlet Analysis button clicked', {
                    graphNodesCount: graph.nodes.length,
                    panelIndex
                  });
                  setShowGraphletAnalysis(true);
                }}
                className="bg-green-500 text-white px-2 py-1 rounded text-sm"
              >
                Graphlet Analysis
              </button>
              {/* {paneSplit && (
                <button 
                  onClick={() => {
                    console.log('Program: Comparative Analysis button clicked', { panelIndex });
                    setShowComparativeAnalysis(true);
                  }}
                  className="bg-purple-500 text-white px-2 py-1 rounded text-sm"
                >
                  Comparative Analysis
                </button>
              )} */}
            </div>
          </div>
          {/* Overlay FilterPanel in top-right of ForceGraph */}
          <div className="relative w-full h-full flex-1">
            <div className="absolute top-4 left-4 z-30">
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
              />
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

