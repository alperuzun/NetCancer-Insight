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
import { getGeneDetails, searchGenes, getInteraction } from '../services/api'
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

// Color scale for expression data (blue -> white -> red)
const getExpressionColor = (value: number, min: number, max: number) => {
  if (min === max) return '#ffffff'; // neutral if no variation

  const mid = (min + max) / 2;
  let t = (value - min) / (max - min); // normalize to 0-1

  // Blue for low, white for mid, red for high
  const blue = { r: 0, g: 0, b: 255 };
  const white = { r: 255, g: 255, b: 255 };
  const red = { r: 255, g: 0, b: 0 };

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
    },
    ref: React.Ref<any>
  ) => {
    const [selectedGene, setSelectedGene] = useState<any | null>(null)
    const [hoverNode, setHoverNode] = useState<any>(null)
    const [_isDragging, _setIsDragging] = useState(false)
    const [_lastMousePos, _setLastMousePos] = useState({ x: 0, y: 0 })
    const [showLegend, _setShowLegend] = useState(true)
    const [searchResults, setSearchResults] = useState<string[]>([])
    const [legendItems, setLegendItems] = useState<{ color: string; label: string }[]>([]);
    const [showInteractionInfo, setShowInteractionInfo] = useState(false);
    const [interactionData, setInteractionData] = useState<any>(null);
    const [_linksWithInteractions, setLinksWithInteractions] = useState<Set<string>>(new Set());
    const [expressionValueRange, setExpressionValueRange] = useState<{min: number, max: number} | null>(null);
    const [shouldZoomToFit, setShouldZoomToFit] = useState(false);
    const [isPolygonSelectionActive, setIsPolygonSelectionActive] = useState(false);
    const [selectedNodesFromPolygon, setSelectedNodesFromPolygon] = useState<string[]>([]);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [nodeUnderMouse, setNodeUnderMouse] = useState<any>(null);
    const [showBulkAnnotationModal, setShowBulkAnnotationModal] = useState(false);

    // No longer using activeLegendColorsRef or clearing effect
    // const activeLegendColorsRef = useRef<{ [color: string]: string }>({});

    // Log when search query changes
    useEffect(() => {
      console.log('ForceGraph: Search query changed:', searchQuery);
    }, [searchQuery]);

    // Handle shift key events
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // console.log("Key pressed:", e.key, "Shift state:", e.shiftKey);
        if (e.key === 'Shift') {
          console.log("Shift key pressed");
          setIsShiftPressed(true);
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        // console.log("Key released:", e.key);
        if (e.key === 'Shift') {
          console.log("Shift key released");
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
      console.log('ForceGraph useEffect - Dependencies changed:', {
        searchQuery,
        minDegree,
        maxDegree,
        showSharedGenes,
        sharedGenesLength: sharedGenes.length,
        graphIndex,
        graphNodesLength: graph.nodes.length
      });
      const updateSearch = async () => {
        const res = await searchGenes(searchQuery.trim().toLowerCase(), minDegree, maxDegree, graphIndex);
        let results = res.data.gene;
        
        // If showSharedGenes is true, filter to only show shared genes
        // if (showSharedGenes) {
        //   results = results.filter((gene: string) => sharedGenes.includes(gene));
        // }
        
        setSearchResults(results);
        console.log('ForceGraph useEffect - searchResults updated:', results.length);
      };
      updateSearch();
    }, [searchQuery, minDegree, maxDegree, showSharedGenes, sharedGenes, graphIndex, graph.nodes.length]);

    const handleNodeClick = useCallback(async (node: any, event?: any) => {
      console.log("Node clicked, shift state:", isShiftPressed, "event shiftKey:", event?.shiftKey);
      
      // Check if shift is pressed (use both state and event property)
      if (isShiftPressed || (event && event.shiftKey)) {
        console.log("Activating polygon selection mode");
        setIsPolygonSelectionActive(true);
        return;
      }

      // Show unified annotation modal for single gene
      setSelectedNodesFromPolygon([node.id]);
      setShowBulkAnnotationModal(true);
    }, [isShiftPressed])

    // Handle background click for polygon selection
    const handleBackgroundClick = useCallback((event?: any) => {
      console.log("Background clicked, nodeUnderMouse:", nodeUnderMouse, "shift state:", isShiftPressed, "event shiftKey:", event?.shiftKey);
      
      // If no node is under mouse and shift is pressed, activate polygon selection
      if (!nodeUnderMouse && (isShiftPressed || (event && event.shiftKey))) {
        console.log("Shift+click on background, activating polygon selection");
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

        // After setLinksWithInteractions(newLinksWithInteractions);
        graph.links.forEach(link => {
          const linkKey = getLinkKey(link.source, link.target);
          link.hasInteraction = newLinksWithInteractions.has(linkKey);
        });
      };

      if (graph.links.length > 0) {
        checkAllInteractions();
      }
    }, [graph.links]);

    const handleLinkClick = useCallback(async (link: any) => {
      console.log("Link clicked:", link);
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
      return {
        color: link.hasInteraction ? 'black' : 'gray',
        width: link.hasInteraction ? 2 : 0.7
      };
    }, []);

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
            const values = Object.keys(expressionData)
                .map(geneId => expressionData[geneId][selectedExpressionColumn])
                .filter(value => typeof value === 'number') as number[];

            if (values.length > 0) {
                setExpressionValueRange({
                    min: Math.min(...values),
                    max: Math.max(...values)
                });
            }
        } else {
            setExpressionValueRange(null);
        }
    }, [expressionData, selectedExpressionColumn]);

    // Updated getNodeColor to use cyan for hovered node
    const getNodeColor = useCallback((node: any) => {
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
                const value = expressionData[geneId][selectedExpressionColumn];
                return getExpressionColor(value, expressionValueRange.min, expressionValueRange.max);
            }
            return '#FFFFFF'; // White for nodes without this expression data
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
    }, [isFilterTouched, showSharedGenes, searchResults, sharedGenes, expressionData, selectedExpressionColumn, expressionValueRange, selectedNodesFromPolygon, hoverNode]);

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
        ctx.fillStyle = 'black';
        ctx.fillText(label, node.x!, node.y!);
      },
      [hoverNode, getNodeColor] // Dependencies for nodeCanvasObject
    );

    // Reverted handleEngineStop to its simpler form
    const handleEngineStop = useCallback(() => {
        console.log("Engine stopped - calling onDrag");
        onDrag?.();
        
        // If we're in 3D mode and should zoom to fit, do it now
        if (is3D && shouldZoomToFit && fgRef.current) {
            console.log("Calling zoomToFit after engine stopped");
            fgRef.current.zoomToFit(1000, 50);
            setShouldZoomToFit(false);
        }
    }, [onDrag, is3D, shouldZoomToFit]);

    // unify ref for both modes - This ref points to the library instance (ForceGraph2D or ForceGraph3D)
    const fgRef = useRef<any>(null);

    // Add export functionality
    const exportAsSVG = useCallback(() => {
      if (!fgRef.current) return;

      // Get the current graph dimensions
      const bbox = fgRef.current.getGraphBbox();
      if (!bbox || !Array.isArray(bbox.x) || !Array.isArray(bbox.y) || 
          bbox.x.length !== 2 || bbox.y.length !== 2) {
        console.error('Invalid graph bounding box format:', bbox);
        return;
      }

      const [x1, x2] = bbox.x;
      const [y1, y2] = bbox.y;

      if (!isFinite(x1) || !isFinite(x2) || !isFinite(y1) || !isFinite(y2)) {
        console.error('Invalid coordinates in bounding box:', { x1, x2, y1, y2 });
        return;
      }

      const padding = 150;
      const width = Math.abs(x2 - x1) + padding * 2;
      const height = Math.abs(y2 - y1) + padding * 2;

      // Create SVG element
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', width.toString());
      svg.setAttribute('height', height.toString());
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      // Get the current graph state and ensure valid coordinates
      const nodes = graph.nodes.map(node => {
        if (!isFinite(node.x) || !isFinite(node.y)) {
          console.warn(`Invalid coordinates for node ${node.id}:`, node);
          return {
            ...node,
            x: width / 2,
            y: height / 2
          };
        }
        return {
          ...node,
          x: node.x - x1 + padding,
          y: node.y - y1 + padding
        };
      });

      // Add links
      const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      graph.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const source = nodes.find(n => n.id === sourceId);
        const target = nodes.find(n => n.id === targetId);
        
        if (source && target && isFinite(source.x) && isFinite(source.y) && isFinite(target.x) && isFinite(target.y)) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', source.x.toString());
          line.setAttribute('y1', source.y.toString());
          line.setAttribute('x2', target.x.toString());
          line.setAttribute('y2', target.y.toString());
          line.setAttribute('stroke', getLinkStyle(link).color);
          line.setAttribute('stroke-width', getLinkStyle(link).width.toString());
          linkGroup.appendChild(line);
        }
      });
      svg.appendChild(linkGroup);

      // Add nodes
      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodes.forEach(node => {
        if (!isFinite(node.x) || !isFinite(node.y)) {
          console.warn(`Skipping node ${node.id} due to invalid coordinates`);
          return;
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const degree = node.val || 1;
        const minRadius = 8;
        const maxRadius = 20;
        const radius = Math.min(maxRadius, Math.max(minRadius, minRadius + degree * 2));

        circle.setAttribute('cx', node.x.toString());
        circle.setAttribute('cy', node.y.toString());
        circle.setAttribute('r', radius.toString());
        circle.setAttribute('fill', getNodeColor(node));
        circle.setAttribute('stroke', '#00000088');
        nodeGroup.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x.toString());
        text.setAttribute('y', (node.y).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '12');
        text.textContent = node.id;
        nodeGroup.appendChild(text);
      });
      svg.appendChild(nodeGroup);

      // Add legend
      if (selectedExpressionColumn && expressionValueRange) {
        // Render Gradient Legend for expression data
        const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const legendX = width - 200;
        const legendY = 20;

        // Create a gradient definition
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const linearGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        linearGradient.setAttribute('id', 'expressionGradient');
        linearGradient.setAttribute('x1', '0%');
        linearGradient.setAttribute('y1', '0%');
        linearGradient.setAttribute('x2', '100%');
        linearGradient.setAttribute('y2', '0%');

        const stops = [
          { offset: '0%', color: 'rgb(0,0,255)' },
          { offset: '50%', color: 'rgb(255,255,255)' },
          { offset: '100%', color: 'rgb(255,0,0)' },
        ];

        stops.forEach(stopInfo => {
          const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          stop.setAttribute('offset', stopInfo.offset);
          stop.setAttribute('stop-color', stopInfo.color);
          linearGradient.appendChild(stop);
        });
        defs.appendChild(linearGradient);
        svg.appendChild(defs);

        // Legend title
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', legendX.toString());
        title.setAttribute('y', legendY.toString());
        title.setAttribute('font-size', '14');
        title.setAttribute('font-weight', 'bold');
        title.textContent = selectedExpressionColumn;
        legendGroup.appendChild(title);

        // Gradient bar
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', legendX.toString());
        rect.setAttribute('y', (legendY + 10).toString());
        rect.setAttribute('width', '180');
        rect.setAttribute('height', '20');
        rect.setAttribute('fill', 'url(#expressionGradient)');
        legendGroup.appendChild(rect);

        // Labels
        const labels = [
            { text: expressionValueRange.min.toFixed(2), x: legendX },
            { text: ((expressionValueRange.min + expressionValueRange.max) / 2).toFixed(2), x: legendX + 90 },
            { text: expressionValueRange.max.toFixed(2), x: legendX + 180 }
        ];

        labels.forEach(labelInfo => {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', labelInfo.x.toString());
            label.setAttribute('y', (legendY + 45).toString());
            label.setAttribute('font-size', '12');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = labelInfo.text;
            legendGroup.appendChild(label);
        });
        svg.appendChild(legendGroup);

      } else if (legendItems && legendItems.length > 0) {
        // Render Static Legend
        const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const legendPadding = 20;
        const boxSize = 18;
        const spacing = 8;
        const fontSize = 16;
        const legendX = width - 200; // 200px from right
        const legendY = legendPadding;

        // Legend title
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', legendX.toString());
        title.setAttribute('y', (legendY + fontSize).toString());
        title.setAttribute('font-size', (fontSize + 2).toString());
        title.setAttribute('font-weight', 'bold');
        title.textContent = 'Legend';
        legendGroup.appendChild(title);

        legendItems.forEach((item, i) => {
          // Color box
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', legendX.toString());
          rect.setAttribute('y', (legendY + (i + 1) * (boxSize + spacing)).toString());
          rect.setAttribute('width', boxSize.toString());
          rect.setAttribute('height', boxSize.toString());
          rect.setAttribute('fill', item.color);
          rect.setAttribute('stroke', '#333');
          legendGroup.appendChild(rect);

          // Label
          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', (legendX + boxSize + 10).toString());
          label.setAttribute('y', (legendY + (i + 1) * (boxSize + spacing) + boxSize * 0.75).toString());
          label.setAttribute('font-size', fontSize.toString());
          label.textContent = item.label;
          legendGroup.appendChild(label);
        });
        svg.appendChild(legendGroup);
      }

      // Serialize and download
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `graph-${graphIndex}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [graph.nodes, graph.links, graphIndex, getNodeColor, getLinkStyle, legendItems, selectedExpressionColumn, expressionValueRange]);

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
    }));

    // adjust forces and initial centering on data change
    useEffect(() => {
      if (!graph?.nodes?.length) return
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
    }, [graph, is3D])

    // Handle 3D mode switch specifically
    useEffect(() => {
      if (is3D && fgRef.current && graph.nodes.length > 0) {
        // When switching to 3D mode, wait a bit for the graph to render, then zoom to fit
        setTimeout(() => {
          if (fgRef.current) {
            console.log("Calling zoomToFit after switching to 3D mode");
            fgRef.current.zoomToFit(1000, 50);
          }
        }, 200);
      }
    }, [is3D, graph.nodes.length]);

    return (
      <div className="relative w-full h-full" style={{background: "white"}}>
        {/* Polygon Selection Controls */}
        {/* <div className="absolute top-4 right-4 z-40">
          <button
            onClick={() => setIsPolygonSelectionActive(!isPolygonSelectionActive)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isPolygonSelectionActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isPolygonSelectionActive ? 'Cancel Selection' : 'Polygon Select (Shift+Click)'}
          </button>
        </div> */}

        {/* Clear Selection Button */}
        {selectedNodesFromPolygon.length > 0 && (
          <div className="absolute top-5 right-50 z-40">
            <button
              onClick={() => setSelectedNodesFromPolygon([])}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
            >
              Clear Selection ({selectedNodesFromPolygon.length})
            </button>
          </div>
        )}

        {/* Annotation Button */}
        {selectedNodesFromPolygon.length > 0 && (
          <div className="absolute top-5 right-100 z-40">
            <button
              onClick={() => setShowBulkAnnotationModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
            >
              📊 Annotate {selectedNodesFromPolygon.length} Gene{selectedNodesFromPolygon.length > 1 ? 's' : ''}
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
            backgroundColor="white"
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
              sprite.color = node === hoverNode ? 'red' : 'black'
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
              ) : (
                <StaticLegend
                  items={legendItems}
                />
              )}
            </>
          )}
          </>
        ) : (
          <>
          <ForceGraph2D
            ref={fgRef}
            graphData={graph}
            backgroundColor="white"
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
              ) : (
                <StaticLegend
                  items={legendItems}
                />
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
        />
      </div>
    )
  }
)

export default ForceGraph

// remove createTextTexture, SpriteText covers labeling in 3D
