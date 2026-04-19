process.env.TZ = 'America/Sao_Paulo'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

import db from './db.js'
import authRoutes from './routes/auth.js'
import clientRoutes from './routes/clients.js'
import departmentRoutes from './routes/departments.js'
import userRoutes from './routes/users.js'
import categoryRoutes from './routes/categories.js'
import taskRoutes from './routes/tasks.js'
import approvalRoutes from './routes/approvals.js'
import dashboardRoutes from './routes/dashboard.js'
import notificationRoutes from './routes/notifications.js'
import financialRoutes from './routes/financial.js'
import { authenticate } from './middleware/auth.js'
import { addSSEClient, removeSSEClient, addSSEUserClient, removeSSEUserClient, sendToUser } from './sse.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

const PORT = 3003

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/clients', authenticate, clientRoutes)
app.use('/api/departments', authenticate, departmentRoutes)
app.use('/api/users', authenticate, userRoutes)
app.use('/api/categories', authenticate, categoryRoutes)
app.use('/api/tasks', authenticate, taskRoutes)
app.use('/api/approvals', authenticate, approvalRoutes)
app.use('/api/dashboard', authenticate, dashboardRoutes)
app.use('/api/notifications', authenticate, notificationRoutes)
app.use('/api/financial', authenticate, financialRoutes)

// Active timers for current user
app.get('/api/my-timers', authenticate, (req, res) => {
  const timers = db.prepare(`
    SELECT te.*, t.title as task_title, t.id as task_id
    FROM time_entries te JOIN tasks t ON te.task_id = t.id
    WHERE te.user_id = ? AND te.ended_at IS NULL
    ORDER BY te.started_at DESC
  `).all(req.user.id)
  res.json({ timers })
})

// SSE
app.get('/api/events', async (req, res) => {
  const token = req.query.token
  if (!token) return res.status(401).end()
  let user
  try {
    const jwtMod = await import('jsonwebtoken')
    user = jwtMod.default.verify(token, process.env.JWT_SECRET || 'sheraos-hub-secret-trocar')
  } catch { return res.status(401).end() }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  res.write('data: {"type":"connected"}\n\n')
  const key = user.client_id || 'admin'
  addSSEClient(key, res)
  addSSEUserClient(user.id, res)
  req.on('close', () => { removeSSEClient(key, res); removeSSEUserClient(user.id, res) })
})

// Pipeline stages CRUD
app.get('/api/stages', authenticate, (req, res) => {
  res.json({ stages: db.prepare('SELECT * FROM pipeline_stages ORDER BY position').all() })
})

app.post('/api/stages', authenticate, (req, res) => {
  if (req.user.role !== 'dono') return res.status(403).json({ error: 'Forbidden' })
  const { name, slug, color, position, is_terminal } = req.body
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' })
  const result = db.prepare('INSERT INTO pipeline_stages (name, slug, position, color, is_terminal) VALUES (?, ?, ?, ?, ?)').run(name, slug, position || 0, color || '#FFB300', is_terminal || 0)
  res.json({ stage: db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(result.lastInsertRowid) })
})

app.put('/api/stages/:id', authenticate, (req, res) => {
  if (req.user.role !== 'dono') return res.status(403).json({ error: 'Forbidden' })
  const { name, color, position, is_terminal } = req.body
  const sets = []; const params = []
  if (name !== undefined) { sets.push('name = ?'); params.push(name) }
  if (color !== undefined) { sets.push('color = ?'); params.push(color) }
  if (position !== undefined) { sets.push('position = ?'); params.push(position) }
  if (is_terminal !== undefined) { sets.push('is_terminal = ?'); params.push(is_terminal) }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  params.push(req.params.id)
  db.prepare(`UPDATE pipeline_stages SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  res.json({ stage: db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(req.params.id) })
})

// Services CRUD
app.get('/api/services', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY name').all()
  res.json({ services: rows.map(r => ({ ...r, fields: JSON.parse(r.fields || '[]') })) })
})
app.post('/api/services', authenticate, (req, res) => {
  if (req.user.role !== 'dono') return res.status(403).json({ error: 'Forbidden' })
  const { name, color, fields } = req.body
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
  const result = db.prepare('INSERT INTO services (name, color, fields) VALUES (?, ?, ?)').run(name, color || '#5DADE2', JSON.stringify(fields || []))
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid)
  res.json({ service: { ...svc, fields: JSON.parse(svc.fields || '[]') } })
})
app.put('/api/services/:id', authenticate, (req, res) => {
  if (req.user.role !== 'dono') return res.status(403).json({ error: 'Forbidden' })
  const { name, color, fields, is_active } = req.body
  const sets = []; const params = []
  if (name !== undefined) { sets.push('name = ?'); params.push(name) }
  if (color !== undefined) { sets.push('color = ?'); params.push(color) }
  if (fields !== undefined) { sets.push('fields = ?'); params.push(JSON.stringify(fields)) }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active) }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  params.push(req.params.id)
  db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id)
  res.json({ service: { ...svc, fields: JSON.parse(svc.fields || '[]') } })
})

// Client services (with config)
app.get('/api/clients/:id/services', authenticate, (req, res) => {
  const rows = db.prepare('SELECT s.*, cs.config FROM services s JOIN client_services cs ON cs.service_id = s.id WHERE cs.client_id = ? AND s.is_active = 1 ORDER BY s.name').all(req.params.id)
  res.json({ services: rows.map(r => ({ ...r, config: JSON.parse(r.config || '{}') })) })
})
app.put('/api/clients/:id/services', authenticate, (req, res) => {
  if (req.user.role !== 'dono') return res.status(403).json({ error: 'Forbidden' })
  const { services } = req.body
  db.prepare('DELETE FROM client_services WHERE client_id = ?').run(req.params.id)
  if (services?.length) {
    const stmt = db.prepare('INSERT INTO client_services (client_id, service_id, config) VALUES (?, ?, ?)')
    services.forEach(s => stmt.run(req.params.id, s.id, JSON.stringify(s.config || {})))
  }
  res.json({ ok: true })
})

// Public onboard endpoints (no auth)
app.get('/api/onboard/:token', (req, res) => {
  const client = db.prepare('SELECT id, name FROM clients WHERE onboard_token = ?').get(req.params.token)
  if (!client) return res.status(404).json({ error: 'Link invalido' })
  const existing = db.prepare('SELECT id FROM client_onboard WHERE client_id = ?').get(client.id)
  res.json({ client: { id: client.id, name: client.name }, filled: !!existing })
})

app.post('/api/onboard/:token', (req, res) => {
  const client = db.prepare('SELECT id, name FROM clients WHERE onboard_token = ?').get(req.params.token)
  if (!client) return res.status(404).json({ error: 'Link invalido' })
  const { data } = req.body
  if (!data) return res.status(400).json({ error: 'Dados obrigatorios' })
  db.prepare('INSERT INTO client_onboard (client_id, data) VALUES (?, ?)').run(client.id, JSON.stringify(data))
  res.json({ ok: true })
})

// Serve frontend (production)
const distPath = resolve(__dirname, '../dist')
import { readFileSync } from 'fs'
let indexHtml = ''
try { indexHtml = readFileSync(resolve(distPath, 'index.html'), 'utf-8') } catch {}

app.use(express.static(distPath, { etag: false, maxAge: 0, setHeaders: (res, path) => {
  if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  else if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
}}))

// Dynamic OG tags for onboard links (WhatsApp preview)
app.get('/onboard/:token', (req, res) => {
  if (!indexHtml) return res.sendFile(resolve(distPath, 'index.html'))
  const client = db.prepare('SELECT name FROM clients WHERE onboard_token = ?').get(req.params.token)
  const name = client ? client.name : 'Cliente'
  const html = indexHtml
    .replace('<title>Sheraos Hub</title>', `<title>Formulario de Entrada — ${name}</title>`)
    .replace('content="Sheraos Hub — Gestao de Projetos"', `content="Formulario de Entrada — ${name}"`)
    .replace('content="Plataforma interna da Sheraos para gestao de projetos, aprovacoes e entregas."', `content="Preencha o formulario de entrada da ${name} para comecarmos o trabalho."`)
  res.send(html)
})

app.get('/{*path}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.sendFile(resolve(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[Sheraos Hub API] Running on http://localhost:${PORT}`)

  // Server-side timer check — every 5 minutes, check for active timers and send SSE
  const TIMER_CHECK_SECONDS = 3600 // 1 hour
  setInterval(() => {
    const activeTimers = db.prepare('SELECT te.*, t.title as task_title FROM time_entries te JOIN tasks t ON te.task_id = t.id WHERE te.ended_at IS NULL').all()
    for (const timer of activeTimers) {
      const startedAt = new Date(timer.started_at + '-03:00').getTime()
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      if (elapsed > 0 && elapsed % TIMER_CHECK_SECONDS < 60) { // Within 1 minute of each interval
        sendToUser(timer.user_id, 'timer:check', { taskId: timer.task_id, taskTitle: timer.task_title, elapsed })
      }
    }
  }, 30000) // Check every 30 seconds
})
