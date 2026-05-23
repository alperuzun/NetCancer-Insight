import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Trash2, Send, Loader2 } from 'lucide-react';
import { streamChatMessage } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import LLMSettingsModal from './LLMSettingsModal';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  displayContent?: string;
}

interface GeneChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  geneName: string;
}

const GeneChatModal: React.FC<GeneChatModalProps> = ({ isOpen, onClose, geneName }) => {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmNotConfigured, setLlmNotConfigured] = useState(false);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && geneName) {
      const initialMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hello! I'm your AI assistant specialized in genomics. I can help you understand **${geneName}** and answer questions about its function, pathways, and more. What would you like to know?`,
        timestamp: new Date(),
        isTyping: true,
        displayContent: '',
      };
      setMessages([initialMessage]);
      startTypingAnimation(initialMessage.id, initialMessage.content);
    }
  }, [isOpen, geneName]);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

  const startTypingAnimation = (messageId: string, fullContent: string) => {
    let currentIndex = 0;
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      currentIndex++;
      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, displayContent: fullContent.slice(0, currentIndex) } : msg
        )
      );
      if (currentIndex >= fullContent.length) {
        clearInterval(typingIntervalRef.current!);
        typingIntervalRef.current = null;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId ? { ...msg, isTyping: false, displayContent: fullContent } : msg
          )
        );
      }
    }, 10);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    const userInput = inputMessage;
    setInputMessage('');
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    let assistantAdded = false;
    let accumulated = '';

    try {
      const conversationHistory = messages.map(msg => ({ role: msg.role, content: msg.content }));
      const response = await streamChatMessage(geneName, userInput, conversationHistory);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 503) setLlmNotConfigured(true);
        throw new Error(errData.detail || 'Chat error');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break outer;

          let parsed: any;
          try { parsed = JSON.parse(payload); } catch { continue; }

          if (parsed.error) {
            if (parsed.not_configured) setLlmNotConfigured(true);
            throw new Error(parsed.error);
          }

          if (parsed.chunk) {
            accumulated += parsed.chunk;
            const snap = accumulated;
            if (!assistantAdded) {
              assistantAdded = true;
              setLoading(false);
              setMessages(prev => [...prev, {
                id: assistantId,
                role: 'assistant' as const,
                content: snap,
                timestamp: new Date(),
                isTyping: true,
                displayContent: snap,
              }]);
            } else {
              setMessages(prev => prev.map(msg =>
                msg.id === assistantId ? { ...msg, content: snap, displayContent: snap } : msg
              ));
            }
          }
        }
      }

      setMessages(prev => prev.map(msg =>
        msg.id === assistantId ? { ...msg, isTyping: false } : msg
      ));
    } catch (error: any) {
      const errText = llmNotConfigured
        ? 'LLM not configured. Please open Settings to add your API key.'
        : 'Sorry, I encountered an error. Please try again.';
      if (!assistantAdded) {
        setMessages(prev => [...prev, {
          id: assistantId,
          role: 'assistant' as const,
          content: errText,
          timestamp: new Date(),
          isTyping: false,
          displayContent: errText,
        }]);
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId ? { ...msg, content: errText, displayContent: errText, isTyping: false } : msg
        ));
      }
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

  if (!isOpen) return null;

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
            maxWidth: 760,
            height: '88vh',
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
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Gene Chat</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>
                Chatting about: <span style={{ color: colors.accent, fontWeight: 600 }}>{geneName}</span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setMessages([])}
                title="Clear conversation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 7,
                  background: 'transparent', color: colors.textMuted,
                  border: `1px solid ${colors.border}`, fontSize: 12, cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                Clear
              </button>
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
                fontSize: 12, color: colors.warning,
              }}
            >
              <span>⚠ LLM not configured — AI features require an API key.</span>
              <button
                onClick={() => setShowLLMSettings(true)}
                style={{
                  whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(251,191,36,0.15)',
                  color: colors.warning,
                  border: `1px solid rgba(251,191,36,0.3)`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Configure LLM
              </button>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map(message => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '9px 13px',
                    borderRadius: message.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: message.role === 'user' ? colors.accent : colors.bgPanelSecondary,
                    color: message.role === 'user' ? '#fff' : colors.textPrimary,
                    fontSize: 13,
                    lineHeight: 1.55,
                    border: message.role === 'user' ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  {message.role === 'assistant' ? (
                    <div
                      style={{
                        // Basic markdown prose styling
                      }}
                    >
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.55 }}>{children}</p>,
                          code: ({ children }) => (
                            <code style={{
                              fontFamily: 'monospace', fontSize: 12,
                              background: colors.bgInput,
                              border: `1px solid ${colors.border}`,
                              borderRadius: 4, padding: '1px 4px',
                              color: colors.accent,
                            }}>{children}</code>
                          ),
                          strong: ({ children }) => <strong style={{ color: colors.textPrimary, fontWeight: 600 }}>{children}</strong>,
                          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
                          li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                        }}
                      >
                        {message.isTyping ? (message.displayContent || '') : message.content}
                      </ReactMarkdown>
                      {message.isTyping && <span style={{ animation: 'pulse 1s infinite', opacity: 0.7 }}>|</span>}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </span>
                  )}
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.55 }}>
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 13px', borderRadius: '14px 14px 14px 4px',
                    background: colors.bgPanelSecondary,
                    border: `1px solid ${colors.border}`,
                    color: colors.textMuted, fontSize: 13,
                  }}
                >
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Thinking…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: `1px solid ${colors.border}`,
              background: colors.bgPanelSecondary,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about this gene…"
                rows={1}
                disabled={loading}
                style={{
                  flex: 1, padding: '8px 12px',
                  background: colors.bgInput,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8, color: colors.textPrimary,
                  fontSize: 13, outline: 'none', resize: 'none',
                  lineHeight: 1.4,
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !inputMessage.trim()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 38, height: 38, borderRadius: 8,
                  background: loading || !inputMessage.trim() ? colors.bgPanelSecondary : colors.accent,
                  color: loading || !inputMessage.trim() ? colors.textFaint : '#fff',
                  border: `1px solid ${loading || !inputMessage.trim() ? colors.border : colors.accent}`,
                  cursor: loading || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                <Send size={15} />
              </button>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 10, color: colors.textFaint }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      <LLMSettingsModal isOpen={showLLMSettings} onClose={() => setShowLLMSettings(false)} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>
  );
};

export default GeneChatModal;
