import React, { useState } from 'react';

interface GeneAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  geneName: string;
}

interface AnnotationResult {
  gene: string;
  view: string;
  disease?: string;
  retrieved_passages: string[];
  summary: string;
  prompt?: string;
}

const GeneAnnotationModal: React.FC<GeneAnnotationModalProps> = ({ 
  isOpen, 
  onClose, 
  geneName 
}) => {
  const [selectedView, setSelectedView] = useState<'function' | 'disease' | 'pathway'>('function');
  const [diseaseQuery, setDiseaseQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnnotationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const views = [
    { value: 'function', label: 'Function', description: 'Gene function and biological role' },
    { value: 'disease', label: 'Disease', description: 'Disease associations and clinical relevance' },
    { value: 'pathway', label: 'Pathway', description: 'Biological pathways and interactions' }
  ];

  const handleAnnotate = async () => {
    if (!geneName) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let url = `http://localhost:8000/annotate?gene=${encodeURIComponent(geneName)}&view=${selectedView}&k=5`;
      
      if (selectedView === 'disease' && diseaseQuery.trim()) {
        url += `&disease=${encodeURIComponent(diseaseQuery.trim())}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch annotation');
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (view: 'function' | 'disease' | 'pathway') => {
    setSelectedView(view);
    setResult(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gene Annotation</h2>
            <p className="text-gray-600 mt-1">Gene: <span className="font-semibold">{geneName}</span></p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* View Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Select Annotation View</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {views.map((view) => (
                <button
                  key={view.value}
                  onClick={() => handleViewChange(view.value as any)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    selectedView === view.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{view.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{view.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Disease Query Input */}
          {selectedView === 'disease' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Disease Query (required for disease view)
              </label>
              <input
                type="text"
                value={diseaseQuery}
                onChange={(e) => setDiseaseQuery(e.target.value)}
                placeholder="e.g., ovarian cancer, breast cancer"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Annotate Button */}
          <div className="mb-6">
            <button
              onClick={handleAnnotate}
              disabled={loading || (selectedView === 'disease' && !diseaseQuery.trim())}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Get Annotation'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="text-red-800 font-medium">Error</div>
              <div className="text-red-600 mt-1">{error}</div>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="space-y-6">
              {/* Summary */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Summary</h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-gray-800 whitespace-pre-wrap">{result.summary}</p>
                </div>
              </div>

              {/* Retrieved Passages */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Retrieved Passages ({result.retrieved_passages.length})</h3>
                <div className="space-y-3">
                  {result.retrieved_passages.map((passage, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-md">
                      <div className="text-sm text-gray-500 mb-2">Passage {index + 1}</div>
                      <p className="text-gray-800">{passage}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Debug Info (optional) */}
              {result.prompt && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
                    Show Prompt (Debug)
                  </summary>
                  <div className="mt-2 p-4 bg-gray-100 rounded-md">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">{result.prompt}</pre>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneAnnotationModal; 