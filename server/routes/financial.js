import { Router } from 'express'
import db from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// All financial routes are dono-only
router.use(requireRole('dono'))

// GET /api/financial/overview?month=2026-04
router.get('/overview', (req, res) => {
  const month = req.query.month
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month param required (YYYY-MM)' })

  const clients = db.prepare('SELECT id, name, monthly_fee, payment_day FROM clients WHERE is_active = 1 ORDER BY name').all()

  // Get all payments for this month
  const payments = db.prepare('SELECT * FROM payments WHERE reference_month = ?').all(month)
  const paymentMap = {}
  payments.forEach(p => { paymentMap[p.client_id] = p })

  // Calculate current date in SP timezone
  const now = new Date()
  const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const currentYear = spNow.getFullYear()
  const currentMonth = spNow.getMonth() + 1
  const currentDay = spNow.getDate()

  const [reqYear, reqMonth] = month.split('-').map(Number)

  let totalExpected = 0
  let totalReceived = 0
  let totalPending = 0
  let totalLate = 0
  let lateCount = 0

  const result = clients.map(c => {
    const fee = c.monthly_fee || 0
    totalExpected += fee

    const payment = paymentMap[c.id]
    if (payment) {
      totalReceived += payment.amount
      return {
        id: c.id, name: c.name, monthly_fee: fee, payment_day: c.payment_day || 10,
        status: 'paid', paid_at: payment.paid_at, amount_paid: payment.amount,
        days_late: 0, penalty: 0, total_due: fee
      }
    }

    // No payment - check if late
    const payDay = c.payment_day || 10
    // Payment is late if: requested month is in the past, OR it's current month and payment_day has passed
    const isCurrentMonth = reqYear === currentYear && reqMonth === currentMonth
    const isPastMonth = reqYear < currentYear || (reqYear === currentYear && reqMonth < currentMonth)
    const isLate = isPastMonth || (isCurrentMonth && currentDay > payDay)

    if (isLate && fee > 0) {
      // Calculate days late — 2% fixed penalty + 1% per 30 days after
      const dueDate = new Date(reqYear, reqMonth - 1, payDay)
      const diffMs = spNow.getTime() - dueDate.getTime()
      const daysLate = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
      const monthsLate = Math.floor(daysLate / 30)
      const penalty = Math.round(fee * (0.02 + 0.01 * monthsLate) * 100) / 100
      const totalDue = Math.round((fee + penalty) * 100) / 100
      totalLate += totalDue
      lateCount++
      return {
        id: c.id, name: c.name, monthly_fee: fee, payment_day: payDay,
        status: 'late', paid_at: null, amount_paid: 0,
        days_late: daysLate, penalty, total_due: totalDue
      }
    }

    // Pending (not yet due)
    totalPending += fee
    return {
      id: c.id, name: c.name, monthly_fee: fee, payment_day: payDay,
      status: 'pending', paid_at: null, amount_paid: 0,
      days_late: 0, penalty: 0, total_due: fee
    }
  })

  res.json({
    clients: result,
    summary: {
      expected: totalExpected,
      received: totalReceived,
      pending: totalPending,
      late: totalLate,
      lateCount
    }
  })
})

// POST /api/financial/payments
router.post('/payments', (req, res) => {
  const { client_id, amount, reference_month, paid_at } = req.body
  if (!client_id || amount === undefined || !reference_month || !paid_at) {
    return res.status(400).json({ error: 'client_id, amount, reference_month e paid_at obrigatorios' })
  }
  if (!/^\d{4}-\d{2}$/.test(reference_month)) {
    return res.status(400).json({ error: 'reference_month deve ser YYYY-MM' })
  }

  // Check for duplicate
  const existing = db.prepare('SELECT id FROM payments WHERE client_id = ? AND reference_month = ?').get(client_id, reference_month)
  if (existing) {
    // Update existing payment
    db.prepare("UPDATE payments SET amount = ?, paid_at = ?, created_at = datetime('now', '-3 hours') WHERE id = ?").run(amount, paid_at, existing.id)
    return res.json({ payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(existing.id) })
  }

  const result = db.prepare('INSERT INTO payments (client_id, amount, reference_month, paid_at) VALUES (?, ?, ?, ?)').run(client_id, amount, reference_month, paid_at)
  res.json({ payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid) })
})

// GET /api/financial/dashboard?year=2026
router.get('/dashboard', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear()

  const months = []
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`
    const revenue = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE reference_month = ?').get(monthStr)
    const extraRev = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM extra_revenue WHERE reference_month = ?').get(monthStr)
    const totalRev = revenue.total + extraRev.total
    const expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE reference_month = ?').get(monthStr)
    months.push({ month: monthStr, revenue: totalRev, expenses: expenses.total, profit: totalRev - expenses.total })
  }

  res.json({ months })
})

// ==================== EXPENSES ====================

// GET expense categories
router.get('/expense-categories', (req, res) => {
  res.json({ categories: db.prepare('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name').all() })
})

// POST expense category
router.post('/expense-categories', (req, res) => {
  const { name, type, color } = req.body
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })
  const result = db.prepare('INSERT INTO expense_categories (name, type, color) VALUES (?, ?, ?)').run(name, type || 'variable', color || '#FF6B6B')
  res.json({ category: db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(result.lastInsertRowid) })
})

// GET expenses for a month
router.get('/expenses', (req, res) => {
  const month = req.query.month
  if (!month) return res.status(400).json({ error: 'month required' })
  const expenses = db.prepare(`
    SELECT e.*, ec.name as category_name, ec.color as category_color, ec.type as category_type
    FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id
    WHERE e.reference_month = ? ORDER BY ec.name, e.description
  `).all(month)

  const totalFixed = expenses.filter(e => e.category_type === 'fixed').reduce((s, e) => s + e.amount, 0)
  const totalVariable = expenses.filter(e => e.category_type === 'variable').reduce((s, e) => s + e.amount, 0)
  const total = totalFixed + totalVariable

  // Group by category
  const byCategory = {}
  expenses.forEach(e => {
    if (!byCategory[e.category_name]) byCategory[e.category_name] = { name: e.category_name, color: e.category_color, type: e.category_type, total: 0, items: [] }
    byCategory[e.category_name].total += e.amount
    byCategory[e.category_name].items.push(e)
  })

  res.json({ expenses, byCategory: Object.values(byCategory), totalFixed, totalVariable, total })
})

// POST expense
router.post('/expenses', (req, res) => {
  const { category_id, description, amount, reference_month, paid_at, is_recurring } = req.body
  if (!category_id || !amount || !reference_month) return res.status(400).json({ error: 'category_id, amount, reference_month obrigatorios' })
  const result = db.prepare('INSERT INTO expenses (category_id, description, amount, reference_month, paid_at, is_recurring) VALUES (?, ?, ?, ?, ?, ?)').run(category_id, description || null, amount, reference_month, paid_at || null, is_recurring ? 1 : 0)
  res.json({ expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid) })
})

// PUT expense
router.put('/expenses/:id', (req, res) => {
  const { category_id, description, amount, paid_at } = req.body
  const sets = []; const params = []
  if (category_id !== undefined) { sets.push('category_id = ?'); params.push(category_id) }
  if (description !== undefined) { sets.push('description = ?'); params.push(description) }
  if (amount !== undefined) { sets.push('amount = ?'); params.push(amount) }
  if (paid_at !== undefined) { sets.push('paid_at = ?'); params.push(paid_at) }
  if (!sets.length) return res.status(400).json({ error: 'Nada pra atualizar' })
  params.push(req.params.id)
  db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  res.json({ expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) })
})

// DELETE expense
router.delete('/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// Copy recurring expenses to next month
router.post('/expenses/copy-recurring', (req, res) => {
  const { from_month, to_month } = req.body
  if (!from_month || !to_month) return res.status(400).json({ error: 'from_month e to_month obrigatorios' })
  const recurring = db.prepare('SELECT * FROM expenses WHERE reference_month = ? AND is_recurring = 1').all(from_month)
  const stmt = db.prepare('INSERT INTO expenses (category_id, description, amount, reference_month, is_recurring, paid_at) VALUES (?, ?, ?, ?, 1, ?)')
  let count = 0
  recurring.forEach(e => {
    const exists = db.prepare('SELECT id FROM expenses WHERE category_id = ? AND description = ? AND reference_month = ?').get(e.category_id, e.description, to_month)
    if (!exists) { stmt.run(e.category_id, e.description, e.amount, to_month, e.paid_at || null); count++ }
  })
  res.json({ copied: count })
})

// ==================== INSTALLMENTS ====================

router.get('/installments', (req, res) => {
  const items = db.prepare('SELECT i.*, ec.name as category_name, ec.color as category_color FROM installments i LEFT JOIN expense_categories ec ON i.category_id = ec.id ORDER BY i.start_month DESC').all()
  res.json({ installments: items })
})

router.post('/installments', (req, res) => {
  const { name, total_amount, installment_count, start_month, category_id } = req.body
  if (!name || !total_amount || !installment_count || !start_month) return res.status(400).json({ error: 'Campos obrigatorios' })
  const installment_amount = Math.round((total_amount / installment_count) * 100) / 100
  const result = db.prepare('INSERT INTO installments (name, total_amount, installment_count, installment_amount, start_month, category_id) VALUES (?, ?, ?, ?, ?, ?)').run(name, total_amount, installment_count, installment_amount, start_month, category_id || null)

  // Auto-create expenses for each month
  const catId = category_id || db.prepare("SELECT id FROM expense_categories WHERE name LIKE '%Emprestimo%' OR name LIKE '%Parcela%' LIMIT 1").get()?.id
  if (catId) {
    const [y, m] = start_month.split('-').map(Number)
    const stmt = db.prepare('INSERT INTO expenses (category_id, description, amount, reference_month, is_recurring, paid_at) VALUES (?, ?, ?, ?, 0, ?)')
    for (let i = 0; i < installment_count; i++) {
      const date = new Date(y, m - 1 + i, 1)
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      stmt.run(catId, `${name} (${i + 1}/${installment_count})`, installment_amount, monthStr, null)
    }
  }

  res.json({ installment: db.prepare('SELECT * FROM installments WHERE id = ?').get(result.lastInsertRowid) })
})

router.delete('/installments/:id', (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(req.params.id)
  if (inst) {
    // Remove associated expenses
    db.prepare("DELETE FROM expenses WHERE description LIKE ? AND amount = ?").run(`${inst.name} (%`, inst.installment_amount)
  }
  db.prepare('DELETE FROM installments WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ==================== EXTRA REVENUE ====================

router.get('/extra-revenue', (req, res) => {
  const month = req.query.month
  const where = month ? 'WHERE er.reference_month = ?' : ''
  const params = month ? [month] : []
  const items = db.prepare(`SELECT er.*, c.name as client_name FROM extra_revenue er LEFT JOIN clients c ON er.client_id = c.id ${where} ORDER BY er.created_at DESC`).all(...params)
  const total = items.reduce((s, i) => s + i.amount, 0)
  res.json({ items, total })
})

router.post('/extra-revenue', (req, res) => {
  const { client_id, description, amount, reference_month, paid_at } = req.body
  if (!description || !amount || !reference_month) return res.status(400).json({ error: 'description, amount, reference_month obrigatorios' })
  const result = db.prepare('INSERT INTO extra_revenue (client_id, description, amount, reference_month, paid_at) VALUES (?, ?, ?, ?, ?)').run(client_id || null, description, amount, reference_month, paid_at || null)
  res.json({ item: db.prepare('SELECT * FROM extra_revenue WHERE id = ?').get(result.lastInsertRowid) })
})

router.delete('/extra-revenue/:id', (req, res) => {
  db.prepare('DELETE FROM extra_revenue WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// DRE for a month
router.get('/dre', (req, res) => {
  const month = req.query.month
  if (!month) return res.status(400).json({ error: 'month required' })

  const mensalidades = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE reference_month = ?').get(month).total
  const extraRevenue = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM extra_revenue WHERE reference_month = ?').get(month).total
  const revenue = mensalidades + extraRevenue
  const expenseRows = db.prepare(`
    SELECT ec.name, ec.type, ec.color, COALESCE(SUM(e.amount), 0) as total
    FROM expense_categories ec LEFT JOIN expenses e ON e.category_id = ec.id AND e.reference_month = ?
    WHERE ec.is_active = 1 GROUP BY ec.id ORDER BY ec.name
  `).all(month)

  const totalFixed = expenseRows.filter(r => r.type === 'fixed').reduce((s, r) => s + r.total, 0)
  const totalVariable = expenseRows.filter(r => r.type === 'variable').reduce((s, r) => s + r.total, 0)
  const totalExpenses = totalFixed + totalVariable
  const profit = revenue - totalExpenses
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  res.json({ month, revenue, mensalidades, extraRevenue, totalFixed, totalVariable, totalExpenses, profit, margin: Math.round(margin * 10) / 10, categories: expenseRows.filter(r => r.total > 0) })
})

export default router
