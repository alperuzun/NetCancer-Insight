import React, { useRef, useState } from 'react'
import { Upload, FileText } from 'lucide-react'
import { uploadFileDirect } from '../services/api'
import { useTheme } from '../context/ThemeContext'

interface UploadFileProps {
  onUploadSuccess: () => void
  graphIndex?: number
}

const UploadFile: React.FC<UploadFileProps> = ({ onUploadSuccess, graphIndex = 0 }) => {
  const { colors } = useTheme()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) { setError('Please select a file first'); return }
    setUploading(true)
    setError(null)
    try {
      await uploadFileDirect(file, graphIndex)
      onUploadSuccess()
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setError('Upload failed — please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        id={`file-input-${graphIndex}`}
      />

      {/* Styled label acts as the choose-file button */}
      <label
        htmlFor={`file-input-${graphIndex}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
          background: colors.bgPanelSecondary,
          color: file ? colors.accent : colors.textMuted,
          border: `1px solid ${file ? colors.accent : colors.border}`,
          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        <FileText size={13} />
        {file ? file.name : 'Choose file'}
      </label>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 6,
          background: !file || uploading ? colors.bgPanelSecondary : colors.accent,
          color: !file || uploading ? colors.textFaint : '#fff',
          border: `1px solid ${!file || uploading ? colors.border : colors.accent}`,
          fontSize: 12, fontWeight: 500, cursor: !file || uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s', whiteSpace: 'nowrap',
          opacity: !file || uploading ? 0.6 : 1,
        }}
      >
        <Upload size={12} />
        {uploading ? 'Uploading…' : 'Upload'}
      </button>

      {error && (
        <span style={{ fontSize: 11, color: colors.danger }}>{error}</span>
      )}
    </div>
  )
}

export default UploadFile
