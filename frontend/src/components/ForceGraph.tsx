import React, {
  forwardRef,
  useCallback,
  useState,
  useEffect,
  useRef,
  useImperativeHandle
} from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import ForceGraph3D from 'react-force-graph-3d'
import { searchGenes, getInteraction } from '../services/api'
import DraggableGeneInfo from './DraggableGeneInfo'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import StaticLegend from './StaticLegend'
import GradientLegend from './GradientLegend'
import DraggableInteractionInfo from './DraggableInteractionInfo'
// import ReactDOM from 'react-dom/client'
// import SvgForceGraph from './SvgForceGraph'
import UnifiedGeneAnnotationModal from './UnifiedGeneAnnotationModal'
import PolygonSelector from './PolygonSelector'
import { useTheme } from '../context/ThemeContext'

// interface NodeObject {
//   id: string
//   name: string
//   val?: number
//   [key: string]: any
// }

// interface LinkObject {
//   source: string | NodeObject
//   target: string | NodeObject
//   [key: string]: any
// }

// interface GraphData {
//   nodes: NodeObject[]
//   links: LinkObject[]
// }

// ── SVG export helpers (module-level, no React dependencies) ─────────────────

function _svgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _legendGradient(
  x: number, y: number, barW: number,
  title: string, gradId: string,
  labels: Array<{ text: string; pct: number }>
): string {
  const BAR_H = 14, PAD = 14, BOX_W = barW + PAD * 2;
  const BOX_H = PAD + 16 + 8 + BAR_H + 18 + PAD;
  const labelY = (PAD + 20 + BAR_H + 14).toFixed(1);
  const labelsStr = labels.map(l => {
    const lx = (PAD + l.pct * barW).toFixed(1);
    const anchor = l.pct === 0 ? 'start' : l.pct === 1 ? 'end' : 'middle';
    return `<text x="${lx}" y="${labelY}" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" text-anchor="${anchor}" fill="#6b7280">${_svgEscape(l.text)}</text>`;
  }).join('');
  return `<g transform="translate(${x},${y})">` +
    `<rect x="0" y="0" width="${BOX_W}" height="${BOX_H}" rx="6" fill="white" stroke="#cccccc" stroke-width="1"/>` +
    `<text x="${PAD}" y="${PAD + 12}" font-family="Helvetica Neue,Arial,sans-serif" font-size="12" font-weight="600" fill="#1f2937">${_svgEscape(title)}</text>` +
    `<rect x="${PAD}" y="${PAD + 20}" width="${barW}" height="${BAR_H}" fill="url(#${gradId})" rx="2"/>` +
    labelsStr +
    `</g>`;
}

function _legendSwatches(
  x: number, y: number,
  title: string,
  items: Array<{ color: string; label: string }>
): string {
  const PAD = 14, SW = 12, ROW = 20, BOX_W = 190;
  const BOX_H = PAD * 2 + 22 + items.length * ROW;
  const swatchRows = items.map((item, i) => {
    const iy = PAD + 22 + i * ROW;
    return `<rect x="${PAD}" y="${iy}" width="${SW}" height="${SW}" rx="2" fill="${item.color}" stroke="#33333333" stroke-width="0.5"/>` +
      `<text x="${PAD + SW + 8}" y="${(iy + SW * 0.8).toFixed(1)}" font-family="Helvetica Neue,Arial,sans-serif" font-size="11" fill="#374151">${_svgEscape(item.label)}</text>`;
  }).join('');
  return `<g transform="translate(${x},${y})">` +
    `<rect x="0" y="0" width="${BOX_W}" height="${BOX_H}" rx="6" fill="white" stroke="#cccccc" stroke-width="1"/>` +
    `<text x="${PAD}" y="${PAD + 12}" font-family="Helvetica Neue,Arial,sans-serif" font-size="12" font-weight="600" fill="#1f2937">${_svgEscape(title)}</text>` +
    swatchRows +
    `</g>`;
}

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

// Color scale for expression data (sky-blue -> white -> red)
const getExpressionColor = (value: number, min: number, max: number) => {
  if (min === max) return '#ffffff'; // neutral if no variation

  const mid = (min + max) / 2;
  let t = (value - min) / (max - min); // normalize to 0-1

  // Sky-blue for low (visible on dark bg), white for mid, red for high
  const blue = { r: 56, g: 189, b: 248 };
  const white = { r: 255, g: 255, b: 255 };
  const red = { r: 239, g: 68, b: 68 };

  let from, to;
  if (value < mid) {
    from = blue;
    to = white;
    t = (value - min) / (mid - min);
  } else {
    from = white;
    to = red;
    t = (value - mid) / (max - mid);
  }

  if (isNaN(t)) t = 0.5; // handle case where mid == min or mid == max

  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b_ = Math.round(from.b + (to.b - from.b) * t);
  
  return `rgb(${r}, ${g}, ${b_})`;
}

// Exported color palette for clusters (20 distinct, background-safe colors)
export const clusterColors = [
  '#38bdf8', '#fb923c', '#4ade80', '#f87171', '#c084fc', '#f472b6', '#e879f9', '#a3e635', '#facc15', '#34d399',
  '#818cf8', '#fb7185', '#2dd4bf', '#fbbf24', '#60a5fa', '#a78bfa', '#86efac', '#fca5a5', '#93c5fd', '#d8b4fe'
];

// Helper to generate legend items for clusters
export function getClusterLegendItems(nodeClusters: { [nodeId: string]: number } | null) {
  if (!nodeClusters) return [];
  const clusterSet = new Set<number>(Object.values(nodeClusters));
  const items = Array.from(clusterSet).sort((a, b) => a - b).map(clusterId => ({
    color: clusterColors[clusterId % clusterColors.length],
    label: `Cluster ${clusterId + 1}`
  }));
  return items;
}

const ForceGraph = forwardRef(
  (
    { 
      graph, 
      is3D, 
      onDrag, 
      searchQuery = '', 
      minDegree = 0,
      maxDegree = 20, 
      graphIndex,
      showSharedGenes = false,
      sharedGenes = [],
      isFilterTouched = false,
      expressionData = null,
      selectedExpressionColumn = null,
      log2Transform = false,
      nodeClusters = null,
      onSelectionChange,
      onSimulationChange,
    }: {
      graph: { nodes: any[]; links: any[] };
      is3D: boolean;
      onDrag?: () => void;
      rightBoundary?: number;
      searchQuery?: string;
      minDegree?: number;
      maxDegree?: number;
      graphIndex: number;
      showSharedGenes?: boolean;
      sharedGenes?: string[];
      isFilterTouched?: boolean;
      expressionData?: any | null;
      selectedExpressionColumn?: string | null;
      log2Transform?: boolean;
      nodeClusters?: { [nodeId: string]: number } | null;
      onSelectionChange?: (genes: string[]) => void;
      onSimulationChange?: (running: boolean) => void;
    },
    ref: React.Ref<any>
  ) => {
    const { colors } = useTheme()
    const [selectedGene, setSelectedGene] = useState<any | null>(null)
    const [hoverNode, setHoverNode] = useState<any>(null)
    const [_isDragging, _setIsDragging] = useState(false)
    const [_lastMousePos, _setLastMousePos] = useState({ x: 0, y: 0 })
    const [showLegend, _setShowLegend] = useState(true)
    const [searchResults, setSearchResults] = useState<string[]>([])
    const [legendItems, setLegendItems] = useState<{ color: string; label: string }[]>([]);
    const [showInteractionInfo, setShowInteractionInfo] = useState(false);
    const [interactionData, setInteractionData] = useState<any>(null);
    const [linksWithInteractions, setLinksWithInteractions] = useState<Set<string>>(new Set());
    const [expressionValueRange, setExpressionValueRange] = useState<{min: number, max: number} | null>(null);
    const [shouldZoomToFit, setShouldZoomToFit] = useState(false);
    const [isPolygonSelectionActive, setIsPolygonSelectionActive] = useState(false);
    const [selectedNodesFromPolygon, setSelectedNodesFromPolygon] = useState<string[]>([]);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [nodeUnderMouse, setNodeUnderMouse] = useState<any>(null);
    const [showBulkAnnotationModal, setShowBulkAnnotationModal] = useState(false);

    // Notify parent when polygon selection changes
    useEffect(() => {
      onSelectionChange?.(selectedNodesFromPolygon);
    }, [selectedNodesFromPolygon]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear polygon selection when graph changes (drill-down, back, new upload)
    useEffect(() => {
      setSelectedNodesFromPolygon([]);
      setIsPolygonSelectionActive(false);
    }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

    // No longer using activeLegendColorsRef or clearing effect
    // const activeLegendColorsRef = useRef<{ [color: string]: string }>({});


    // Handle shift key events
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // console.log("Key pressed:", e.key, "Shift state:", e.shiftKey);
        if (e.key === 'Shift') {
          setIsShiftPressed(true);
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        // console.log("Key released:", e.key);
        if (e.key === 'Shift') {
          setIsShiftPressed(false);
        }
      };

      // Add listeners to both document and window to ensure capture
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      window.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('keyup', handleKeyUp, true);

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
      };
    }, []);

    // Update search results when query changes
    useEffect(() => {
      const updateSearch = async () => {
        const res = await searchGenes(searchQuery.trim().toLowerCase(), minDegree, maxDegree, graphIndex);
        let results = res.data.gene;

        // If showSharedGenes is true, filter to only show shared genes
        // if (showSharedGenes) {
        //   results = results.filter((gene: string) => sharedGenes.includes(gene));
        // }

        setSearchResults(results);
      };
      updateSearch();
    }, [searchQuery, minDegree, maxDegree, showSharedGenes, sharedGenes, graphIndex, graph.nodes.length]);

    const handleNodeClick = useCallback(async (node: any, event?: any) => {
      // Check if shift is pressed (use both state and event property)
      if (isShiftPressed || (event && event.shiftKey)) {
        setIsPolygonSelectionActive(true);
        return;
      }

      // Show unified annotation modal for single gene
      setSelectedNodesFromPolygon([node.id]);
      setShowBulkAnnotationModal(true);
    }, [isShiftPressed])

    // Handle background click for polygon selection
    const handleBackgroundClick = useCallback((event?: any) => {
      // If no node is under mouse and shift is pressed, activate polygon selection
      if (!nodeUnderMouse && (isShiftPressed || (event && event.shiftKey))) {
        setIsPolygonSelectionActive(true);
      }
    }, [nodeUnderMouse, isShiftPressed])



    // Function to get a unique key for a link
    const getLinkKey = (source: any, target: any) => {
      const gene1 = typeof source === 'object' ? source.id : source;
      const gene2 = typeof target === 'object' ? target.id : target;
      return [gene1, gene2].sort().join('-');
    };

    // Check for interactions when graph data changes
    useEffect(() => {
      const checkAllInteractions = async () => {
        const newLinksWithInteractions = new Set<string>();
        
        // Process links in batches to avoid overwhelming the server
        const batchSize = 10;
        for (let i = 0; i < graph.links.length; i += batchSize) {
          const batch = graph.links.slice(i, i + batchSize);
          const promises = batch.map(async (link) => {
            const gene1 = typeof link.source === 'object' ? link.source.id : link.source;
            const gene2 = typeof link.target === 'object' ? link.target.id : link.target;
            
            try {
              const response = await getInteraction(gene1, gene2);
              if (response.data.sources && response.data.sources.length > 0) {
                const linkKey = getLinkKey(link.source, link.target);
                newLinksWithInteractions.add(linkKey);
              }
            } catch (error) {
              console.error(`Error checking interaction for ${gene1}-${gene2}:`, error);
            }
          });
          
          // Wait for the current batch to complete before processing the next batch
          await Promise.all(promises);
        }
        
        setLinksWithInteractions(newLinksWithInteractions);
      };

      if (graph.links.length > 0) {
        checkAllInteractions();
      }
    }, [graph.links]);

    const handleLinkClick = useCallback(async (link: any) => {
      setShowInteractionInfo(true);
      
      try {
        // Get the gene IDs from the link
        const gene1 = typeof link.source === 'object' ? link.source.id : link.source;
        const gene2 = typeof link.target === 'object' ? link.target.id : link.target;
        
        // Fetch interaction data
        const response = await getInteraction(gene1, gene2);
        
        // Extract only the needed data
        setInteractionData({
          gene1,
          gene2,
          sources: response.data.sources || []
        });
      } catch (error) {
        console.error('Error fetching interaction data:', error);
        setInteractionData(null);
      }
    }, []);

    // Function to determine link color and width
    const getLinkStyle = useCallback((link: any) => {
      const linkKey = getLinkKey(link.source, link.target);
      const hasInteraction = linksWithInteractions.has(linkKey);
      return {
        color: hasInteraction ? colors.accent : colors.borderStrong,
        width: hasInteraction ? 2 : 0.7
      };
    }, [linksWithInteractions, colors]);

    const onHover2D = (node: any | null) => {
      setHoverNode(node)
      setNodeUnderMouse(node)
    }
    const onHover3D = (node: any | null) => {
      setHoverNode(node)
      setNodeUnderMouse(node)
    }

    // const handleMouseDown = (e: React.MouseEvent) => {
    //   console.log("Mouse down on graph container")
    //   if (e.target === e.currentTarget) {
    //     console.log("Mouse down on graph container")
    //     _setIsDragging(true)
    //     _setLastMousePos({ x: e.clientX, y: e.clientY })
    //   }
    // }


    // const handleMouseMove = (e: React.MouseEvent) => {
    //   if (isDragging && fgRef.current) {
    //     console.log("Mouse move while dragging graph")
    //     const dx = e.clientX - lastMousePos.x
    //     const dy = e.clientY - lastMousePos.y
        
    //     if (is3D) {
    //       // For 3D, we need to rotate the camera
    //       const camera = fgRef.current.camera()
    //       const distance = camera.position.z
    //       const angleX = (dx / distance) * 0.5
    //       const angleY = (dy / distance) * 0.5
          
    //       fgRef.current.cameraPosition(
    //         {
    //           x: camera.position.x + dx * 0.1,
    //           y: camera.position.y - dy * 0.1,
    //           z: camera.position.z
    //         },
    //         undefined,
    //         0
    //       )
    //     } else {
    //       // For 2D, we can simply translate the graph
    //       const currentCenter = fgRef.current.centerAt()
    //       const newCenter = {
    //         x: currentCenter.x - dx,
    //         y: currentCenter.y - dy
    //       }
    //       console.log("Moving graph to:", newCenter)
    //       fgRef.current.centerAt(newCenter.x, newCenter.y)
    //       // Call onDrag to update the center position
    //       onDrag?.()
    //     }
        
    //     setLastMousePos({ x: e.clientX, y: e.clientY })
    //   }
    // }

    // const handleMouseUp = () => {
    //   if (isDragging) {
    //     console.log("Mouse up after dragging graph")
    //     setIsDragging(false)
    //   }
    // }

    // Re-implement Effect to update legend items based on filter state
    useEffect(() => {
        const items: { color: string; label: string }[] = [];

        // If there are selected nodes, only show cyan/white legend
        if (selectedNodesFromPolygon.length > 0) {
            items.push({ color: '#00ffff', label: 'Selected Genes' });
            items.push({ color: '#ffffff', label: 'Other Genes' });
            setLegendItems(items);
            return;
        }

        // If visualizing expression data, the GradientLegend is shown, so StaticLegend is not needed for it
        if (selectedExpressionColumn && expressionValueRange) {
          // No items for static legend, as gradient legend is active
        } else if (isFilterTouched) {
            // Legend for Green/Yellow/Grey scheme
            // Add items if those colors could potentially be present based on filters
            // Check if there are *any* search results that could be shared to show Green
            const hasPossibleGreen = searchResults.some(id => sharedGenes.includes(id) && showSharedGenes);
            // Check if there are *any* search results that are NOT shared to show Yellow
            const hasPossibleYellow = searchResults.some(id => !sharedGenes.includes(id));

            if (hasPossibleGreen) items.push({ color: '#33ff85', label: 'In Search & Shared' });
            if (hasPossibleYellow) items.push({ color: '#ffff33', label: 'In Search Only' });
            // Grey is always a possibility if filtering is active
            items.push({ color: '#d3d3d3', label: 'Filtered Out' });

        } else if (showSharedGenes) {
            // Legend for Green/Grey scheme
             // Only add items if those colors could potentially be present based on data and filters
            if (sharedGenes.length > 0) items.push({ color: '#33ff85', label: 'In Shared Genes' });
            // Grey is always a possibility if filtering is active
            items.push({ color: '#d3d3d3', label: 'Not Shared' });

        } else {
            // Legend for Default Cancer Driver scheme
             // These are always potentially present, regardless of which nodes are in the current graph state
            items.push({ color: getColorForCancerDrivers(3), label: '>= 3 Cancer Drivers' });
            items.push({ color: getColorForCancerDrivers(1), label: '1-2 Cancer Drivers' });
            items.push({ color: getColorForCancerDrivers(0), label: '0 Cancer Drivers' });
        }
        
        // Ensure uniqueness (though the logic above should handle this)
        const seenLabels = new Set<string>();
        const uniqueItems: { color: string; label: string }[] = [];
        for(const item of items) {
            if(!seenLabels.has(item.label)){
                seenLabels.add(item.label);
                uniqueItems.push(item);
            }
        }
        setLegendItems(uniqueItems);

    }, [isFilterTouched, showSharedGenes, searchResults, sharedGenes, selectedExpressionColumn, expressionValueRange, selectedNodesFromPolygon]);

    // Calculate expression value range when data changes
    useEffect(() => {
        if (selectedExpressionColumn && expressionData) {
            const values = (Object.keys(expressionData)
                .map(geneId => expressionData[geneId][selectedExpressionColumn])
                .filter(value => typeof value === 'number') as number[]);
            const display = log2Transform ? values.map(v => Math.log2(Math.max(0, v) + 1)) : values;
            if (display.length > 0) {
                setExpressionValueRange({ min: Math.min(...display), max: Math.max(...display) });
            }
        } else {
            setExpressionValueRange(null);
        }
    }, [expressionData, selectedExpressionColumn, log2Transform]);

    // Updated getNodeColor to use cyan for hovered node
    const getNodeColor = useCallback((node: any) => {
        // Cluster coloring takes highest precedence
        if (nodeClusters && nodeClusters[node.id] !== undefined) {
          const clusterId = nodeClusters[node.id];
          return clusterColors[clusterId % clusterColors.length];
        }
        // If this node is hovered, always show cyan
        if (hoverNode && hoverNode.id === node.id) {
            return '#00ffff';
        }
        // Highlight nodes selected by polygon - use cyan for selected nodes
        if (selectedNodesFromPolygon.includes(node.id)) {
            return '#00ffff'; // Cyan for selected nodes
        }
        // If there are selected nodes, make all other nodes white
        if (selectedNodesFromPolygon.length > 0) {
            return '#ffffff'; // White for non-selected nodes when there are selections
        }
        // Expression data coloring takes precedence
        if (selectedExpressionColumn && expressionData && expressionValueRange) {
            const geneId = node.id.toUpperCase();
            if (expressionData[geneId] && typeof expressionData[geneId][selectedExpressionColumn] === 'number') {
                const raw = expressionData[geneId][selectedExpressionColumn];
                const value = log2Transform ? Math.log2(Math.max(0, raw) + 1) : raw;
                return getExpressionColor(value, expressionValueRange.min, expressionValueRange.max);
            }
            return '#94a3b8'; // Slate-400 — clearly distinct from the expression colour scale
        }
        const inSearchResults = searchResults.includes(node.id);
        const inSharedGenes = sharedGenes.includes(node.id);
        if (isFilterTouched) {
            // Green/Yellow/Grey scheme when any filter is touched
            if (inSearchResults && (inSharedGenes && showSharedGenes)) return '#33ff85'; // Green (In Search & Shared)
            else if (inSearchResults) return '#ffff33'; // Yellow (In Search Only)
            // No blue color
            return '#d3d3d3'; // Grey (Filtered Out)
        } else if (showSharedGenes) {
            // Green/Grey scheme when ONLY Show Shared Genes is true
            if (inSharedGenes) return '#33ff85'; // Green (In Shared Genes)
            return '#d3d3d3'; // Grey (Not Shared)
        } else {
            // Default cancer driver coloring
            const cancerDrivers = node.cancer_drivers || 0;
            return getColorForCancerDrivers(cancerDrivers);
        }
    }, [
        nodeClusters,
        isFilterTouched, showSharedGenes, searchResults, sharedGenes, expressionData, selectedExpressionColumn, log2Transform, expressionValueRange, selectedNodesFromPolygon, hoverNode
    ]);

    const nodeCanvasObject = useCallback(
      (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.id
        const fontSize = 12 / globalScale
        
        // Calculate node degree (number of connections)
        const degree = node.val || 1
        // Scale radius based on degree, with a minimum and maximum size
        const minRadius = 8
        const maxRadius = 20
        const radius = Math.min(maxRadius, Math.max(minRadius, minRadius + degree * 2))

        // Get color using the updated getNodeColor logic
        const nodeColor = getNodeColor(node);

        ctx.beginPath();
        ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node === hoverNode ? '#ff7043' : nodeColor;
        ctx.shadowColor = node === hoverNode ? '#ff7043' : 'transparent';
        ctx.shadowBlur = node === hoverNode ? 15 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#00000088';
        ctx.stroke();

        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.textPrimary;
        ctx.fillText(label, node.x!, node.y!);
      },
      [hoverNode, getNodeColor, colors.textPrimary] // Dependencies for nodeCanvasObject
    );

    // Reverted handleEngineStop to its simpler form
    const handleEngineStop = useCallback(() => {
        onDrag?.();
        onSimulationChange?.(false);

        // If we're in 3D mode and should zoom to fit, do it now
        if (is3D && shouldZoomToFit && fgRef.current) {
            fgRef.current.zoomToFit(1000, 50);
            setShouldZoomToFit(false);
        }
    }, [onDrag, onSimulationChange, is3D, shouldZoomToFit]);

    // unify ref for both modes - This ref points to the library instance (ForceGraph2D or ForceGraph3D)
    const fgRef = useRef<any>(null);

    // Build a complete, publication-quality SVG string from current graph state.
    // Used by both exportAsSVG (download .svg) and exportAsPNG (render to canvas at 3×).
    const _buildSVG = useCallback((): string => {
      if (!fgRef.current || !graph.nodes.length) return '';

      const bbox = fgRef.current.getGraphBbox();
      if (!bbox || !Array.isArray(bbox.x) || !Array.isArray(bbox.y) ||
          bbox.x.length !== 2 || bbox.y.length !== 2) return '';

      const [x1, x2] = bbox.x;
      const [y1, y2] = bbox.y;
      if (!isFinite(x1) || !isFinite(x2) || !isFinite(y1) || !isFinite(y2)) return '';

      const PAD = 80;
      const LEGEND_GUTTER = 24;
      const LEGEND_W = 208;
      const graphW = Math.abs(x2 - x1) + PAD * 2;
      const graphH = Math.abs(y2 - y1) + PAD * 2;
      const totalW = graphW + LEGEND_GUTTER + LEGEND_W;
      const totalH = Math.max(graphH, 300);
      const offsetX = -x1 + PAD;
      const offsetY = -y1 + PAD;

      // Determine current visualization mode
      const clusterItems = nodeClusters ? getClusterLegendItems(nodeClusters) : null;
      const hasCluster = !!(clusterItems && clusterItems.length > 0);
      const hasExpr = !!(selectedExpressionColumn && expressionValueRange);
      const hasSelection = selectedNodesFromPolygon.length > 0;
      const needsCancerGrad = !hasCluster && !hasExpr && !hasSelection && !isFilterTouched && !showSharedGenes;

      // Node color without hover effect (exports are static)
      const getExportNodeColor = (node: any): string => {
        if (nodeClusters && nodeClusters[node.id] !== undefined) {
          return clusterColors[nodeClusters[node.id] % clusterColors.length];
        }
        if (hasSelection) {
          return selectedNodesFromPolygon.includes(node.id) ? '#00ffff' : '#ffffff';
        }
        if (hasExpr) {
          const geneId = node.id.toUpperCase();
          const raw = expressionData?.[geneId]?.[selectedExpressionColumn!];
          if (typeof raw === 'number') {
            const val = log2Transform ? Math.log2(Math.max(0, raw) + 1) : raw;
            return getExpressionColor(val, expressionValueRange!.min, expressionValueRange!.max);
          }
          return '#94a3b8'; // no-data — same as canvas render
        }
        const inSearch = searchResults.includes(node.id);
        const inShared = sharedGenes.includes(node.id);
        if (isFilterTouched) {
          if (inSearch && inShared && showSharedGenes) return '#33ff85';
          if (inSearch) return '#ffff33';
          return '#d3d3d3';
        }
        if (showSharedGenes) return inShared ? '#33ff85' : '#d3d3d3';
        return getColorForCancerDrivers(node.cancer_drivers || 0);
      };

      // Gradient defs
      const defsContent: string[] = [];
      if (needsCancerGrad) {
        defsContent.push(
          `<linearGradient id="cancerGrad" x1="0" x2="1" y1="0" y2="0">` +
          `<stop offset="0%" stop-color="#ffa726"/>` +
          `<stop offset="100%" stop-color="#d32f2f"/>` +
          `</linearGradient>`
        );
      }
      if (hasExpr) {
        defsContent.push(
          `<linearGradient id="exprGrad" x1="0" x2="1" y1="0" y2="0">` +
          `<stop offset="0%" stop-color="rgb(56,189,248)"/>` +
          `<stop offset="50%" stop-color="rgb(255,255,255)"/>` +
          `<stop offset="100%" stop-color="rgb(239,68,68)"/>` +
          `</linearGradient>`
        );
      }

      // Links
      const linkLines: string[] = [];
      for (const link of graph.links) {
        const sid = typeof link.source === 'object' ? link.source.id : link.source;
        const tid = typeof link.target === 'object' ? link.target.id : link.target;
        const s = graph.nodes.find(n => n.id === sid);
        const t = graph.nodes.find(n => n.id === tid);
        if (!s || !t || !isFinite(s.x) || !isFinite(s.y) || !isFinite(t.x) || !isFinite(t.y)) continue;
        const lk = [sid, tid].sort().join('-');
        const isInteraction = linksWithInteractions.has(lk);
        linkLines.push(
          `<line x1="${(s.x + offsetX).toFixed(1)}" y1="${(s.y + offsetY).toFixed(1)}"` +
          ` x2="${(t.x + offsetX).toFixed(1)}" y2="${(t.y + offsetY).toFixed(1)}"` +
          ` stroke="${isInteraction ? '#7c3aed' : '#94a3b8'}"` +
          ` stroke-width="${isInteraction ? 2 : 0.8}" stroke-opacity="0.85"/>`
        );
      }

      // Nodes
      const nodeElems: string[] = [];
      for (const node of graph.nodes) {
        if (!isFinite(node.x) || !isFinite(node.y)) continue;
        const nx = (node.x + offsetX).toFixed(1);
        const ny = (node.y + offsetY).toFixed(1);
        const r = Math.min(20, Math.max(8, 8 + (node.val || 1) * 2));
        const fill = getExportNodeColor(node);
        nodeElems.push(
          `<circle cx="${nx}" cy="${ny}" r="${r}" fill="${fill}" stroke="#00000055" stroke-width="1"/>` +
          `<text x="${nx}" y="${ny}" text-anchor="middle" dominant-baseline="central"` +
          ` font-family="Helvetica Neue,Arial,sans-serif" font-size="9" font-weight="500"` +
          ` fill="#1e293b">${_svgEscape(node.id)}</text>`
        );
      }

      // Legend
      const LX = graphW + LEGEND_GUTTER;
      const LY = 20;
      let legendSVG = '';
      if (hasExpr && expressionValueRange) {
        const mid = (expressionValueRange.min + expressionValueRange.max) / 2;
        const gradTitle = log2Transform ? `${selectedExpressionColumn!} (log₂)` : selectedExpressionColumn!;
        // BOX_H from _legendGradient: PAD + 16 + 8 + BAR_H + 18 + PAD = 14+16+8+14+18+14 = 84
        const GRAD_BOX_H = 84;
        legendSVG = _legendGradient(LX, LY, 180, gradTitle, 'exprGrad', [
          { text: expressionValueRange.min.toFixed(2), pct: 0 },
          { text: mid.toFixed(2), pct: 0.5 },
          { text: expressionValueRange.max.toFixed(2), pct: 1 },
        ]);
        // No-data swatch below gradient legend
        const swY = LY + GRAD_BOX_H + 6;
        legendSVG +=
          `<g transform="translate(${LX},${swY})">` +
          `<rect x="0" y="0" width="208" height="30" rx="6" fill="white" stroke="#cccccc" stroke-width="1"/>` +
          `<rect x="14" y="9" width="12" height="12" rx="2" fill="#94a3b8"/>` +
          `<text x="32" y="19.5" font-family="Helvetica Neue,Arial,sans-serif" font-size="11" fill="#374151">Not measured</text>` +
          `</g>`;
      } else if (needsCancerGrad) {
        legendSVG = _legendGradient(LX, LY, 180, 'Cancer Drivers', 'cancerGrad', [
          { text: '0', pct: 0 },
          { text: '1–2', pct: 0.5 },
          { text: '≥3', pct: 1 },
        ]);
      } else if (hasCluster && clusterItems) {
        legendSVG = _legendSwatches(LX, LY, 'Clusters', clusterItems);
      } else if (legendItems.length > 0) {
        legendSVG = _legendSwatches(LX, LY, 'Legend', legendItems);
      }

      return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(totalW)}" height="${Math.ceil(totalH)}"` +
          ` viewBox="0 0 ${Math.ceil(totalW)} ${Math.ceil(totalH)}">`,
        `<defs>${defsContent.join('')}</defs>`,
        `<rect width="${Math.ceil(totalW)}" height="${Math.ceil(totalH)}" fill="white"/>`,
        `<g id="links">${linkLines.join('')}</g>`,
        `<g id="nodes">${nodeElems.join('')}</g>`,
        legendSVG,
        `</svg>`,
      ].join('\n');
    }, [
      graph, nodeClusters, selectedExpressionColumn, expressionData, log2Transform, expressionValueRange,
      isFilterTouched, showSharedGenes, sharedGenes, searchResults,
      selectedNodesFromPolygon, linksWithInteractions, legendItems,
    ]);

    const exportAsSVG = useCallback(() => {
      const svgString = _buildSVG();
      if (!svgString) return;
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `network-graph-${graphIndex}.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, [_buildSVG, graphIndex]);

    const exportAsPNG = useCallback(() => {
      const svgString = _buildSVG();
      if (!svgString) return;
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const SCALE = 3;
        const wMatch = svgString.match(/width="(\d+)"/);
        const hMatch = svgString.match(/height="(\d+)"/);
        const w = wMatch ? parseInt(wMatch[1], 10) : 800;
        const h = hMatch ? parseInt(hMatch[1], 10) : 600;
        const canvas = document.createElement('canvas');
        canvas.width = w * SCALE;
        canvas.height = h * SCALE;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(SCALE, SCALE);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const link = document.createElement('a');
        link.download = `network-graph-${graphIndex}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    }, [_buildSVG, graphIndex]);

    // Expose necessary properties and methods to the ref received from the parent (Program.tsx)
    useImperativeHandle(ref, () => ({
      // Expose the canvas element. For 2D, it's canvasRef.current.
      // For 3D, it's accessed via the instance's canvas() method.
      get canvasElement() {
          if (is3D) {
              // For 3D, canvas element is obtained via a method call
              return fgRef.current?.canvas() || null;
          } else {
              // For 2D, canvas element is available via canvasRef.current on the instance
              return fgRef.current?.canvasRef?.current || null; 
          }
      },
      // Expose methods called by Program.tsx from the underlying library instance
      centerAt: (x?: number, y?: number, transitionMs?: number) => fgRef.current?.centerAt(x, y, transitionMs),
      d3Force: (forceName: string) => fgRef.current?.d3Force(forceName),
      d3ReheatSimulation: () => fgRef.current?.d3ReheatSimulation(),
      cameraPosition: (position: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, transitionMs?: number) => fgRef.current?.cameraPosition(position, lookAt, transitionMs),
      getGraphBbox: () => fgRef.current?.getGraphBbox(),
      zoomToFit: (ms?: number, px?: number, nodeFilterFn?: (node: any) => boolean) => fgRef.current?.zoomToFit(ms, px, nodeFilterFn),
      // Add other methods from the library instance that Program.tsx might need to call
      // ... (add any other methods called on fgRef.current in Program.tsx) ...
      exportAsSVG,
      exportAsPNG,
      selectGenes: (genes: string[]) => setSelectedNodesFromPolygon(genes),
    }));

    // adjust forces and initial centering on data change
    useEffect(() => {
      if (!graph?.nodes?.length) return
      onSimulationChange?.(true)
      setTimeout(() => {
        try {
          if (is3D && fgRef.current) {
            // For 3D, set flag to zoom to fit after engine stops
            setShouldZoomToFit(true);
          } else if (!is3D && fgRef.current) {
            const charge = fgRef.current.d3Force('charge')
            if (charge?.strength) charge.strength(-200)
            const link = fgRef.current.d3Force('link')
            if (link?.distance) link.distance(80)
            const collision = fgRef.current.d3Force('collision')
            if (collision) {
              collision.radius((node: { val?: number }) => {
                const degree = node.val || 1
                const minRadius = 8
                const maxRadius = 20
                return Math.min(maxRadius, Math.max(minRadius, minRadius + degree * 2)) * 1.5
              })
            }
            fgRef.current.d3ReheatSimulation()
          }
        } catch (e) {
          console.warn('Force simulation update failed:', e)
        }
      }, 0)
    }, [graph, is3D, onSimulationChange])

    // Handle 3D mode switch specifically
    useEffect(() => {
      if (is3D && fgRef.current && graph.nodes.length > 0) {
        // When switching to 3D mode, wait a bit for the graph to render, then zoom to fit
        setTimeout(() => {
          if (fgRef.current) {
            fgRef.current.zoomToFit(1000, 50);
          }
        }, 200);
      }
    }, [is3D, graph.nodes.length]);

    // Cluster legend items
    const clusterLegendItems = nodeClusters ? getClusterLegendItems(nodeClusters) : null;

    return (
      <div className="relative w-full h-full" style={{ background: colors.bgBase }}>

        {/* Clear Selection + Annotate buttons — top-center, above legend z-index */}
        {selectedNodesFromPolygon.length > 0 && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            zIndex: 200, display: 'flex', gap: 6,
          }}>
            <button
              onClick={() => setShowBulkAnnotationModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 7,
                background: colors.accentFaint,
                color: colors.accent,
                border: `1px solid ${colors.accent}`,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              Annotate {selectedNodesFromPolygon.length} Gene{selectedNodesFromPolygon.length > 1 ? 's' : ''}
            </button>
            <button
              onClick={() => { setSelectedNodesFromPolygon([]); setIsPolygonSelectionActive(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 7,
                background: colors.bgPanel,
                color: colors.textMuted,
                border: `1px solid ${colors.border}`,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              Clear Selection ({selectedNodesFromPolygon.length})
            </button>
          </div>
        )}

        {/* Shift Key Indicator */}
        {/* {isShiftPressed && (
          <div className="absolute top-16 right-4 z-40">
            <div className="px-3 py-1 bg-yellow-500 text-white rounded-md text-sm font-medium">
              Shift Pressed
            </div>
          </div>
        )} */}
        {is3D ? (
          <>
          <ForceGraph3D
            ref={fgRef}
            graphData={graph}
            backgroundColor={colors.bgBase}
            onNodeClick={handleNodeClick}
            nodeOpacity={1}
            nodeColor={(node: any) => getNodeColor(node)}
            linkColor={(link: any) => getLinkStyle(link).color}
            linkWidth={(link: any) => getLinkStyle(link).width}
            onNodeHover={onHover3D}
            onLinkClick={handleLinkClick}
            onBackgroundClick={handleBackgroundClick}
            nodeThreeObject={(node: any) => {
              const group = new THREE.Group()
              const nodeColor = getNodeColor(node);

              const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(8, 32, 32),
                new THREE.MeshStandardMaterial({
                    color: node === hoverNode ? '#ff7043' : nodeColor,
                  emissive: node === hoverNode ? '#ff7043' : '#000000',
                  metalness: 0.3,
                  roughness: 0.4
                })
              )
              const sprite = new SpriteText(node.id)
              sprite.material.depthWrite = false
              sprite.color = node === hoverNode ? '#ff7043' : colors.textPrimary
              sprite.textHeight = 5
              sprite.position.set(0, 15, 0)
              group.add(sphere)
              group.add(sprite)
              return group
            }}
            onEngineStop={handleEngineStop}
          />
          {showLegend && (
            <>
              {selectedExpressionColumn && expressionValueRange ? (
                <GradientLegend 
                  min={expressionValueRange.min} 
                  max={expressionValueRange.max}
                  title={selectedExpressionColumn}
                />
              ) : clusterLegendItems && clusterLegendItems.length > 0 ? (
                <StaticLegend items={clusterLegendItems} />
              ) : (
                <StaticLegend items={legendItems} />
              )}
            </>
          )}
          </>
        ) : (
          <>
          <ForceGraph2D
            ref={fgRef}
            graphData={graph}
            backgroundColor={colors.bgBase}
            onNodeClick={handleNodeClick}
            onNodeHover={onHover2D}
            onLinkClick={handleLinkClick}
            onBackgroundClick={handleBackgroundClick}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={(node, color, ctx) => {
              const radius = 14
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false)
              ctx.fill()
            }}
            nodeRelSize={6}
            linkDirectionalParticles={0}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.2}
            autoPauseRedraw={false}
            linkColor={(link: any) => getLinkStyle(link).color}
            linkWidth={(link: any) => getLinkStyle(link).width}
            onEngineStop={handleEngineStop}
            onZoom={onDrag}
          />
          {showLegend && (
            <>
              {selectedExpressionColumn && expressionValueRange ? (
                <GradientLegend 
                  min={expressionValueRange.min} 
                  max={expressionValueRange.max}
                  title={selectedExpressionColumn}
                />
              ) : clusterLegendItems && clusterLegendItems.length > 0 ? (
                <StaticLegend items={clusterLegendItems} />
              ) : (
                <StaticLegend items={legendItems} />
              )}
            </>
          )}
          </>
        )}

        {selectedGene && (
          <DraggableGeneInfo
            gene={selectedGene.gene}
            data={selectedGene.data}
            onClose={() => setSelectedGene(null)}
          />
        )}

        {showInteractionInfo && (
          <DraggableInteractionInfo
            onClose={() => {
              setShowInteractionInfo(false);
              setInteractionData(null);
            }}
            interactionData={interactionData}
          />
        )}

        {/* Polygon Selector */}
        <PolygonSelector
          isActive={isPolygonSelectionActive}
          onSelectionChange={setSelectedNodesFromPolygon}
          graphRef={fgRef}
          nodes={graph.nodes}
          onClose={() => setIsPolygonSelectionActive(false)}
          onAnnotate={() => {
            if (selectedNodesFromPolygon.length > 0) {
              setShowBulkAnnotationModal(true);
            }
          }}
        />

        {/* Unified Annotation Modal */}
        <UnifiedGeneAnnotationModal
          isOpen={showBulkAnnotationModal}
          onClose={() => setShowBulkAnnotationModal(false)}
          selectedGenes={selectedNodesFromPolygon}
          graphIndex={graphIndex}
        />
      </div>
    )
  }
)

export default ForceGraph

// remove createTextTexture, SpriteText covers labeling in 3D
