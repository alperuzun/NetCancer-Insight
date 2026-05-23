import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, MessageSquare, Loader2, Send, Trash2, CheckCircle, AlertCircle, Download } from 'lucide-react';
import GeneChatModal from './GeneChatModal';
import { getAllGeneAnnotations, postMultiAnnotate, sendMultiGeneChatMessage } from '../services/api';
import LLMSettingsModal from './LLMSettingsModal';
import { useTheme } from '../context/ThemeContext';

const annotationTypes = ['function', 'disease', 'pathway'] as const;
type AnnotationType = typeof annotationTypes[number];

interface UnifiedGeneAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGenes: string[];
  graphIndex?: number;
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

interface SelectionAnnotations {
  pathways: Array<{ name: string; description: string; confidence: number }>;
  disease: { name: string; description: string; confidence: number };
}

const UnifiedGeneAnnotationModal: React.FC<UnifiedGeneAnnotationModalProps> = ({
  isOpen,
  onClose,
  selectedGenes,
  graphIndex = -1,
}) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnnotationResultItem[]>([]);
  const [showSingleChat, setShowSingleChat] = useState(false);
  const [showMultiChat, setShowMultiChat] = useState(false);
  const [singleChatGene, setSingleChatGene] = useState<string>('');
  const [llmNotConfigured, setLlmNotConfigured] = useState(false);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  const [selectionAnnotations, setSelectionAnnotations] = useState<SelectionAnnotations | null>(null);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && selectedGenes.length > 0) {
      const initialResults = selectedGenes.map(gene => ({
        gene,
        annotations: { function: null, disease: null, pathway: null },
        loading: true,
      }));
      setResults(initialResults);
      fetchAllAnnotations(selectedGenes);
      if (selectedGenes.length > 1) {
        setAnnotationsLoading(true);
        postMultiAnnotate(selectedGenes)
          .then(response => {
            const data = response.data;
            setSelectionAnnotations(data?.pathways && data?.disease ? data : null);
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
    setResults(genes.map(gene => ({
      gene,
      annotations: { function: null, disease: null, pathway: null },
      loading: true,
      error: undefined,
    })));

    await Promise.all(genes.map(async (gene, idx) => {
      try {
        const response = await getAllGeneAnnotations(gene, 5, graphIndex);
        const data = response.data;
        setResults(prev => {
          const updated = [...prev];
          updated[idx] = {
            gene,
            annotations: {
              function: data.function || null,
              disease: data.disease || null,
              pathway: data.pathway || null,
            },
            loading: false,
          };
          return updated;
        });
      } catch (error: any) {
        if (error?.response?.status === 503) setLlmNotConfigured(true);
        setResults(prev => {
          const updated = [...prev];
          updated[idx] = {
            gene,
            annotations: { function: null, disease: null, pathway: null },
            loading: false,
            error: error?.response?.status === 503
              ? 'LLM not configured — open Settings to enable AI annotations.'
              : (error instanceof Error ? error.message : 'Failed to fetch annotation'),
          };
          return updated;
        });
      }
    }));
    setLoading(false);
  };

  const getCompletedCount = () =>
    results.filter(r => r.annotations[selectedGenes.length === 1 ? 'function' : 'pathway'] && !r.loading && !r.error).length;

  const handleExportCSV = () => {
    const getSummary = (ann: AnnotationResult | { error: string } | null): string => {
      if (!ann) return '';
      if ('error' in ann) return `Error: ${ann.error}`;
      return (ann as AnnotationResult).summary.replace(/"/g, '""');
    };
    const header = ['Gene', 'Function', 'Disease', 'Pathway'];
    const rows = results.map(r => [
      r.gene,
      getSummary(r.annotations.function),
      getSummary(r.annotations.disease),
      getSummary(r.annotations.pathway),
    ].map(v => `"${v}"`).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${selectedGenes.join('-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isSingleGene = selectedGenes.length === 1;

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            background: colors.bgPanel,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            width: '100%',
            maxWidth: 1100,
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: `1px solid ${colors.border}`,
              background: colors.bgPanelSecondary,
              flexShrink: 0,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                {isSingleGene ? 'Gene Annotation' : 'Gene Annotations'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>
                {isSingleGene
                  ? <>Gene: <span style={{ color: colors.accent, fontWeight: 600 }}>{selectedGenes[0]}</span></>
                  : <><span style={{ color: colors.accent, fontWeight: 600 }}>{selectedGenes.length}</span> genes selected</>}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!loading && results.some(r => !r.loading && !r.error) && (
                <button
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 7,
                    background: 'transparent',
                    color: colors.textMuted,
                    border: `1px solid ${colors.border}`,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Download size={13} />
                  Export CSV
                </button>
              )}
              {selectedGenes.length > 1 && (
                <button
                  onClick={() => setShowMultiChat(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 7,
                    background: colors.accentFaint,
                    color: colors.accent,
                    border: `1px solid ${colors.accent}`,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <MessageSquare size={13} />
                  Multi-Gene Chat
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 7,
                  background: 'transparent', color: colors.textMuted,
                  border: `1px solid ${colors.border}`, cursor: 'pointer',
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* LLM not-configured banner */}
          {llmNotConfigured && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '8px 20px',
                background: 'rgba(251,191,36,0.08)',
                borderBottom: `1px solid rgba(251,191,36,0.25)`,
                fontSize: 12, color: colors.warning, flexShrink: 0,
              }}
            >
              <span>⚠ LLM not configured — annotations require an API key.</span>
              <button
                onClick={() => setShowLLMSettings(true)}
                style={{
                  whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(251,191,36,0.15)', color: colors.warning,
                  border: `1px solid rgba(251,191,36,0.3)`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Configure LLM
              </button>
            </div>
          )}

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {/* Left sidebar (multi-gene only) */}
            {selectedGenes.length > 1 && (
              <div
                style={{
                  width: 240,
                  borderRight: `1px solid ${colors.border}`,
                  padding: '16px 14px',
                  overflowY: 'auto',
                  flexShrink: 0,
                }}
              >
                {/* Progress */}
                {loading && (
                  <div
                    style={{
                      marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                      background: colors.accentFaint,
                      border: `1px solid ${colors.accent}44`,
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: colors.accent }}>
                      Progress: {getCompletedCount()}/{selectedGenes.length}
                    </p>
                    <div style={{ background: colors.border, borderRadius: 4, height: 4 }}>
                      <div
                        style={{
                          background: colors.accent,
                          height: 4,
                          borderRadius: 4,
                          width: `${(getCompletedCount() / selectedGenes.length) * 100}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Gene list */}
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Selected Genes
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {results.map(result => {
                    const done = !result.loading && !result.error && result.annotations.pathway;
                    const hasErr = !result.loading && !!result.error;
                    return (
                      <div
                        key={result.gene}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 7,
                          border: `1px solid ${hasErr ? colors.danger + '44' : done ? colors.success + '44' : colors.border}`,
                          background: hasErr ? 'rgba(248,113,113,0.06)' : done ? 'rgba(52,211,153,0.06)' : colors.bgPanelSecondary,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>{result.gene}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {result.loading && <Loader2 size={12} style={{ color: colors.accent, animation: 'spin 1s linear infinite' }} />}
                            {done && <CheckCircle size={12} style={{ color: colors.success }} />}
                            {hasErr && <AlertCircle size={12} style={{ color: colors.danger }} />}
                            <button
                              onClick={() => { setSingleChatGene(result.gene); setShowSingleChat(true); }}
                              style={{ fontSize: 11, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Chat
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Right content */}
            <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
              {/* Selection Annotations (multi-gene) */}
              {selectedGenes.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Selection Annotations
                  </p>
                  {annotationsLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted, fontSize: 12 }}>
                      <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      Loading…
                    </div>
                  ) : selectionAnnotations ? (
                    <div
                      style={{
                        padding: '12px 14px', borderRadius: 9,
                        background: colors.bgPanelSecondary,
                        border: `1px solid ${colors.border}`,
                        fontSize: 12, color: colors.textPrimary,
                        display: 'flex', flexDirection: 'column', gap: 10,
                      }}
                    >
                      <div>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Major Pathways
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {selectionAnnotations.pathways.map((p, i) => (
                            <li key={i}>
                              <span style={{ fontWeight: 600 }}>{p.name}</span>: {p.description}
                              <span style={{ marginLeft: 6, fontSize: 10, color: colors.accent }}>(conf: {p.confidence.toFixed(2)})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Most Important Disease
                        </p>
                        <span style={{ fontWeight: 600 }}>{selectionAnnotations.disease.name}</span>: {selectionAnnotations.disease.description}
                        <span style={{ marginLeft: 6, fontSize: 10, color: colors.danger }}>(conf: {selectionAnnotations.disease.confidence.toFixed(2)})</span>
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: colors.textFaint, fontSize: 12 }}>No selection annotations available.</p>
                  )}
                  <div style={{ borderTop: `1px solid ${colors.border}`, margin: '16px 0' }} />
                </div>
              )}

              <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Gene Annotations
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {results.map(result => {
                  if (result.loading) {
                    return (
                      <div
                        key={result.gene}
                        style={{
                          padding: '12px 14px', borderRadius: 9,
                          border: `1px solid ${colors.border}`,
                          background: colors.bgPanelSecondary,
                          display: 'flex', alignItems: 'center', gap: 8,
                          color: colors.textMuted, fontSize: 13,
                        }}
                      >
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: colors.accent }} />
                        Loading annotation for {result.gene}…
                      </div>
                    );
                  }
                  return (
                    <div
                      key={result.gene}
                      style={{
                        padding: '14px 16px', borderRadius: 10,
                        border: `1px solid ${colors.border}`,
                        background: colors.bgPanelSecondary,
                      }}
                    >
                      {/* Gene header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.accent }}>{result.gene}</h4>
                        <button
                          onClick={() => { setSingleChatGene(result.gene); setShowSingleChat(true); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 6,
                            background: colors.accentFaint, color: colors.accent,
                            border: `1px solid ${colors.accent}`,
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <MessageSquare size={12} />
                          Chat
                        </button>
                      </div>

                      {result.error ? (
                        <p style={{ margin: 0, fontSize: 12, color: colors.danger }}>{result.error}</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {annotationTypes.map(type => {
                            const annotation = (result.annotations as Record<AnnotationType, AnnotationResult | { error: string } | null>)[type];
                            return (
                              <div key={type}>
                                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  {type}
                                </p>
                                <div
                                  style={{
                                    padding: '8px 10px', borderRadius: 7,
                                    background: colors.bgInput,
                                    border: `1px solid ${colors.border}`,
                                    fontSize: 12, color: colors.textPrimary,
                                    lineHeight: 1.55,
                                  }}
                                >
                                  {annotation && 'summary' in annotation ? (
                                    <ReactMarkdown
                                      components={{
                                        p: ({ children }) => <p style={{ margin: '0 0 4px' }}>{children}</p>,
                                        strong: ({ children }) => <strong style={{ color: colors.textPrimary }}>{children}</strong>,
                                        ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ul>,
                                        li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                                      }}
                                    >
                                      {(annotation as AnnotationResult).summary}
                                    </ReactMarkdown>
                                  ) : annotation && 'error' in annotation ? (
                                    <span style={{ color: colors.danger }}>Error: {(annotation as { error: string }).error}</span>
                                  ) : (
                                    <span style={{ color: colors.textFaint }}>No data</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <GeneChatModal isOpen={showSingleChat} onClose={() => setShowSingleChat(false)} geneName={singleChatGene} />
      <MultiGeneChatModal isOpen={showMultiChat} onClose={() => setShowMultiChat(false)} selectedGenes={selectedGenes} />
      <LLMSettingsModal isOpen={showLLMSettings} onClose={() => setShowLLMSettings(false)} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};

// ── Multi-Gene Chat ──────────────────────────────────────────────────────────

interface MultiGeneChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGenes: string[];
}

const MultiGeneChatModal: React.FC<MultiGeneChatModalProps> = ({ isOpen, onClose, selectedGenes }) => {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectionAnnotations, setSelectionAnnotations] = useState<SelectionAnnotations | null>(null);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  React.useEffect(() => {
    if (isOpen && selectedGenes.length > 0) {
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hello! I can help you understand the relationship between these ${selectedGenes.length} genes: **${selectedGenes.join(', ')}**. What would you like to know?`,
        timestamp: new Date(),
      }]);
      setAnnotationsLoading(true);
      postMultiAnnotate(selectedGenes)
        .then(response => {
          const data = response.data;
          setSelectionAnnotations(data?.pathways && data?.disease ? data : null);
        })
        .catch(() => setSelectionAnnotations(null))
        .finally(() => setAnnotationsLoading(false));
    }
  }, [isOpen, selectedGenes]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;
    const userMessage = { id: Date.now().toString(), role: 'user' as const, content: inputMessage, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    try {
      const conversationHistory = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const response = await sendMultiGeneChatMessage(selectedGenes, inputMessage, conversationHistory);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, backgroundColor: 'rgba(0,0,0,0.65)',
      }}
    >
      <div
        style={{
          background: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          width: '100%',
          maxWidth: 760,
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgPanelSecondary }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Multi-Gene Chat</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.textMuted }}>{selectedGenes.join(', ')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMessages([])}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, fontSize: 12, cursor: 'pointer' }}
            >
              <Trash2 size={13} /> Clear
            </button>
            <button
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Selection Annotations strip */}
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgPanelSecondary, fontSize: 12, color: colors.textPrimary, flexShrink: 0 }}>
          {annotationsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.textMuted }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading annotations…
            </div>
          ) : selectionAnnotations ? (
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathways: </span>
                {selectionAnnotations.pathways.slice(0, 2).map((p, i) => (
                  <span key={i} style={{ marginRight: 8 }}>{p.name} <span style={{ color: colors.accent, fontSize: 10 }}>({p.confidence.toFixed(2)})</span></span>
                ))}
              </div>
              <div>
                <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disease: </span>
                {selectionAnnotations.disease.name} <span style={{ color: colors.danger, fontSize: 10 }}>({selectionAnnotations.disease.confidence.toFixed(2)})</span>
              </div>
            </div>
          ) : (
            <span style={{ color: colors.textFaint }}>No selection annotations available.</span>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(message => (
            <div key={message.id} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '80%',
                  padding: '9px 13px',
                  borderRadius: message.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: message.role === 'user' ? colors.accent : colors.bgPanelSecondary,
                  color: message.role === 'user' ? '#fff' : colors.textPrimary,
                  fontSize: 13, lineHeight: 1.55,
                  border: message.role === 'user' ? 'none' : `1px solid ${colors.border}`,
                }}
              >
                {message.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ margin: '0 0 4px' }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: colors.textPrimary }}>{children}</strong>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
                )}
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.5 }}>{message.timestamp.toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: '14px 14px 14px 4px', background: colors.bgPanelSecondary, border: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 13 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${colors.border}`, background: colors.bgPanelSecondary }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about these genes…"
              rows={1}
              disabled={loading}
              style={{ flex: 1, padding: '8px 12px', background: colors.bgInput, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 13, outline: 'none', resize: 'none' }}
            />
            <button
              onClick={handleSendMessage}
              disabled={loading || !inputMessage.trim()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                background: loading || !inputMessage.trim() ? colors.bgPanelSecondary : colors.accent,
                color: loading || !inputMessage.trim() ? colors.textFaint : '#fff',
                border: `1px solid ${loading || !inputMessage.trim() ? colors.border : colors.accent}`,
                cursor: loading || !inputMessage.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={15} />
            </button>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 10, color: colors.textFaint }}>Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
};

export default UnifiedGeneAnnotationModal;
