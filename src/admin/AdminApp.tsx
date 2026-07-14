import { Download, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { displayLabel, supportedAnimalLabels } from '../model/taxonomy'

type Summary = {
  total: number
  pending: number
  confirmed: number
  labels: Array<{ label: string; count: number }>
}

type Submission = {
  id: string
  createdAt: string
  feedback: 'confirmed' | 'corrected'
  userLabel: string
  predictedLabel: string | null
  predictions: Array<{ label: string; confidence: number }>
  modelVersion: string
  status: 'pending' | 'approved' | 'rejected'
  imageUrl: string
}

type SessionState = 'loading' | 'loggedOut' | 'ready'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? 'Request failed.')
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

export function AdminApp() {
  const [session, setSession] = useState<SessionState>('loading')
  const [password, setPassword] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const query = new URLSearchParams()
      if (label) query.set('label', label)
      if (status) query.set('status', status)
      const [nextSummary, list] = await Promise.all([
        api<Summary>('/api/admin/summary'),
        api<{ submissions: Submission[] }>(`/api/admin/submissions?${query.toString()}`),
      ])
      setSummary(nextSummary)
      setSubmissions(list.submissions)
      setSession('ready')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Admin data could not be loaded.'
      if (message === 'Admin authentication is required.') setSession('loggedOut')
      else {
        setError(message)
        setSession('loggedOut')
      }
    } finally {
      setBusy(false)
    }
  }, [label, status])

  useEffect(() => { void load() }, [load])

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api<void>('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
      setPassword('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await api<void>('/api/admin/logout', { method: 'POST' }).catch(() => undefined)
    setSummary(null)
    setSubmissions([])
    setSession('loggedOut')
  }

  const applyFilters = () => { void load() }
  const query = new URLSearchParams()
  if (label) query.set('label', label)
  if (status) query.set('status', status)
  const exportQuery = query.toString()

  if (session === 'loading') return <main className="admin-shell"><p className="admin-loading">Checking admin session...</p></main>

  if (session === 'loggedOut') {
    return (
      <main className="admin-login-shell">
        <section className="admin-login" aria-labelledby="admin-title">
          <span className="admin-mark"><LockKeyhole size={22} aria-hidden="true" /></span>
          <p className="eyebrow">Dataset administration</p>
          <h1 id="admin-title">Animal Sketch data</h1>
          <p>Review anonymous contributor submissions and export data for offline curation.</p>
          <form onSubmit={login}>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
          </form>
          {error && <p className="feedback-error" role="alert">{error}</p>}
          <a href="/">Return to playground</a>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div><p className="eyebrow">Dataset administration</p><h1>Animal Sketch data</h1></div>
        <div className="admin-topbar-actions"><a className="text-button" href="/">Playground</a><button className="text-button" type="button" onClick={() => void logout()}><LogOut size={15} aria-hidden="true" /> Sign out</button></div>
      </header>

      <section className="admin-stats" aria-label="Dataset summary">
        <article><span>Total submissions</span><strong>{summary?.total ?? 0}</strong></article>
        <article><span>Pending review</span><strong>{summary?.pending ?? 0}</strong></article>
        <article><span>User confirmed</span><strong>{summary?.confirmed ?? 0}</strong></article>
        <article><span>Data policy</span><strong className="policy-value"><ShieldCheck size={18} aria-hidden="true" /> Pending first</strong></article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="section-kicker">Collected sketches</p><h2>Review and export</h2></div><div className="export-actions"><a className="button button-secondary" href={`/api/admin/export?format=csv${exportQuery ? `&${exportQuery}` : ''}`}><Download size={16} aria-hidden="true" /> CSV</a><a className="button button-primary" href={`/api/admin/export?format=zip${exportQuery ? `&${exportQuery}` : ''}`}><Download size={16} aria-hidden="true" /> Dataset ZIP</a></div></div>
        <div className="admin-filters">
          <label>Animal<select value={label} onChange={(event) => setLabel(event.target.value)}><option value="">All animals</option>{supportedAnimalLabels.map((item) => <option key={item} value={item}>{displayLabel(item)}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
          <button className="button button-secondary" type="button" onClick={applyFilters} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
        </div>
        {error && <p className="feedback-error" role="alert">{error}</p>}
        {submissions.length ? <div className="submission-list">
          {submissions.map((submission) => <article className="submission-row" key={submission.id}>
            <img src={submission.imageUrl} alt={`Model input for ${displayLabel(submission.userLabel)}`} width="64" height="64" />
            <div className="submission-main"><strong>{displayLabel(submission.userLabel)}</strong><span>{submission.feedback === 'confirmed' ? 'User confirmed' : `Corrected from ${displayLabel(submission.predictedLabel ?? 'unknown')}`}</span><small>{new Date(submission.createdAt).toLocaleString()} · {submission.modelVersion}</small></div>
            <div className="submission-score"><span>{submission.status}</span><strong>{(submission.predictions[0]?.confidence ?? 0) * 100 | 0}%</strong></div>
          </article>)}
        </div> : <p className="admin-empty">No submissions match these filters yet.</p>}
      </section>
    </main>
  )
}
