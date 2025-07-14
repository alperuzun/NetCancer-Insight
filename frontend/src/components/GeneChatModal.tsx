import React, { useState, useRef, useEffect } from 'react';
import { sendGeneChatMessage } from '../services/api';

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

const GeneChatModal: React.FC<GeneChatModalProps> = ({ 
  isOpen, 
  onClose, 
  geneName 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [_conversationContext, setConversationContext] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation when gene changes
  useEffect(() => {
    if (isOpen && geneName) {
      const initialMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Hello! I'm your AI assistant specialized in genomics. I can help you understand ${geneName} and answer questions about its function, pathways, and more. What would you like to know about ${geneName}?`,
        timestamp: new Date(),
        isTyping: true,
        displayContent: ''
      };
      setMessages([initialMessage]);
      setConversationContext(`Gene: ${geneName}`);
      
      // Start typing animation for initial message
      startTypingAnimation(initialMessage.id, initialMessage.content);
    }
  }, [isOpen, geneName]);

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  const startTypingAnimation = (messageId: string, fullContent: string) => {
    let currentIndex = 0;
    
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }
    
    typingIntervalRef.current = setInterval(() => {
      currentIndex++;
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, displayContent: fullContent.slice(0, currentIndex) }
          : msg
      ));
      
      if (currentIndex >= fullContent.length) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
        
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, isTyping: false, displayContent: fullContent }
            : msg
        ));
      }
    }, 10); // Adjust speed as needed
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
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
      
    //   const fullContext = `${conversationContext}\n\nConversation History:\n${conversationHistory}\n\nUser: ${inputMessage}`;

      const response = await sendGeneChatMessage(geneName, inputMessage, conversationHistory);
      const data = response.data;
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        isTyping: true,
        displayContent: ''
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Start typing animation for the response
      startTypingAnimation(assistantMessage.id, data.response);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date(),
        isTyping: true,
        displayContent: ''
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Start typing animation for error message
      startTypingAnimation(errorMessage.id, 'Sorry, I encountered an error while processing your request. Please try again.');
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
    setConversationContext(`Gene: ${geneName}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-1000 flex justify-center items-center p-4" style={{backgroundColor: 'rgba(0, 0, 0, 0.5)'}}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gene Chat</h2>
            <p className="text-gray-600 mt-1">Chatting about: <span className="font-semibold">{geneName}</span></p>
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
                <div className="whitespace-pre-wrap">
                  {message.isTyping ? message.displayContent || '' : message.content}
                  {message.isTyping && <span className="animate-pulse">|</span>}
                </div>
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
              placeholder="Ask me anything about this gene..."
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

export default GeneChatModal; 