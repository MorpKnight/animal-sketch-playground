import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  Code2,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { DrawingCanvas } from './features/drawing/DrawingCanvas'
import { DatasetConsentModal } from './features/dataset/DatasetConsentModal'
import { DatasetFeedback } from './features/dataset/DatasetFeedback'
import { createDatasetCandidate, type DatasetSubmission } from './features/dataset/submissions'
import { hasDrawableInk } from './model/preprocess'
import { SketchModelRuntime } from './model/runtime'
import { animalContext, displayLabel } from './model/taxonomy'
import type { Classification, Stroke } from './model/types'
import { AdminApp } from './admin/AdminApp'
import './App.css'

type RuntimeStatus = 'loading' | 'ready' | 'classifying' | 'error'

const modelPage = 'https://huggingface.co/morpknight/animal-sketch-classifier-coreml'
const sourcePage = 'https://github.com/MorpKnight/animal-sketch-coreml'
const consentKey = 'animal-sketch-dataset-consent-v1'

type DatasetConsent = 'share' | 'local' | null

function initialDatasetConsent(): DatasetConsent {
  const saved = window.localStorage.getItem(consentKey)
  return saved === 'share' || saved === 'local' ? saved : null
}

function PlaygroundApp() {
  const runtime = useRef(new SketchModelRuntime())
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [status, setStatus] = useState<RuntimeStatus>('loading')
  const [result, setResult] = useState<Classification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [datasetConsent, setDatasetConsent] = useState<DatasetConsent>(initialDatasetConsent)
  const [datasetSubmission, setDatasetSubmission] = useState<DatasetSubmission | null>(null)
  const [isSavingCandidate, setIsSavingCandidate] = useState(false)
  const [datasetSaveError, setDatasetSaveError] = useState<string | null>(null)

  useEffect(() => {
    runtime.current.prepare()
      .then(() => setStatus('ready'))
      .catch((cause: unknown) => {
        console.error('Model initialization failed:', cause)
        setStatus('error')
        const detail = cause instanceof Error ? cause.message : String(cause)
        setError(`Model could not be loaded: ${detail}`)
      })
  }, [])

  const drawingReady = hasDrawableInk(strokes)
  const acceptedContext = result?.accepted ? animalContext(result.accepted.label) : null
  const statusText = useMemo(() => {
    if (status === 'loading') return 'Loading model'
    if (status === 'classifying') return 'Classifying drawing'
    if (status === 'error') return 'Model unavailable'
    return 'Model ready'
  }, [status])

  const onDrawingChange = (next: Stroke[]) => {
    setStrokes(next)
    if (result) setResult(null)
    setDatasetSubmission(null)
    setDatasetSaveError(null)
    if (error) setError(null)
  }

  const clearDrawing = () => {
    setStrokes([])
    setResult(null)
    setDatasetSubmission(null)
    setDatasetSaveError(null)
    setError(null)
  }

  const classifyDrawing = async () => {
    if (!drawingReady) {
      setError('Draw an animal before classifying.')
      return
    }
    setStatus('classifying')
    setError(null)
    try {
      const classification = await runtime.current.classify(strokes)
      setResult(classification)
      setDatasetSubmission(null)
      setDatasetSaveError(null)
      if (datasetConsent === 'share') {
        setIsSavingCandidate(true)
        try {
          setDatasetSubmission(await createDatasetCandidate(classification, strokes))
        } catch (cause) {
          setDatasetSaveError(cause instanceof Error ? cause.message : 'Sketch could not be saved for review.')
        } finally {
          setIsSavingCandidate(false)
        }
      }
      setStatus('ready')
    } catch (cause: unknown) {
      console.error('Classification failed:', cause)
      setStatus('error')
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(`Classification did not complete: ${detail}`)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#workspace" aria-label="Animal Sketch Playground home">
          <span>Animal</span>
          <strong>Sketch</strong>
          <span>Playground</span>
        </a>
        <div className={`runtime-indicator ${status}`} role="status" aria-live="polite">
          {status === 'loading' || status === 'classifying' ? <LoaderCircle size={15} /> : <Cpu size={15} />}
          <span>{statusText}</span>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">ANIMAL SKETCH CLASSIFIER / V4</p>
        <h1 id="page-title">Draw an animal.</h1>
        <p className="intro-copy">One sketch, 49 possible outcomes. The model runs in your browser.</p>
      </section>

      <section className="workbench" id="workspace" aria-label="Animal sketch workbench">
        <div className="canvas-column">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Drawing board</p>
              <h2>Sketch surface</h2>
            </div>
            <span className="ink-count">{strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'}</span>
          </div>
          <div className="canvas-frame">
            <DrawingCanvas strokes={strokes} onChange={onDrawingChange} disabled={status === 'classifying'} />
            {!drawingReady && <span className="canvas-prompt" aria-hidden="true">Start with a stroke</span>}
          </div>
          <div className="canvas-actions">
            <button className="button button-secondary" type="button" onClick={clearDrawing} disabled={strokes.length === 0 || status === 'classifying'}>
              <Trash2 size={18} aria-hidden="true" />
              Clear
            </button>
            <button className="button button-primary" type="button" onClick={classifyDrawing} disabled={!drawingReady || status !== 'ready'}>
              {status === 'classifying' ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              {status === 'classifying' ? 'Classifying' : 'Classify drawing'}
            </button>
          </div>
          {error && <p className="inline-error" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</p>}
        </div>

        <aside className="inspector" aria-labelledby="result-title">
          <div className="panel-heading inspector-heading">
            <div>
              <p className="section-kicker">Model output</p>
              <h2 id="result-title">Classification</h2>
            </div>
            <span className="model-tag">ONNX / WASM</span>
          </div>

          {result ? (
            <div className="result-content">
              <div className="input-preview-row">
                <img className="model-preview" src={result.inputPreview} width="64" height="64" alt="64 by 64 model input preview" />
                <div>
                  <span className="preview-label">Model input</span>
                  <span className="preview-meta">64 x 64 / white on black</span>
                </div>
              </div>

              {result.accepted && acceptedContext ? (
                <div className="primary-result accepted-result">
                  <div className="result-symbol"><CheckCircle2 size={25} aria-hidden="true" /></div>
                  <div className="result-label-row">
                    <h3>{displayLabel(result.accepted.label)}</h3>
                    <strong>{(result.accepted.confidence * 100).toFixed(1)}%</strong>
                  </div>
                  <p>{acceptedContext.behavior}</p>
                  <span>{acceptedContext.group}</span>
                </div>
              ) : (
                <div className="primary-result unknown-result">
                  <div className="result-symbol"><CircleAlert size={25} aria-hidden="true" /></div>
                  <h3>Unknown animal</h3>
                  <p>Top result is Other or below 30% confidence.</p>
                </div>
              )}

              <div className="prediction-list">
                <p className="section-kicker">Top predictions</p>
                {result.predictions.map((prediction, index) => (
                  <div className="prediction" key={prediction.label}>
                    <span className="prediction-rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="prediction-name">{displayLabel(prediction.label)}</span>
                    <span className="prediction-score">{(prediction.confidence * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              {datasetConsent === 'share' && <DatasetFeedback key={result.inputPreview} classification={result} submission={datasetSubmission} isSavingCandidate={isSavingCandidate} saveError={datasetSaveError} />}
              <button className="reset-link" type="button" onClick={clearDrawing}>
                <RotateCcw size={15} aria-hidden="true" /> New drawing
              </button>
            </div>
          ) : (
            <div className="empty-result">
              <div className="empty-glyph"><Sparkles size={25} aria-hidden="true" /></div>
              <h3>{status === 'loading' ? 'Preparing V4' : 'Awaiting a sketch'}</h3>
              <p>{status === 'loading' ? 'The browser is loading the local model.' : 'Results appear here after classification.'}</p>
            </div>
          )}
        </aside>
      </section>

      <footer className="footer">
        <span>V4 · 49 labels · Local inference</span>
        <nav aria-label="Project links">
          <a href={modelPage} target="_blank" rel="noreferrer">Model card</a>
          <a href={sourcePage} target="_blank" rel="noreferrer"><Code2 size={15} aria-hidden="true" /> Source</a>
        </nav>
      </footer>
      {datasetConsent === null && <DatasetConsentModal onChoose={(choice) => { window.localStorage.setItem(consentKey, choice); setDatasetConsent(choice) }} />}
    </main>
  )
}

function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminApp /> : <PlaygroundApp />
}

export default App
