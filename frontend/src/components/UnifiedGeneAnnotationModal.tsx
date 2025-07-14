import React, { useState, useEffect } from 'react';
import GeneChatModal from './GeneChatModal';
import { getAllGeneAnnotations, postMultiAnnotate, sendMultiGeneChatMessage } from '../services/api';

const annotationTypes = ['function', 'disease', 'pathway'] as const;
type AnnotationType = typeof annotationTypes[number];

interface UnifiedGeneAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGenes: string[];
}

interface AnnotationResult {
  gene: string;
  view: string;
  disease?: string;
  retrieved_passages: string[];
  summary: string;
  prompt?: string;
}

interface AnnotationResultItem {
  gene: string;
  annotations: {
    function: AnnotationResult | { error: string } | null;
    disease: AnnotationResult | { error: string } | null;
    pathway: AnnotationResult | { error: string } | null;
  };
  loading: boolean;
  error?: string;
}

const UnifiedGeneAnnotationModal: React.FC<UnifiedGeneAnnotationModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedGenes 
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnnotationResultItem[]>([]);
  const [showSingleChat, setShowSingleChat] = useState(false);
  const [showMultiChat, setShowMultiChat] = useState(false);
  const [singleChatGene, setSingleChatGene] = useState<string>('');
  
  // Cache for storing annotation results
  const [annotationCache, setAnnotationCache] = useState<Map<string, AnnotationResult>>(new Map());
  // Selection annotations state
  const [selectionAnnotations, setSelectionAnnotations] = useState<SelectionAnnotations | null>(null);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);

  // Fetch all three annotation types for each gene
  useEffect(() => {
    if (isOpen && selectedGenes.length > 0) {
      const initialResults = selectedGenes.map(gene => ({
        gene,
        annotations: {
          function: null,
          disease: null,
          pathway: null
        },
        loading: true
      }));
      setResults(initialResults);
      fetchAllAnnotations(selectedGenes);
      // Fetch selection annotations if multiple genes
      if (selectedGenes.length > 1) {
        setAnnotationsLoading(true);
        postMultiAnnotate(selectedGenes)
          .then(response => {
            const data = response.data;
            setSelectionAnnotations(data && data.pathways && data.disease ? data : null);
          })
          .catch(() => setSelectionAnnotations(null))
          .finally(() => setAnnotationsLoading(false));
      } else {
        setSelectionAnnotations(null);
      }
    }
    // eslint-disable-next-line
  }, [isOpen, selectedGenes]);

  const fetchAllAnnotations = async (genes: string[]) => {
    setLoading(true);
    const initialResults = genes.map(gene => ({
      gene,
      annotations: { function: null, disease: null, pathway: null },
      loading: true,
      error: undefined
    }));
    setResults(initialResults);

    await Promise.all(genes.map(async (gene, idx) => {
      try {
        const response = await getAllGeneAnnotations(gene);
        const data = response.data;
        setResults(prev => {
          const updated = [...prev];
          updated[idx] = {
            gene,
            annotations: {
              function: data.function || null,
              disease: data.disease || null,
              pathway: data.pathway || null
            },
            loading: false,
            error: undefined
          };
          return updated;
        });
      } catch (error) {
        setResults(prev => {
          const updated = [...prev];
          updated[idx] = {
            gene,
            annotations: { function: null, disease: null, pathway: null },
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch annotation'
          };
          return updated;
        });
      }
    }));
    setLoading(false);
  };

  const openSingleChat = (gene: string) => {
    setSingleChatGene(gene);
    setShowSingleChat(true);
  };

  const openMultiChat = () => {
    setShowMultiChat(true);
  };

  const getCompletedCount = () => {
    return results.filter(r => r.annotations[selectedGenes.length === 1 ? 'function' : 'function'] && !r.loading && !r.error).length;
  };

  const getErrorCount = () => {
    return results.filter(r => r.error).length;
  };

  const isSingleGene = selectedGenes.length === 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-1000 flex justify-center items-center p-4" style={{backgroundColor: 'rgba(0, 0, 0, 0.5)'}}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isSingleGene ? 'Gene Annotation' : 'Gene Annotations'}
            </h2>
            <p className="text-gray-600 mt-1">
              {isSingleGene ? (
                <>Gene: <span className="font-semibold">{selectedGenes[0]}</span></>
              ) : (
                <>Selected: <span className="font-semibold">{selectedGenes.length}</span> genes</>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {selectedGenes.length > 1 && (
              <button
                onClick={openMultiChat}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
              >
                💬 Multi-Gene Chat
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Controls and Gene List */}
          {selectedGenes.length > 1 && (
            <div className="w-1/3 border-r border-gray-200 p-6 overflow-y-auto">
              {/* View Selection */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Annotation View</h3>
                <div className="space-y-2">
                  {/* Removed view selector */}
                </div>
              </div>

              {/* Annotate Button */}
              <div className="mb-6">
                {/* Removed annotate button */}
              </div>

              {/* Progress */}
              {loading && (
                <div className="mb-6 p-4 bg-blue-50 rounded-md">
                  <div className="text-sm font-medium text-blue-800 mb-2">
                    Progress: {getCompletedCount()}/{selectedGenes.length}
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(getCompletedCount() / selectedGenes.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Gene List - Only show for multiple genes */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Selected Genes</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {results.map((result, index) => (
                    <div
                      key={result.gene}
                      className={`p-3 rounded-lg border ${
                        result.loading
                          ? 'border-yellow-300 bg-yellow-50'
                          : result.error
                          ? 'border-red-300 bg-red-50'
                          : result.annotations[selectedGenes.length === 1 ? 'function' : 'function']
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-900">{result.gene}</span>
                        <div className="flex items-center space-x-2">
                          {result.loading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          )}
                          {result.error && (
                            <span className="text-red-600 text-xs">Error</span>
                          )}
                          {result.annotations[selectedGenes.length === 1 ? 'function' : 'function'] && (
                            <span className="text-green-600 text-xs">✓</span>
                          )}
                          <button
                            onClick={() => openSingleChat(result.gene)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Chat
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Right Panel - Results */}
          <div className={`flex-1 p-6 overflow-y-auto ${selectedGenes.length === 1 ? 'w-full' : ''}`}>
            {/* Selection Annotations Section (for multi-gene) */}
            {selectedGenes.length > 1 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-2">Selection Annotations</h3>
                {annotationsLoading ? (
                  <div className="text-gray-500">Loading selection annotations...</div>
                ) : selectionAnnotations ? (
                  <>
                    <div className="mb-3">
                      <div className="font-medium text-gray-700 mb-1">Major Pathways:</div>
                      <ul className="list-disc ml-6">
                        {selectionAnnotations.pathways.map((p, i) => (
                          <li key={i} className="mb-1">
                            <span className="font-semibold">{p.name}</span>: {p.description} <span className="ml-2 text-xs text-purple-700">(Confidence: {p.confidence.toFixed(2)})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium text-gray-700 mb-1">Most Important Disease:</div>
                      <div>
                        <span className="font-semibold">{selectionAnnotations.disease.name}</span>: {selectionAnnotations.disease.description} <span className="ml-2 text-xs text-red-700">(Confidence: {selectionAnnotations.disease.confidence.toFixed(2)})</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500">No selection annotations available.</div>
                )}
                {/* Divider */}
                <div className="my-6 border-t border-gray-300" />
              </div>
            )}
            <h3 className="text-lg font-semibold mb-4">
              Gene Annotations
            </h3>
            
            {/* {getCompletedCount() === 0 && !loading && (
              <div className="text-center text-gray-500 py-8">
                Click "Annotate {isSingleGene ? 'Gene' : `All ${selectedGenes.length} Genes`}" to start processing.
              </div>
            )} */}

            <div className="space-y-6">
              {results.map((result) => {
                if (result.loading) {
                  return (
                    <div key={result.gene} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 text-gray-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span>Loading annotation for {result.gene}...</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={result.gene} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-lg font-semibold text-gray-900">{result.gene}</h4>
                      {selectedGenes.length === 1 ? (
                        <button
                          onClick={() => openSingleChat(result.gene)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          💬 Chat
                        </button>
                      ) : null}
                    </div>
                    {annotationTypes.map((type) => {
                      const typedType = type as AnnotationType;
                      const annotation = (result.annotations as Record<AnnotationType, AnnotationResult | { error: string } | null>)[typedType];
                      return (
                        <div key={type} className="mb-4">
                          <h5 className="font-medium text-gray-700 mb-2 capitalize">{type} Annotation</h5>
                          <div className="bg-gray-50 p-3 rounded-md">
                            {annotation && 'summary' in annotation ? (
                              <p className="text-gray-800 whitespace-pre-wrap">{(annotation as AnnotationResult).summary}</p>
                            ) : annotation && 'error' in annotation ? (
                              <span className="text-red-600">Error: {(annotation as { error: string }).error}</span>
                            ) : (
                              <span className="text-gray-400">No data</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {selectedGenes.length > 1 && (
                      <button
                        onClick={() => openSingleChat(result.gene)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm mt-2"
                      >
                        💬 Chat for {result.gene}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* {selectedGenes.length > 1 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4">Multi-Gene Chat</h3>
                <button
                  onClick={openMultiChat}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
                >
                  💬 Chat about all selected genes
                </button>
              </div>
            )} */}
          </div>
        </div>

        {/* Single Gene Chat Modal */}
        <GeneChatModal
          isOpen={showSingleChat}
          onClose={() => setShowSingleChat(false)}
          geneName={singleChatGene}
        />

        {/* Multi-Gene Chat Modal */}
        <MultiGeneChatModal
          isOpen={showMultiChat}
          onClose={() => setShowMultiChat(false)}
          selectedGenes={selectedGenes}
        />
      </div>
    </div>
  );
};

// Multi-Gene Chat Modal Component
interface MultiGeneChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGenes: string[];
}

// Add type for selection annotations
interface SelectionAnnotations {
  pathways: Array<{ name: string; description: string; confidence: number }>;
  disease: { name: string; description: string; confidence: number };
}

const MultiGeneChatModal: React.FC<MultiGeneChatModalProps> = ({
  isOpen,
  onClose,
  selectedGenes
}) => {
  const [messages, setMessages] = useState<Array<{id: string; role: 'user' | 'assistant'; content: string; timestamp: Date}>>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectionAnnotations, setSelectionAnnotations] = useState<SelectionAnnotations | null>(null);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation and fetch selection annotations when genes change
  React.useEffect(() => {
    if (isOpen && selectedGenes.length > 0) {
      const initialMessage = {
        id: Date.now().toString(),
        role: 'assistant' as const,
        content: `Hello! I'm your AI assistant specialized in genomics. I can help you understand the relationship between these ${selectedGenes.length} genes: ${selectedGenes.join(', ')}. What would you like to know about these genes?`,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
      // Fetch selection annotations
      setAnnotationsLoading(true);
      postMultiAnnotate(selectedGenes)
        .then(response => {
          const data = response.data;
          setSelectionAnnotations(data && data.pathways && data.disease ? data : null);
        })
        .catch(() => setSelectionAnnotations(null))
        .finally(() => setAnnotationsLoading(false));
    }
  }, [isOpen, selectedGenes]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      // Build conversation context
      const conversationHistory = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
      
      const response = await sendMultiGeneChatMessage(selectedGenes, inputMessage, conversationHistory);

      if (response.status !== 200) {
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant' as const,
          content: 'Failed to send message.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        setLoading(false);
        return;
      }

      const data = response.data;
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-1000 flex justify-center items-center p-4" style={{backgroundColor: 'rgba(0, 0, 0, 0.5)'}}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Multi-Gene Chat</h2>
            <p className="text-gray-600 mt-1">Chatting about: <span className="font-semibold">{selectedGenes.join(', ')}</span></p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearConversation}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
            >
              Clear Chat
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Selection Annotations Section */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold mb-2">Selection Annotations</h3>
          {annotationsLoading ? (
            <div className="text-gray-500">Loading selection annotations...</div>
          ) : selectionAnnotations ? (
            <>
              <div className="mb-3">
                <div className="font-medium text-gray-700 mb-1">Major Pathways:</div>
                <ul className="list-disc ml-6">
                  {selectionAnnotations.pathways.map((p, i) => (
                    <li key={i} className="mb-1">
                      <span className="font-semibold">{p.name}</span>: {p.description} <span className="ml-2 text-xs text-purple-700">(Confidence: {p.confidence.toFixed(2)})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium text-gray-700 mb-1">Most Important Disease:</div>
                <div>
                  <span className="font-semibold">{selectionAnnotations.disease.name}</span>: {selectionAnnotations.disease.description} <span className="ml-2 text-xs text-red-700">(Confidence: {selectionAnnotations.disease.confidence.toFixed(2)})</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500">No selection annotations available.</div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-2">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex space-x-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about these genes..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={handleSendMessage}
              disabled={loading || !inputMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};

export default UnifiedGeneAnnotationModal; 