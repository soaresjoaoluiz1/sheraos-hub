import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/stats', (req, res) => {
  const { days = '30' } = req.query
  const since = new Date(); since.setDate(since.getDate() - parseInt(days))
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ')

  if (req.user.role === 'dono') {
    const totalTasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE is_active = 1').get().c
    const byStage = db.prepare(`
      SELECT ps.name, ps.slug, ps.color, ps.position, COUNT(t.id) as count
      FROM pipeline_stages ps LEFT JOIN tasks t ON t.stage = ps.slug AND t.is_active = 1
      GROUP BY ps.id ORDER BY ps.position
    `).all()
    const byDepartment = db.prepare(`
      SELECT d.name, d.color, COUNT(t.id) as count FROM departments d
      LEFT JOIN tasks t ON t.department_id = d.id AND t.is_active = 1
      WHERE d.is_active = 1 GROUP BY d.id ORDER BY count DESC
    `).all()
    const byCategory = db.prepare(`
      SELECT cat.name, cat.color, COUNT(t.id) as count FROM task_categories cat
      LEFT JOIN tasks t ON t.category_id = cat.id AND t.is_active = 1
      WHERE cat.is_active = 1 GROUP BY cat.id ORDER BY count DESC
    `).all()
    const overdue = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE is_active = 1 AND due_date IS NOT NULL AND due_date != '' AND due_date < date('now', '-3 hours') AND stage NOT IN ('concluido', 'rejeitado')").get().c
    const pendingInternal = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE stage = 'aprovacao_interna' AND is_active = 1").get().c
    const pendingClient = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE stage = 'aguardando_cliente' AND is_active = 1").get().c
    const completedPeriod = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE stage = 'concluido' AND updated_at >= ?").get(sinceStr).c
    const daily = db.prepare("SELECT date(created_at) as date, COUNT(*) as count FROM tasks WHERE created_at >= ? AND is_active = 1 GROUP BY date(created_at) ORDER BY date").all(sinceStr)
    const toPublish = db.prepare("SELECT t.id, t.title, t.due_date, c.name as client_name, t.approval_link FROM tasks t LEFT JOIN clients c ON t.client_id = c.id WHERE t.stage = 'programar_publicacao' AND t.is_active = 1 ORDER BY t.due_date ASC").all()

    res.json({ totalTasks, byStage, byDepartment, byCategory, overdue, pendingInternal, pendingClient, completedPeriod, daily, toPublish })
  } else if (req.user.role === 'funcionario') {
    const myTasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE id IN (SELECT task_id FROM task_assignees WHERE user_id = ?) AND is_active = 1').get(req.user.id).c
    const byStage = db.prepare(`
      SELECT ps.name, ps.slug, ps.color, ps.position, COUNT(t.id) as count
      FROM pipeline_stages ps LEFT JOIN tasks t ON t.stage = ps.slug AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?) AND t.is_active = 1
      GROUP BY ps.id ORDER BY ps.position
    `).all(req.user.id)
    const overdue = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE id IN (SELECT task_id FROM task_assignees WHERE user_id = ?) AND is_active = 1 AND due_date IS NOT NULL AND due_date != '' AND due_date < date('now', '-3 hours') AND stage NOT IN ('concluido', 'rejeitado')").get(req.user.id).c

    res.json({ myTasks, byStage, overdue })
  } else { // cliente
    const totalTasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND is_active = 1').get(req.user.client_id).c
    const pendingApproval = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND stage = 'aguardando_cliente' AND is_active = 1").get(req.user.client_id).c
    const byStage = db.prepare(`
      SELECT ps.name, ps.slug, ps.color, ps.position, COUNT(t.id) as count
      FROM pipeline_stages ps LEFT JOIN tasks t ON t.stage = ps.slug AND t.client_id = ? AND t.is_active = 1
      GROUP BY ps.id ORDER BY ps.position
    `).all(req.user.client_id)

    res.json({ totalTasks, pendingApproval, byStage })
  }
})

// Trends (tasks created/completed per day)
router.get('/trends', (req, res) => {
  const { days = '30' } = req.query
  const since = new Date(); since.setDate(since.getDate() - parseInt(days))
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ')

  const created = db.prepare("SELECT date(created_at) as date, COUNT(*) as count FROM tasks WHERE created_at >= ? AND is_active = 1 GROUP BY date(created_at) ORDER BY date").all(sinceStr)
  const completed = db.prepare("SELECT date(updated_at) as date, COUNT(*) as count FROM tasks WHERE stage = 'concluido' AND updated_at >= ? GROUP BY date(updated_at) ORDER BY date").all(sinceStr)

  res.json({ created, completed })
})

// Team workload
router.get('/workload', (req, res) => {
  const workers = db.prepare(`
    SELECT u.id, u.name,
      (SELECT COUNT(*) FROM tasks WHERE id IN (SELECT task_id FROM task_assignees WHERE user_id = u.id) AND is_active = 1 AND stage NOT IN ('concluido', 'rejeitado')) as open_tasks,
      (SELECT COUNT(*) FROM tasks WHERE id IN (SELECT task_id FROM task_assignees WHERE user_id = u.id) AND is_active = 1 AND due_date IS NOT NULL AND due_date != '' AND due_date < date('now', '-3 hours') AND stage NOT IN ('concluido', 'rejeitado')) as overdue_tasks,
      (SELECT COUNT(*) FROM tasks WHERE id IN (SELECT task_id FROM task_assignees WHERE user_id = u.id) AND is_active = 1 AND stage = 'concluido') as completed_tasks
    FROM users u WHERE u.role IN ('funcionario', 'dono') AND u.is_active = 1
    ORDER BY open_tasks DESC
  `).all()
  // Attach departments
  const deptStmt = db.prepare('SELECT d.name, d.color FROM user_departments ud JOIN departments d ON ud.department_id = d.id WHERE ud.user_id = ?')
  workers.forEach(w => { w.departments = deptStmt.all(w.id); w.status = w.open_tasks > 8 ? 'overloaded' : w.open_tasks > 5 ? 'busy' : 'available' })
  res.json({ workers })
})

export default router
