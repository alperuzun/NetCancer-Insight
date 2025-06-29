import React, { useState, useEffect } from 'react';
import { getGraphletAnalysis, compareGraphlets } from '../services/api';

interface GraphletAnalysisProps {
  graphIndex: number;
  secondGraphIndex?: number;
  onClose: () => void;
}

const GraphletAnalysis: React.FC<GraphletAnalysisProps> = ({ 
  graphIndex, 
  secondGraphIndex,
  onClose 
}) => {
  console.log('GraphletAnalysis: Component mounted with props:', {
    graphIndex,
    secondGraphIndex,
    onClose: !!onClose
  });

  const [size, setSize] = useState<number>(3);
  const [analysis, setAnalysis] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('GraphletAnalysis: Component rendered with state:', {
      size,
      hasAnalysis: !!analysis,
      hasComparison: !!comparison,
      loading,
      error
    });
  }, [size, analysis, comparison, loading, error]);

  useEffect(() => {
    console.log('GraphletAnalysis: Fetching analysis for graph', graphIndex, 'with size', size);
    fetchAnalysis();
  }, [graphIndex, size]);

  useEffect(() => {
    console.log('GraphletAnalysis: Second graph index changed to', secondGraphIndex);
    if (secondGraphIndex !== undefined) {
      fetchComparison();
    } else {
      setComparison(null);
    }
  }, [graphIndex, secondGraphIndex, size]);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log(`Fetching graphlet analysis for graph ${graphIndex} with size ${size}`);
      const response = await getGraphletAnalysis(graphIndex, size);
      console.log('Received graphlet analysis result:', response.data);
      setAnalysis(response.data);
    } catch (err) {
      console.error('Error fetching graphlet analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch graphlet analysis');
    } finally {
      setLoading(false);
    }
  };

  const fetchComparison = async () => {
    if (secondGraphIndex === undefined) return;
    
    console.log('GraphletAnalysis: Starting fetchComparison');
    setLoading(true);
    setError(null);
    try {
      console.log('GraphletAnalysis: Calling compareGraphlets with', { graphIndex, secondGraphIndex, size });
      const response = await compareGraphlets(graphIndex, secondGraphIndex, size);
      console.log('GraphletAnalysis: Received comparison response:', {
        fullResponse: response,
        data: response.data,
        graph1Analysis: response.data?.graph1_analysis,
        graph2Analysis: response.data?.graph2_analysis
      });
      setComparison(response.data);
    } catch (err) {
      console.error('GraphletAnalysis: Error comparing graphlets:', err);
      setError('Failed to compare graphlets. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderGraphletCounts = (data: any) => {
    console.log('renderGraphletCounts called with data:', data);
    if (!data || !data.counts) {
      console.log('No counts data available');
      return null;
    }

    return (
      <div className="mt-4 bg-white p-4 rounded-lg shadow z-[9999]">
        <h3 className="text-lg font-semibold mb-2 text-black">Graphlet Counts</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.counts).map(([key, value]) => (
            <div key={key} className="flex justify-between p-2 bg-gray-50 rounded border border-gray-200">
              <span className="font-medium text-black">{key}:</span>
              <span className="text-black">{value as number}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGraphletFrequencies = (data: any) => {
    console.log('renderGraphletFrequencies called with data:', data);
    if (!data || !data.frequencies) {
      console.log('No frequencies data available');
      return null;
    }

    return (
      <div className="mt-4 bg-white p-4 rounded-lg shadow z-[9999]">
        <h3 className="text-lg font-semibold mb-2 text-black">Graphlet Frequencies</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.frequencies).map(([key, value]) => (
            <div key={key} className="flex justify-between p-2 bg-gray-50 rounded border border-gray-200">
              <span className="font-medium text-black">{key}:</span>
              <span className="text-black">{(value as number).toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderComparison = () => {
    if (!comparison) return null;

    return (
      <div className="mt-6 border-t pt-4">
        <h2 className="text-xl font-bold mb-4 text-black">Graph Comparison</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg shadow">
            <h3 className="font-semibold text-black">Euclidean Distance</h3>
            <p className="text-2xl font-bold text-black">{comparison.euclidean_distance.toFixed(4)}</p>
            <p className="text-sm text-black">Lower is more similar</p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg shadow">
            <h3 className="font-semibold text-black">Manhattan Distance</h3>
            <p className="text-2xl font-bold text-black">{comparison.manhattan_distance.toFixed(4)}</p>
            <p className="text-sm text-black">Lower is more similar</p>
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg shadow">
            <h3 className="font-semibold text-black">Cosine Similarity</h3>
            <p className="text-2xl font-bold text-black">{comparison.cosine_similarity.toFixed(4)}</p>
            <p className="text-sm text-black">Higher is more similar</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-black">Graph {comparison.graph1_index}</h3>
            {renderGraphletCounts(comparison.graph1_analysis)}
            {renderGraphletFrequencies(comparison.graph1_analysis)}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2 text-black">Graph {comparison.graph2_index}</h3>
            {renderGraphletCounts(comparison.graph2_analysis)}
            {renderGraphletFrequencies(comparison.graph2_analysis)}
          </div>
        </div>
      </div>
    );
  };

  console.log('GraphletAnalysis: Rendering modal');
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 8,
          padding: 24,
          maxWidth: '80%',
          maxHeight: '80%',
          overflow: 'auto',
          boxShadow: '0 0 10px rgba(0,0,0,0.2)',
          position: 'relative',
          color: 'black'
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-black">Graphlet Analysis</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-black mb-1">
            Graphlet Size
          </label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-blue-600"
                name="size"
                checked={size === 3}
                onChange={() => setSize(3)}
              />
              <span className="ml-2 text-black">3-node graphlets</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-blue-600"
                name="size"
                checked={size === 4}
                onChange={() => setSize(4)}
              />
              <span className="ml-2 text-black">4-node graphlets</span>
            </label>
          </div>
        </div>
        
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {!loading && !error && analysis && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-2 text-black">Graph {graphIndex}</h3>
            {(() => { console.log('About to render with analysis:', analysis); return null; })()}
            {renderGraphletCounts(analysis)}
            {renderGraphletFrequencies(analysis)}
            
            {secondGraphIndex !== undefined && renderComparison()}
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphletAnalysis; 