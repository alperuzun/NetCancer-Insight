import React, { useState } from 'react'
import { llmTest } from '../services/api'
import LLMSettingsModal from './LLMSettingsModal'

type ConnStatus = 'unknown' | 'connected' | 'not_configured' | 'error';

const STATUS_DOT: Record<ConnStatus, string> = {
  unknown:        'bg-gray-400',
  connected:      'bg-green-400',
  not_configured: 'bg-yellow-400',
  error:          'bg-red-400',
};
const STATUS_LABEL: Record<ConnStatus, string> = {
  unknown:        'Not tested',
  connected:      'Connected',
  not_configured: 'Not configured',
  error:          'Error',
};

const LLMTestButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connStatus, setConnStatus] = useState<ConnStatus>('unknown')
  const [showSettings, setShowSettings] = useState(false)

  const handleTest = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await llmTest()
      const data = response.data
      if (data?.success) {
        setConnStatus('connected')
        setResult(data.response ?? JSON.stringify(data))
      } else {
        setConnStatus('not_configured')
        setError(data?.error || 'LLM not configured.')
      }
    } catch (err: any) {
      const data = err.response?.data
      if (data?.not_configured) {
        setConnStatus('not_configured')
        setError('LLM not configured — open Settings to add your API key.')
      } else {
        setConnStatus('error')
        setError(data?.error || err.message || 'Request failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-slate-100 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm uppercase tracking-[0.2em] text-slate-400">LLM connectivity test</span>
            <span className="flex items-center gap-1.5 ml-auto">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[connStatus]}`} />
              <span className="text-xs text-slate-400">{STATUS_LABEL[connStatus]}</span>
            </span>
          </div>

          <div className="text-base text-slate-200">
            {connStatus === 'not_configured'
              ? 'No LLM is configured yet. Enter your API key in Settings to enable AI features.'
              : 'Click the button to invoke the backend LLM endpoint and confirm the model is reachable.'}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleTest}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Testing…' : 'Run LLM Test'}
            </button>
            {connStatus === 'not_configured' && (
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-3 font-semibold text-white transition hover:bg-white/20"
              >
                Configure LLM
              </button>
            )}
          </div>

          {result && (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-100">
              <div className="font-semibold text-slate-200">Response</div>
              <div className="mt-2 whitespace-pre-wrap">{result}</div>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-500/60 bg-red-950/40 p-4 text-sm text-red-200">
              <div className="font-semibold">{connStatus === 'not_configured' ? 'Not configured' : 'Error'}</div>
              <div className="mt-2 whitespace-pre-wrap">{error}</div>
              {connStatus === 'not_configured' && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-3 inline-flex items-center rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/50 transition"
                >
                  Open Settings →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <LLMSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}

export default LLMTestButton
