import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
}

interface PolygonSelectorProps {
  isActive: boolean;
  onSelectionChange: (selectedIds: string[]) => void;
  graphRef: React.RefObject<any>;
  nodes: any[];
  onClose: () => void;
  onAnnotate?: () => void; // New prop for annotation callback
}

const PolygonSelector: React.FC<PolygonSelectorProps> = ({
  isActive,
  onSelectionChange,
  graphRef,
  nodes,
  onClose,
  onAnnotate
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear polygon when deactivating
  useEffect(() => {
    if (!isActive) {
      setPolygonPoints([]);
      setSelectedNodes([]);
      setIsDrawing(false);
    }
  }, [isActive]);

  // Handle mouse events for drawing polygon
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isActive || !graphRef.current) return;

    // Only respond to shift+click
    if (!e.shiftKey) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!isDrawing) {
      // Start drawing
      setIsDrawing(true);
      setPolygonPoints([{ x, y }]);
    } else {
      // Add point to polygon
      setPolygonPoints(prev => [...prev, { x, y }]);
    }
  }, [isActive, isDrawing, graphRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isActive || !isDrawing || !canvasRef.current) return;

    // Only update preview when shift is held
    if (!e.shiftKey) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update the preview point (last point follows mouse)
    setPolygonPoints(prev => {
      if (prev.length === 0) return prev;
      const newPoints = [...prev.slice(0, -1), { x, y }];
      return newPoints;
    });
  }, [isActive, isDrawing]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && isActive && isDrawing && polygonPoints.length >= 3) {
      // Complete the polygon
      setIsDrawing(false);
      
      // Remove the last point if it's too close to the first point
      const points = [...polygonPoints];
      if (points.length > 3) {
        const first = points[0];
        const last = points[points.length - 1];
        const distance = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
        if (distance < 10) {
          points.pop();
        }
      }

      setPolygonPoints(points);
      
      // Find nodes within the polygon
      const selectedIds = findNodesInPolygon(points);
      setSelectedNodes(selectedIds);
      onSelectionChange(selectedIds);

      if (onAnnotate) {
        onAnnotate();
      }
    } else if (e.key === 'Escape' && isActive) {
      onClose();
    }
  }, [isActive, isDrawing, polygonPoints, onSelectionChange, onClose, onAnnotate]);

  // Point-in-polygon algorithm
  const isPointInPolygon = useCallback((point: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  // Find nodes within the polygon
  const findNodesInPolygon = useCallback((polygon: Point[]): string[] => {
    if (!graphRef.current || polygon.length < 3) return [];

    const selectedIds: string[] = [];
    
    nodes.forEach(node => {
      // Get node position in screen coordinates
      const canvasPos = graphRef.current.graph2ScreenCoords(node.x, node.y);
      if (!canvasPos) return;

      if (isPointInPolygon(canvasPos, polygon)) {
        selectedIds.push(node.id);
      }
    });

    return selectedIds;
  }, [nodes, graphRef, isPointInPolygon]);

  // Draw polygon on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (polygonPoints.length > 0) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Draw polygon
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
      }

      // Close polygon if we have enough points
      if (polygonPoints.length >= 3 && !isDrawing) {
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.stroke();

      // Draw points
      ctx.fillStyle = '#3b82f6';
      polygonPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [polygonPoints, isActive, isDrawing]);

  // Handle keyboard events for Enter to complete and Escape to cancel
  useEffect(() => {
    if (isActive) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isActive, handleKeyDown]);

  if (!isActive) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-50"
      style={{ pointerEvents: isActive ? 'auto' : 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        width={containerRef.current?.clientWidth || 800}
        height={containerRef.current?.clientHeight || 600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        style={{ cursor: 'crosshair' }}
      />
      
      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 p-3 rounded-lg shadow-lg">
        <div className="text-sm font-medium text-gray-700 mb-2">
          Polygon Selection Mode
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div>• Shift+Click to add points</div>
          <div>• Press Enter to complete</div>
          <div>• Press ESC to cancel</div>
          {selectedNodes.length > 0 && (
            <div className="text-blue-600 font-medium mt-2">
              Selected: {selectedNodes.length} nodes
            </div>
          )}
        </div>
      </div>

      {/* Selection info */}
      {selectedNodes.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 p-3 rounded-lg shadow-lg max-w-md">
          <div className="text-sm font-medium text-gray-700 mb-2">
            Selected Nodes ({selectedNodes.length})
          </div>
          <div className="text-xs text-gray-600 max-h-32 overflow-y-auto">
            {selectedNodes.slice(0, 10).join(', ')}
            {selectedNodes.length > 10 && ` ... and ${selectedNodes.length - 10} more`}
          </div>
        </div>
      )}
    </div>
  );
};

export default PolygonSelector; 