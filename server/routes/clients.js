import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import db from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', requireRole('dono', 'funcionario'), (req, res) => {
  const clients = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM tasks WHERE client_id = c.id AND is_active = 1) as task_count,
    (SELECT COUNT(*) FROM users WHERE client_id = c.id) as user_count
    FROM clients c WHERE c.is_active = 1 ORDER BY c.name
  `).all()
  res.json({ clients })
})

router.post('/', requireRole('dono', 'gerente'), (req, res) => {
  const { name, contact_name, contact_email, contact_phone, logo_url, drive_folder, password } = req.body
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
  if (!contact_email) return res.status(400).json({ error: 'Email obrigatorio' })
  if (!password) return res.status(400).json({ error: 'Senha obrigatoria' })

  // Check if email already in use
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(contact_email)) return res.status(400).json({ error: 'Email ja cadastrado' })

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (db.prepare('SELECT id FROM clients WHERE slug = ?').get(slug)) return res.status(400).json({ error: 'Cliente ja existe' })

  // Create client with onboard token
  const onboard_token = randomBytes(16).toString('hex')
  const result = db.prepare('INSERT INTO clients (name, slug, contact_name, contact_email, contact_phone, logo_url, drive_folder, onboard_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(name, slug, contact_name || name, contact_email, contact_phone, logo_url, drive_folder || null, onboard_token)
  const clientId = result.lastInsertRowid

  // Auto-create user with role 'cliente'
  db.prepare("INSERT INTO users (client_id, name, email, password, role) VALUES (?, ?, ?, ?, 'cliente')").run(clientId, contact_name || name, contact_email, bcrypt.hashSync(password, 10))

  res.json({ client: db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) })
})

router.get('/:id', requireRole('dono', 'gerente'), (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' })
  const users = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE client_id = ?').all(client.id)
  const tasksByStage = db.prepare('SELECT stage, COUNT(*) as count FROM tasks WHERE client_id = ? AND is_active = 1 GROUP BY stage').all(client.id)
  const credentials = db.prepare('SELECT * FROM client_credentials WHERE client_id = ? ORDER BY platform').all(client.id)
  res.json({ client, users, tasksByStage, credentials })
})

router.put('/:id', requireRole('dono', 'gerente'), (req, res) => {
  const { name, contact_name, contact_email, contact_phone, logo_url, drive_folder, is_active, monthly_fee, payment_day } = req.body
  const sets = []; const params = []
  if (name !== undefined) { sets.push('name = ?'); params.push(name) }
  if (contact_name !== undefined) { sets.push('contact_name = ?'); params.push(contact_name) }
  if (contact_email !== undefined) { sets.push('contact_email = ?'); params.push(contact_email) }
  if (contact_phone !== undefined) { sets.push('contact_phone = ?'); params.push(contact_phone) }
  if (logo_url !== undefined) { sets.push('logo_url = ?'); params.push(logo_url) }
  if (drive_folder !== undefined) { sets.push('drive_folder = ?'); params.push(drive_folder) }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0) }
  if (monthly_fee !== undefined) { sets.push('monthly_fee = ?'); params.push(monthly_fee) }
  if (payment_day !== undefined) { sets.push('payment_day = ?'); params.push(payment_day) }
  if (!sets.length) return res.status(400).json({ error: 'Nada pra atualizar' })
  sets.push("updated_at = datetime('now', '-3 hours')"); params.push(req.params.id)
  db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  res.json({ client: db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) })
})

// Client credentials (platform access)
router.get('/:id/credentials', requireRole('dono', 'gerente'), (req, res) => {
  const credentials = db.prepare('SELECT * FROM client_credentials WHERE client_id = ? ORDER BY platform').all(req.params.id)
  res.json({ credentials })
})

router.post('/:id/credentials', requireRole('dono', 'gerente'), (req, res) => {
  const { platform, login, password, observation } = req.body
  if (!platform || !login || !password) return res.status(400).json({ error: 'platform, login e password obrigatorios' })
  const result = db.prepare('INSERT INTO client_credentials (client_id, platform, login, password, observation) VALUES (?, ?, ?, ?, ?)').run(req.params.id, platform, login, password, observation || null)
  res.json({ credential: db.prepare('SELECT * FROM client_credentials WHERE id = ?').get(result.lastInsertRowid) })
})

router.put('/:id/credentials/:credId', requireRole('dono', 'gerente'), (req, res) => {
  const { platform, login, password, observation } = req.body
  const sets = []; const params = []
  if (platform !== undefined) { sets.push('platform = ?'); params.push(platform) }
  if (login !== undefined) { sets.push('login = ?'); params.push(login) }
  if (password !== undefined) { sets.push('password = ?'); params.push(password) }
  if (observation !== undefined) { sets.push('observation = ?'); params.push(observation) }
  if (!sets.length) return res.status(400).json({ error: 'Nada pra atualizar' })
  sets.push("updated_at = datetime('now', '-3 hours')"); params.push(req.params.credId)
  db.prepare(`UPDATE client_credentials SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  res.json({ credential: db.prepare('SELECT * FROM client_credentials WHERE id = ?').get(req.params.credId) })
})

router.delete('/:id/credentials/:credId', requireRole('dono', 'gerente'), (req, res) => {
  db.prepare('DELETE FROM client_credentials WHERE id = ?').run(req.params.credId)
  res.json({ ok: true })
})

// Onboard - get all responses (authenticated)
router.get('/:id/onboard', requireRole('dono', 'gerente'), (req, res) => {
  const entries = db.prepare('SELECT * FROM client_onboard WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id)
  res.json({ entries: entries.map(e => ({ ...e, data: JSON.parse(e.data) })) })
})

export default router
