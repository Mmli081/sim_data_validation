import React, { useEffect, useMemo, useState, useRef } from 'react'

type Model = string

type FileItem = { 
  name: string; 
  hasResult: boolean;
  status: 'unreviewed' | 'reviewed' | 'no_result';
}

type ModelsResponse = Array<{
  model: Model
  pdfs: string[]
  unreviewedCount: number
  reviewedCount: number
}>

type FilesResponse = {
  model: Model
  unreviewed: FileItem[]
  reviewed: FileItem[]
  noResult: FileItem[]
}

type ResultResponse = { 
  file: string; 
  data: Record<string, any>;
  status: 'unreviewed' | 'reviewed';
}

async function getModels(): Promise<ModelsResponse> {
  const res = await fetch('/api/models')
  return res.json()
}

async function listFiles(model: Model): Promise<FilesResponse> {
  const res = await fetch(`/api/${model}/files`)
  return res.json()
}

async function getResult(model: Model, file: string): Promise<ResultResponse> {
  const url = new URL(`/api/${model}/result`, window.location.origin)
  url.searchParams.set('file', file)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('No result')
  return res.json()
}

async function saveResult(model: Model, file: string, data: Record<string, any>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`/api/${model}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, data }),
  })
  if (!res.ok) throw new Error('Save failed')
  return res.json()
}

async function markAsReviewed(model: Model, file: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`/api/${model}/mark-reviewed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  })
  if (!res.ok) throw new Error('Mark as reviewed failed')
  return res.json()
}

async function markAsUnreviewed(model: Model, file: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`/api/${model}/mark-unreviewed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  })
  if (!res.ok) throw new Error('Mark as unreviewed failed')
  return res.json()
}

async function uploadPDF(file: File, model: Model): Promise<{ ok: boolean; message: string; filename?: string }> {
  const formData = new FormData()
  formData.append('pdf', file)
  formData.append('model', model)
  formData.append('filename', file.name)
  
  const res = await fetch('/api/upload-pdf', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'Upload failed')
  }
  return res.json()
}

async function downloadModelData(model: Model): Promise<void> {
  try {
    const res = await fetch(`/api/${model}/download-data`)
    if (!res.ok) {
      throw new Error('Download failed')
    }
    
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    
    // Get filename from Content-Disposition header or use default
    const contentDisposition = res.headers.get('Content-Disposition')
    let filename = `${model}_results.json`
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }
    
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Download failed')
  }
}

export function App() {
  const [models, setModels] = useState<ModelsResponse>([])
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)

  useEffect(() => {
    getModels().then(setModels).catch(() => setModels([]))
  }, [])

  const refreshModels = () => {
    getModels().then(setModels).catch(() => setModels([]))
  }

  if (!selectedModel) {
    return <ModelPicker models={models} onPick={setSelectedModel} onUpload={refreshModels} />
  }

  return <ModelView model={selectedModel} onBack={() => setSelectedModel(null)} />
}

function ModelView({ model, onBack }: { model: Model; onBack: () => void }) {
  const [filesData, setFilesData] = useState<FilesResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, any> | null>(null)
  const [edited, setEdited] = useState<Record<string, any> | null>(null)
  const [fileStatus, setFileStatus] = useState<'unreviewed' | 'reviewed' | null>(null)
  const [activeTab, setActiveTab] = useState<'unreviewed' | 'reviewed'>('unreviewed')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [model])

  const loadFiles = async () => {
    try {
      const data = await listFiles(model)
      setFilesData(data)
    } catch (e) {
      setFilesData(null)
    }
  }

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true)
    setResult(null)
    setEdited(null)
    setMessage(null)
    getResult(model, selectedFile)
      .then((r) => { 
        setResult(r.data)
        setEdited(r.data)
        setFileStatus(r.status)
      })
      .catch(() => { 
        setResult({})
        setEdited({})
        setFileStatus(null)
      })
      .finally(() => setLoading(false))
  }, [model, selectedFile])

  const pdfUrl = useMemo(() => {
    if (!selectedFile) return null
    return `/api/${model}/pdf/${encodeURIComponent(selectedFile)}`
  }, [model, selectedFile])

  function onChangeField(key: string, value: any) {
    setEdited((prev) => ({ ...(prev || {}), [key]: value }))
  }

  async function onSave() {
    if (!selectedFile || !edited) return
    setSaving(true)
    setMessage(null)
    try {
      const resp = await saveResult(model as Model, selectedFile, edited)
      setMessage(resp.message)
      await loadFiles()
    } catch (e) {
      setMessage('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onMarkReviewed() {
    if (!selectedFile) return
    try {
      setMessage(null)
      await markAsReviewed(model, selectedFile)
      setMessage('Marked as reviewed')
      await loadFiles()
      setFileStatus('reviewed')
    } catch (e) {
      setMessage('Failed to mark as reviewed')
    }
  }

  async function onMarkUnreviewed() {
    if (!selectedFile) return
    try {
      setMessage(null)
      await markAsUnreviewed(model, selectedFile)
      setMessage('Moved to unreviewed')
      await loadFiles()
      setFileStatus('unreviewed')
    } catch (e) {
      setMessage('Failed to move to unreviewed')
    }
  }

  async function onDownloadData() {
    try {
      setDownloading(true)
      setMessage(null)
      await downloadModelData(model)
      setMessage('Data downloaded successfully')
    } catch (e) {
      setMessage('Failed to download data')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="button" onClick={onBack}>Back</button>
          <div>{model.toUpperCase()} Review</div>
        </div>
        <div className="toolbar">
          <button 
            className="button" 
            onClick={onDownloadData}
            disabled={downloading}
            style={{ marginRight: 'auto' }}
          >
            {downloading ? 'Downloading...' : 'Download Data'}
          </button>
          {selectedFile && (
            <>
              <button className="button primary" disabled={!edited || saving} onClick={onSave}>
                {saving ? 'Saving...' : 'Save Result'}
              </button>
              {fileStatus === 'unreviewed' && (
                <button className="button" onClick={onMarkReviewed}>
                  Mark as Reviewed
                </button>
              )}
              {fileStatus === 'reviewed' && (
                <button className="button" onClick={onMarkUnreviewed}>
                  Move to Unreviewed
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <aside className="sidebar">
        <div>
          <div className="model-heading">{model}</div>
          
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'unreviewed' ? 'active' : ''}`}
              onClick={() => setActiveTab('unreviewed')}
            >
              Unreviewed ({filesData?.unreviewed.length || 0})
            </button>
            <button
              className={`tab ${activeTab === 'reviewed' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviewed')}
            >
              Reviewed ({filesData?.reviewed.length || 0})
            </button>
          </div>

          {/* Files list per active tab */}
          <div style={{ marginBottom: 20 }}>
            {(activeTab === 'unreviewed' ? filesData?.unreviewed : filesData?.reviewed)?.map((f) => {
              const active = selectedFile === f.name
              const isUnreviewed = activeTab === 'unreviewed'
              return (
                <div key={f.name} className={`file-item ${active ? 'active' : ''}`} onClick={() => setSelectedFile(f.name)}>
                  <div className={`dot ${isUnreviewed ? 'orange' : 'green'}`} />
                  <div className="file-name" title={f.name}>{f.name}</div>
                </div>
              )
            })}
          </div>

          {/* Files without results */}
          {(filesData?.noResult.length || 0) > 0 && (
            <div>
              <h4 style={{ margin: '10px 0 5px 0', fontSize: 14, color: '#666' }}>
                No Results ({filesData?.noResult.length || 0})
              </h4>
              {filesData?.noResult.map((f) => {
                const active = selectedFile === f.name
                return (
                  <div key={f.name} className={`file-item ${active ? 'active' : ''}`} onClick={() => setSelectedFile(f.name)}>
                    <div className="dot gray" />
                    <div className="file-name" title={f.name}>{f.name}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
      <main className="content">
        <div className="card">
          <h3>Document</h3>
          <div className="body">
            {pdfUrl ? (
              <iframe className="pdf-frame" src={pdfUrl} />
            ) : (
              <div>Select a file to preview</div>
            )}
          </div>
        </div>
        <div className="card">
          <h3>
            Extracted Result 
            {fileStatus && (
              <span style={{ 
                marginLeft: 8, 
                padding: '2px 8px', 
                fontSize: 12, 
                borderRadius: 4,
                background: fileStatus === 'reviewed' ? '#d4edda' : '#fff3cd',
                color: fileStatus === 'reviewed' ? '#155724' : '#856404'
              }}>
                {fileStatus}
              </span>
            )}
            {message && (
              <span style={{ marginLeft: 8, color: '#9fb0c3', fontWeight: 400, fontSize: 12 }}>
                ({message})
              </span>
            )}
          </h3>
          <div className="body">
            {loading ? (
              <div>Loading...</div>
            ) : selectedFile ? (
              <ResultEditor data={edited || {}} onChange={onChangeField} />
            ) : (
              <div>Select a file to view result</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function ModelPicker({ models, onPick, onUpload }: { models: ModelsResponse; onPick: (m: Model) => void; onUpload: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [selectedUploadModel, setSelectedUploadModel] = useState<Model | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!selectedUploadModel) {
      setUploadMessage('Please select a model first')
      return
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadMessage('Please select a PDF file')
      return
    }

    handleUpload(file, selectedUploadModel)
  }

  const handleUpload = async (file: File, model: Model) => {
    setUploading(true)
    setUploadMessage(null)
    
    try {
      const result = await uploadPDF(file, model)
      setUploadMessage(result.message || 'Upload successful!')
      onUpload() // Refresh the models list
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleUploadButtonClick = () => {
    if (!selectedUploadModel) {
      setUploadMessage('Please select a model first')
      return
    }
    fileInputRef.current?.click()
  }
  
  return (
    <div className="splash">
      <div className="splash-title">Choose model to review</div>
      <div className="tiles">
        {models.map((modelData) => {
          return (
            <button key={modelData.model} className="tile" onClick={() => onPick(modelData.model)}>
              <div className="tile-title">{modelData.model.toUpperCase()}</div>
              <div className="tile-sub">
                Unreviewed: {modelData.unreviewedCount ?? 0} | Reviewed: {modelData.reviewedCount ?? 0}
              </div>
            </button>
          )
        })}
      </div>
      
      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', width: 'min(900px, 100%)' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>Upload PDF to Data Repository</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {models.map((modelData) => (
              <button
                key={modelData.model}
                className={`button ${selectedUploadModel === modelData.model ? 'primary' : ''}`}
                onClick={() => {
                  setSelectedUploadModel(modelData.model)
                  setUploadMessage(null)
                }}
                style={{ fontSize: 14 }}
              >
                {modelData.model.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            className="button"
            onClick={handleUploadButtonClick}
            disabled={uploading || !selectedUploadModel}
            style={{ fontSize: 14 }}
          >
            {uploading ? 'Uploading...' : 'Select PDF'}
          </button>
        </div>
        {uploadMessage && (
          <div style={{ 
            padding: '8px 16px', 
            borderRadius: 8, 
            fontSize: 14,
            background: uploadMessage.includes('success') || uploadMessage.includes('successfully') 
              ? '#d4edda' 
              : '#f8d7da',
            color: uploadMessage.includes('success') || uploadMessage.includes('successfully')
              ? '#155724'
              : '#721c24',
            maxWidth: '100%',
            textAlign: 'center'
          }}>
            {uploadMessage}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultEditor({ data, onChange }: { data: Record<string, any>; onChange: (key: string, value: any) => void }) {
  const entries = Object.entries(data)
  return (
    <div className="json-editor">
      {entries.length === 0 && <div style={{ color: '#9fb0c3' }}>No result available.</div>}
      {entries.map(([key, value]) => (
        <div className="row" key={key}>
          <div className="kv-label">{key}</div>
          {Array.isArray(value) ? (
            (value as any[]).every((v) => typeof v === 'object' && v !== null)
              ? (
                <ArrayOfObjectsEditor items={value as Array<Record<string, any>>} onChange={(items) => onChange(key, items)} />
              )
              : (
                <textarea className="textarea" value={(value as any[]).join('\n')} onChange={(e) => onChange(key, e.target.value.split('\n').filter(Boolean))} />
              )
          ) : typeof value === 'object' && value !== null ? (
            <textarea className="textarea" value={JSON.stringify(value, null, 2)} onChange={(e) => {
              try { onChange(key, JSON.parse(e.target.value)) } catch {
                onChange(key, e.target.value)
              }
            }} />
          ) : (
            <input className="input" value={String(value ?? '')} onChange={(e) => {
              const v = e.target.value
              if (v === '') { onChange(key, '') ; return }
              if (/^[-]?[0-9]+(\.[0-9]+)?$/.test(v)) onChange(key, Number(v))
              else onChange(key, v)
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

function ObjectFieldsEditor({ obj, onChange }: { obj: Record<string, any>; onChange: (next: Record<string, any>) => void }) {
  return (
    <div className="json-editor">
      {Object.entries(obj).map(([k, v]) => (
        <div className="row" key={k}>
          <div className="kv-label">{k}</div>
          {Array.isArray(v) || (typeof v === 'object' && v !== null) ? (
            <textarea className="textarea" value={JSON.stringify(v, null, 2)} onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                onChange({ ...obj, [k]: parsed })
              } catch {
                onChange({ ...obj, [k]: e.target.value })
              }
            }} />
          ) : (
            <input className="input" value={String(v ?? '')} onChange={(e) => {
              const val = e.target.value
              const next = { ...obj }
              if (val === '') next[k] = ''
              else if (/^[-]?[0-9]+(\.[0-9]+)?$/.test(val)) next[k] = Number(val)
              else if (val === 'true' || val === 'false') next[k] = val === 'true'
              else next[k] = val
              onChange(next)
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

function ArrayOfObjectsEditor({ items, onChange }: { items: Array<Record<string, any>>; onChange: (next: Array<Record<string, any>>) => void }) {
  const handleAddItem = () => {
    // Create a new empty object with the same keys as the first item (if available)
    const template = items.length > 0 ? items[0] : {}
    const newItem: Record<string, any> = {}
    Object.keys(template).forEach(key => {
      newItem[key] = ''
    })
    onChange([...items, newItem])
  }

  const handleDeleteItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx)
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item, idx) => (
        <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--panel)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Item {idx + 1}</div>
            <button 
              className="button"
              onClick={() => handleDeleteItem(idx)}
              style={{ 
                fontSize: 11, 
                padding: '4px 8px',
                background: '#f8d7da',
                color: '#721c24',
                border: '1px solid #f5c6cb'
              }}
            >
              Delete
            </button>
          </div>
          <ObjectFieldsEditor obj={item} onChange={(nextObj) => {
            const next = items.slice()
            next[idx] = nextObj
            onChange(next)
          }} />
        </div>
      ))}
      <button 
        className="button"
        onClick={handleAddItem}
        style={{ 
          fontSize: 12, 
          padding: '8px 16px',
          background: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          marginTop: 8
        }}
      >
        + Add Item
      </button>
    </div>
  )
}



