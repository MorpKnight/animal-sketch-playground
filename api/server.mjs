import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { basename, join } from 'node:path'
import { supportedAnimalLabels } from './labels.mjs'

const dataDir = process.env.DATA_DIR ?? '/data'
const port = Number(process.env.PORT ?? 3000)
const passwordFile = process.env.ADMIN_PASSWORD_FILE ?? '/run/secrets/admin_password'
const maxBodyBytes = 900_000
const sessionLifetimeMs = 8 * 60 * 60 * 1000
const sessionCookieName = 'animal_sketch_admin'
const allowedLabels = new Set(supportedAnimalLabels)

mkdirSync(join(dataDir, 'images'), { recursive: true })
const database = new DatabaseSync(join(dataDir, 'dataset.sqlite'))
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    feedback TEXT NOT NULL CHECK(feedback IN ('confirmed', 'corrected')),
    user_label TEXT NOT NULL,
    predicted_label TEXT,
    predictions_json TEXT NOT NULL,
    strokes_json TEXT NOT NULL,
    image_file TEXT NOT NULL,
    model_version TEXT NOT NULL,
    preprocess_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))
  );
  CREATE INDEX IF NOT EXISTS submissions_created_at ON submissions(created_at DESC);
  CREATE INDEX IF NOT EXISTS submissions_label ON submissions(user_label);
`)

function readPassword() {
  if (existsSync(passwordFile)) return readFileSync(passwordFile, 'utf8').trim()
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  throw new Error(`Admin password secret was not found at ${passwordFile}.`)
}

const passwordSalt = randomBytes(16)
const passwordHash = scryptSync(readPassword(), passwordSalt, 64, { maxmem: 64 * 1024 * 1024 })
const sessions = new Map()
const loginAttempts = new Map()

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  response.end(JSON.stringify(body))
}

function sendText(response, status, body, headers = {}) {
  response.writeHead(status, headers)
  response.end(body)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').flatMap((entry) => {
    const index = entry.indexOf('=')
    return index < 1 ? [] : [[entry.slice(0, index).trim(), decodeURIComponent(entry.slice(index + 1).trim())]]
  }))
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function currentSession(request) {
  const token = cookies(request)[sessionCookieName]
  if (!token) return null
  const hash = tokenHash(token)
  const session = sessions.get(hash)
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(hash)
    return null
  }
  return { token, hash, ...session }
}

function requireAdmin(request, response) {
  const session = currentSession(request)
  if (session) return session
  send(response, 401, { error: 'Admin authentication is required.' })
  return null
}

function isSecureRequest(request) {
  return (request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https'
}

function sessionCookie(request, token, maxAgeSeconds) {
  const secure = isSecureRequest(request) ? '; Secure' : ''
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
}

function requestIp(request) {
  return request.socket.remoteAddress ?? 'unknown'
}

function tooManyAttempts(request) {
  const attempt = loginAttempts.get(requestIp(request))
  return attempt && attempt.count >= 5 && attempt.until > Date.now()
}

function recordFailedAttempt(request) {
  const key = requestIp(request)
  const previous = loginAttempts.get(key)
  loginAttempts.set(key, { count: (previous?.count ?? 0) + 1, until: Date.now() + 15 * 60 * 1000 })
}

function validStrokes(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0 || strokes.length > 400) return false
  let points = 0
  return strokes.every((stroke) => {
    if (!Array.isArray(stroke) || stroke.length === 0 || stroke.length > 1_000) return false
    points += stroke.length
    return points <= 20_000 && stroke.every((point) => (
      point && typeof point.x === 'number' && typeof point.y === 'number'
      && Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    ))
  })
}

function validPredictions(predictions) {
  return Array.isArray(predictions) && predictions.length > 0 && predictions.length <= 3
    && predictions.every((prediction) => (
      prediction && typeof prediction.label === 'string' && prediction.label.length <= 64
      && typeof prediction.confidence === 'number' && Number.isFinite(prediction.confidence)
      && prediction.confidence >= 0 && prediction.confidence <= 1
    ))
}

function parseSubmission(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Submission is required.')
  if (!allowedLabels.has(payload.userLabel)) throw new Error('Choose an animal from the supported label list.')
  if (payload.feedback !== 'confirmed' && payload.feedback !== 'corrected') throw new Error('Feedback is invalid.')
  if (!validStrokes(payload.strokes)) throw new Error('Drawing data is invalid.')
  if (!validPredictions(payload.predictions)) throw new Error('Predictions are invalid.')
  if (typeof payload.modelVersion !== 'string' || payload.modelVersion.length > 80) throw new Error('Model version is invalid.')
  if (typeof payload.preprocessVersion !== 'string' || payload.preprocessVersion.length > 80) throw new Error('Preprocess version is invalid.')
  const match = typeof payload.inputPreview === 'string'
    ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(payload.inputPreview)
    : null
  if (!match) throw new Error('Model input image must be a PNG data URL.')
  const image = Buffer.from(match[1], 'base64')
  if (image.length === 0 || image.length > 200_000) throw new Error('Model input image is invalid.')
  return { ...payload, image }
}

function toSubmission(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    feedback: row.feedback,
    userLabel: row.user_label,
    predictedLabel: row.predicted_label,
    predictions: JSON.parse(row.predictions_json),
    modelVersion: row.model_version,
    preprocessVersion: row.preprocess_version,
    status: row.status,
    imageUrl: `/api/admin/submissions/${row.id}/image`,
  }
}

function listRows(searchParams) {
  const status = searchParams.get('status')
  const label = searchParams.get('label')
  const clauses = []
  const values = []
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    clauses.push('status = ?')
    values.push(status)
  }
  if (label && allowedLabels.has(label)) {
    clauses.push('user_label = ?')
    values.push(label)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  return database.prepare(`SELECT * FROM submissions${where} ORDER BY created_at DESC`).all(...values)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function metadataCsv(rows) {
  const headings = ['id', 'created_at', 'status', 'feedback', 'user_label', 'predicted_label', 'top_predictions', 'model_version', 'preprocess_version', 'image_file', 'strokes_file']
  const lines = [headings.join(',')]
  for (const row of rows) {
    const predictions = JSON.parse(row.predictions_json).map((prediction) => `${prediction.label}:${prediction.confidence}`).join('|')
    lines.push([row.id, row.created_at, row.status, row.feedback, row.user_label, row.predicted_label, predictions,
      row.model_version, row.preprocess_version, `images/${row.image_file}`, `strokes/${row.id}.json`].map(csvEscape).join(','))
  }
  return `${lines.join('\n')}\n`
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function zip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function summary() {
  const total = database.prepare('SELECT COUNT(*) AS count FROM submissions').get().count
  const pending = database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status = 'pending'").get().count
  const confirmed = database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE feedback = 'confirmed'").get().count
  const labels = database.prepare('SELECT user_label AS label, COUNT(*) AS count FROM submissions GROUP BY user_label ORDER BY count DESC, user_label ASC').all()
  return { total, pending, confirmed, labels }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') return sendText(response, 200, 'ok\n', { 'content-type': 'text/plain; charset=utf-8' })
    if (request.method === 'POST' && url.pathname === '/api/submissions') {
      const payload = parseSubmission(await readJson(request))
      const id = randomUUID()
      const imageFile = `${id}.png`
      writeFileSync(join(dataDir, 'images', imageFile), payload.image, { flag: 'wx' })
      database.prepare(`INSERT INTO submissions (id, created_at, feedback, user_label, predicted_label, predictions_json, strokes_json, image_file, model_version, preprocess_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, new Date().toISOString(), payload.feedback, payload.userLabel,
        payload.predictions[0]?.label ?? null, JSON.stringify(payload.predictions), JSON.stringify(payload.strokes), imageFile,
        payload.modelVersion, payload.preprocessVersion)
      return send(response, 201, { id, status: 'pending' })
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/login') {
      if (tooManyAttempts(request)) return send(response, 429, { error: 'Too many attempts. Try again later.' })
      const payload = await readJson(request)
      const candidate = typeof payload?.password === 'string' ? scryptSync(payload.password, passwordSalt, 64, { maxmem: 64 * 1024 * 1024 }) : Buffer.alloc(64)
      if (!timingSafeEqual(candidate, passwordHash)) {
        recordFailedAttempt(request)
        return send(response, 401, { error: 'Password is incorrect.' })
      }
      loginAttempts.delete(requestIp(request))
      const token = randomBytes(32).toString('base64url')
      sessions.set(tokenHash(token), { expiresAt: Date.now() + sessionLifetimeMs })
      return send(response, 204, null, { 'set-cookie': sessionCookie(request, token, sessionLifetimeMs / 1000) })
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
      const session = currentSession(request)
      if (session) sessions.delete(session.hash)
      return send(response, 204, null, { 'set-cookie': sessionCookie(request, '', 0) })
    }
    if (!url.pathname.startsWith('/api/admin/')) return send(response, 404, { error: 'Not found.' })
    if (!requireAdmin(request, response)) return
    if (request.method === 'GET' && url.pathname === '/api/admin/summary') return send(response, 200, summary())
    if (request.method === 'GET' && url.pathname === '/api/admin/submissions') return send(response, 200, { submissions: listRows(url.searchParams).map(toSubmission) })
    if (request.method === 'GET' && /^\/api\/admin\/submissions\/[^/]+\/image$/.test(url.pathname)) {
      const id = basename(url.pathname.split('/').at(-2))
      const row = database.prepare('SELECT image_file FROM submissions WHERE id = ?').get(id)
      if (!row) return send(response, 404, { error: 'Submission not found.' })
      return sendText(response, 200, readFileSync(join(dataDir, 'images', row.image_file)), { 'content-type': 'image/png', 'cache-control': 'private, no-store' })
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/export') {
      const rows = listRows(url.searchParams)
      const format = url.searchParams.get('format')
      if (format === 'csv') return sendText(response, 200, metadataCsv(rows), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="animal-sketch-metadata.csv"', 'cache-control': 'no-store' })
      if (format === 'zip') {
        const entries = [{ name: 'metadata.csv', data: metadataCsv(rows) }]
        for (const row of rows) {
          entries.push({ name: `strokes/${row.id}.json`, data: row.strokes_json })
          entries.push({ name: `images/${row.image_file}`, data: readFileSync(join(dataDir, 'images', row.image_file)) })
        }
        return sendText(response, 200, zip(entries), { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="animal-sketch-dataset.zip"', 'cache-control': 'no-store' })
      }
      return send(response, 400, { error: 'Choose csv or zip export format.' })
    }
    return send(response, 404, { error: 'Not found.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    const status = ['Request body is too large.', 'Request body must be valid JSON.'].includes(message) ? 400 : 422
    console.error(`${request.method} ${url.pathname}: ${message}`)
    return send(response, status, { error: message })
  }
})

server.listen(port, () => console.log(`Dataset API listening on ${port}`))
