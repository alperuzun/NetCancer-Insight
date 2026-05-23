import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { getLLMSettings, saveLLMSettings, llmTest } from '../services/api';
import { useTheme } from '../context/ThemeContext';

interface LLMSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = 'openai' | 'anthropic' | 'groq' | 'ollama';

const PROVIDER_DEFAULTS: Record<Provider, { model: string; needsKey: boolean; keyPlaceholder: string }> = {
  openai:    { model: 'gpt-4o-mini',              needsKey: true,  keyPlaceholder: 'sk-…' },
  anthropic: { model: 'claude-3-5-haiku-20241022', needsKey: true,  keyPlaceholder: 'sk-ant-…' },
  groq:      { model: 'llama-3.1-8b-instant',      needsKey: true,  keyPlaceholder: 'gsk_…' },
  ollama:    { model: 'llama3',                     needsKey: false, keyPlaceholder: '' },
};

type Status = 'idle' | 'saving' | 'testing' | 'connected' | 'error' | 'not_configured';

const LLMSettingsModal: React.FC<LLMSettingsModalProps> = ({ isOpen, onClose }) => {
  const { colors } = useTheme();
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatus('idle');
    setStatusMessage('');
    getLLMSettings()
      .then(res => {
        const d = res.data;
        const p = (d.provider || 'openai') as Provider;
        setProvider(p);
        setModel(d.model || PROVIDER_DEFAULTS[p].model);
        setBaseUrl(d.base_url || '');
        setHasExistingKey(!!d.has_api_key);
        setApiKey('');
      })
      .catch(() => {});
  }, [isOpen]);

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setModel(PROVIDER_DEFAULTS[p].model);
    setApiKey('');
    setBaseUrl(p === 'ollama' ? 'http://localhost:11434' : '');
    setStatus('idle');
    setStatusMessage('');
    setHasExistingKey(false);
  };

  const handleSave = async () => {
    setStatus('saving');
    setStatusMessage('');
    try {
      await saveLLMSettings({ provider, api_key: apiKey, model, base_url: baseUrl });
      if (apiKey.length > 0) setHasExistingKey(true);
      setApiKey('');
      setStatus('idle');
      setStatusMessage('Settings saved.');
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(err.response?.data?.detail || err.message || 'Save failed.');
    }
  };

  const handleTest = async () => {
    setStatus('testing');
    setStatusMessage('');
    try {
      const res = await llmTest();
      if (res.data?.success) {
        setStatus('connected');
        setStatusMessage(res.data.response || 'LLM connected.');
      } else {
        setStatus('not_configured');
        setStatusMessage(res.data?.error || 'LLM not configured.');
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.not_configured) {
        setStatus('not_configured');
        setStatusMessage('LLM not configured — save your settings first.');
      } else {
        setStatus('error');
        setStatusMessage(data?.error || err.message || 'Connection failed.');
      }
    }
  };

  if (!isOpen) return null;

  const def = PROVIDER_DEFAULTS[provider];
  const busy = status === 'saving' || status === 'testing';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 11px',
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 7,
    color: colors.textPrimary,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const statusConfig: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    connected:      { bg: 'rgba(52,211,153,0.08)', color: colors.success, icon: <CheckCircle size={14} /> },
    not_configured: { bg: 'rgba(251,191,36,0.08)', color: colors.warning, icon: <AlertTriangle size={14} /> },
    error:          { bg: 'rgba(248,113,113,0.08)', color: colors.danger,  icon: <AlertCircle size={14} /> },
    idle:           { bg: colors.accentFaint,        color: colors.accent,  icon: null },
  };
  const sc = statusConfig[status] || statusConfig.idle;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, backgroundColor: 'rgba(0,0,0,0.65)',
      }}
    >
      <div
        style={{
          background: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          width: '100%',
          maxWidth: 420,
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
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>LLM Settings</h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', color: colors.textMuted,
              border: `1px solid ${colors.border}`, cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Provider */}
          <div>
            <label style={labelStyle}>Provider</label>
            <select
              value={provider}
              onChange={e => handleProviderChange(e.target.value as Provider)}
              style={inputStyle}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="groq">Groq</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>

          {/* API Key */}
          {def.needsKey && (
            <div>
              <label style={labelStyle}>
                API Key
                {hasExistingKey && (
                  <span style={{ marginLeft: 6, color: colors.success, fontSize: 10, fontWeight: 500, textTransform: 'none' }}>
                    (set — leave blank to keep)
                  </span>
                )}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={hasExistingKey ? '••••••••••••' : def.keyPlaceholder}
                style={inputStyle}
              />
            </div>
          )}

          {/* Model */}
          <div>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Base URL */}
          {(provider === 'ollama' || baseUrl) && (
            <div>
              <label style={labelStyle}>
                Base URL
                <span style={{ marginLeft: 4, color: colors.textFaint, fontSize: 10, fontWeight: 400, textTransform: 'none' }}>
                  (Ollama / custom endpoint)
                </span>
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                style={inputStyle}
              />
            </div>
          )}

          {/* Status banner */}
          {statusMessage && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 8,
                background: sc.bg, color: sc.color,
                border: `1px solid ${sc.color}22`,
                fontSize: 12,
              }}
            >
              {sc.icon}
              {statusMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: `1px solid ${colors.border}`,
            background: colors.bgPanelSecondary,
          }}
        >
          <button
            onClick={handleTest}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 7,
              background: 'transparent', color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              fontSize: 12, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {status === 'testing' && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {status === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 14px', borderRadius: 7,
                background: 'transparent', color: colors.textMuted,
                border: `1px solid ${colors.border}`,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 7,
                background: busy ? colors.bgPanelSecondary : colors.accent,
                color: busy ? colors.textFaint : '#fff',
                border: `1px solid ${busy ? colors.border : colors.accent}`,
                fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {status === 'saving' && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default LLMSettingsModal;
