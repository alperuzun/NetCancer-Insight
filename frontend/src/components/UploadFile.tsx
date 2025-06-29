import React, { useState } from 'react'
import axios from 'axios'
// import { uploadFile } from '@/services/api';

interface UploadFileProps {
  onUploadSuccess: () => void;
  graphIndex?: number;
}

const UploadFile: React.FC<UploadFileProps> = ({ onUploadSuccess, graphIndex = 0 }) => {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`http://localhost:8000/upload?graph_index=${graphIndex}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      console.log('Upload successful:', response.data)
      onUploadSuccess()
      setFile(null)
    } catch (err) {
      console.error('Upload failed:', err)
      setError('Failed to upload file. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <input
        type="file"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100"
        accept=".csv,.tsv"
      />
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className={`px-4 py-2 rounded-md text-white ${
          !file || uploading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  )
}

export default UploadFile 