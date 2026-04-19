import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDashboardStats, fetchDashboardTrends, fetchTeamWorkload, createTaskRequest, formatNumber } from '../lib/api'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Line } from 'recharts'
import { ListTodo, Clock, CheckCircle, AlertTriangle, Send, Calendar, Users, TrendingUp, Plus } from 'lucide-react'

const COLORS = ['#6B6580', '#5DADE2', '#9B59B6', '#FFAA83', '#FFB300', '#34C759', '#FF6B8A', '#34C759', '#FF6B6B']
const STATUS_COLORS: Record<string, string> = { available: '#34C759', busy: '#FBBC04', overloaded: '#FF6B6B' }

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return <div style={{ background: '#110920', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
    <p style={{ color: '#A8A3B8', marginBottom: 6 }}>{label}</p>
    {payload.map((p: any) => <p key={p.name} style={{ color: p.color || '#fff', fontWeight: 600 }}>{p.name}: {p.value}</p>)}
  </div>
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [trends, setTrends] = useState<any>(null)
  const [workload, setWorkload] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const isDono = user?.role === 'dono'
  const isCliente = user?.role === 'cliente'
  const [showRequest, setShowRequest] = useState(false)
  const [newRequest, setNewRequest] = useState({ title: '', description: '', drive_link_raw: '' })

  useEffect(() => {
    setLoading(true)
    const promises: Promise<any>[] = [fetchDashboardStats(days)]
    if (isDono) { promises.push(fetchDashboardTrends(days)); promises.push(fetchTeamWorkload()) }
    Promise.all(promises).then(([s, t, w]) => { setStats(s); setTrends(t); setWorkload(w) }).catch(() => {}).finally(() => setLoading(false))
  }, [days, isDono])

  if (loading) return <div className="loading-container"><div className="spinner" /></div>
  if (!stats) return <div className="empty-state"><h3>Sem dados</h3></div>

  // Trend chart data
  const trendData: any[] = []
  if (trends) {
    const dateMap = new Map<string, any>()
    trends.created?.forEach((d: any) => { if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date.slice(5) }); dateMap.get(d.date).Criadas = d.count })
    trends.completed?.forEach((d: any) => { if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date.slice(5) }); dateMap.get(d.date).Concluidas = d.count })
    dateMap.forEach(v => trendData.push(v))
    trendData.sort((a, b) => a.date.localeCompare(b.date))
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        {isCliente ? (
          <button onClick={() => setShowRequest(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'linear-gradient(135deg, #FFB300, #FFAA83)', color: '#1a1625', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(255,179,0,0.2)', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: 'inherit' }}>
            <Plus size={16} /> Solicitar Nova Tarefa
          </button>
        ) : (
          <div className="date-selector">
            {[7, 14, 30, 90].map(d => <button key={d} className={`date-btn ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>{d}d</button>)}
          </div>
        )}
      </div>

      {/* KPIs */}
      <section className="dash-section">
        <div className="metrics-grid">
          {isDono && <>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
              <div className="metric-header"><span className="metric-label">Total Tarefas</span><div className="metric-icon" style={{ background: '#FFB30020', color: '#FFB300' }}><ListTodo size={16} /></div></div>
              <div className="metric-value">{formatNumber(stats.totalTasks || 0)}</div>
            </div>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks?stage=overdue')}>
              <div className="metric-header"><span className="metric-label">Atrasadas</span><div className="metric-icon" style={{ background: stats.overdue > 0 ? '#FF6B6B20' : '#34C75920', color: stats.overdue > 0 ? '#FF6B6B' : '#34C759' }}><AlertTriangle size={16} /></div></div>
              <div className="metric-value">{stats.overdue || 0}</div>{stats.overdue > 0 && <div className="metric-sub" style={{ color: '#FF6B6B' }}>Atencao!</div>}
            </div>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/approvals')}>
              <div className="metric-header"><span className="metric-label">Aprov. Interna</span><div className="metric-icon" style={{ background: '#FFAA8320', color: '#FFAA83' }}><CheckCircle size={16} /></div></div>
              <div className="metric-value">{stats.pendingInternal || 0}</div>
            </div>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/approvals')}>
              <div className="metric-header"><span className="metric-label">Aguard. Cliente</span><div className="metric-icon" style={{ background: '#FFB30020', color: '#FFB300' }}><Send size={16} /></div></div>
              <div className="metric-value">{stats.pendingClient || 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-header"><span className="metric-label">Concluidas ({days}d)</span><div className="metric-icon" style={{ background: '#34C75920', color: '#34C759' }}><CheckCircle size={16} /></div></div>
              <div className="metric-value">{stats.completedPeriod || 0}</div>
            </div>
          </>}
          {user?.role === 'funcionario' && <>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
              <div className="metric-header"><span className="metric-label">Minhas Tarefas</span><div className="metric-icon" style={{ background: '#FFB30020', color: '#FFB300' }}><ListTodo size={16} /></div></div>
              <div className="metric-value">{stats.myTasks || 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-header"><span className="metric-label">Atrasadas</span><div className="metric-icon" style={{ background: '#FF6B6B20', color: '#FF6B6B' }}><AlertTriangle size={16} /></div></div>
              <div className="metric-value">{stats.overdue || 0}</div>
            </div>
          </>}
          {user?.role === 'cliente' && <>
            <div className="metric-card"><div className="metric-header"><span className="metric-label">Total Tarefas</span><div className="metric-icon" style={{ background: '#FFB30020', color: '#FFB300' }}><ListTodo size={16} /></div></div><div className="metric-value">{stats.totalTasks || 0}</div></div>
            <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/approvals')}>
              <div className="metric-header"><span className="metric-label">Aguardando Aprovacao</span><div className="metric-icon" style={{ background: '#FFAA8320', color: '#FFAA83' }}><CheckCircle size={16} /></div></div>
              <div className="metric-value">{stats.pendingApproval || 0}</div>
            </div>
          </>}
        </div>
      </section>

      {/* Trends chart + Department/Category */}
      {isDono && (
        <section className="dash-section">
          <div className="charts-grid">
            {trendData.length > 2 && (
              <div className="chart-card">
                <h3>Tarefas Criadas vs Concluidas</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={trendData}>
                    <defs>
                      <linearGradient id="criadaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB300" stopOpacity={0.2} /><stop offset="100%" stopColor="#FFB300" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fill: '#A8A3B8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#A8A3B8', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey="Criadas" stroke="#FFB300" fill="url(#criadaGrad)" strokeWidth={2} />
                    <Line type="monotone" dataKey="Concluidas" stroke="#34C759" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {stats.byDepartment?.some((d: any) => d.count > 0) && (
              <div className="chart-card">
                <h3>Tarefas por Departamento</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.byDepartment.filter((d: any) => d.count > 0)} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: '#A8A3B8', fontSize: 10 }} /><YAxis type="category" dataKey="name" tick={{ fill: '#A8A3B8', fontSize: 11 }} width={110} />
                    <Tooltip content={<Tip />} /><Bar dataKey="count" name="Tarefas" radius={[0, 6, 6, 0]}>
                      {stats.byDepartment.map((d: any, i: number) => <Cell key={i} fill={d.color || COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Team workload */}
      {isDono && workload?.workers?.length > 0 && (
        <section className="dash-section">
          <div className="section-title"><Users size={12} /> Carga da Equipe</div>
          <div className="table-card">
            <table>
              <thead><tr><th>Funcionario</th><th>Departamentos</th><th className="right">Abertas</th><th className="right">Atrasadas</th><th className="right">Concluidas</th><th>Status</th></tr></thead>
              <tbody>
                {workload.workers.map((w: any) => (
                  <tr key={w.id}>
                    <td className="name">{w.name}</td>
                    <td>{w.departments?.map((d: any) => <span key={d.name} className="tag-pill" style={{ background: `${d.color}20`, color: d.color, marginRight: 4 }}>{d.name}</span>)}</td>
                    <td className="right" style={{ fontWeight: 700, color: w.open_tasks > 8 ? '#FF6B6B' : w.open_tasks > 5 ? '#FBBC04' : '#fff' }}>{w.open_tasks}</td>
                    <td className="right" style={{ color: w.overdue_tasks > 0 ? '#FF6B6B' : '#6B6580' }}>{w.overdue_tasks}</td>
                    <td className="right" style={{ color: w.completed_tasks > 0 ? '#22C55E' : '#6B6580' }}>{w.completed_tasks || 0}</td>
                    <td><span className="stage-badge" style={{ background: `${STATUS_COLORS[w.status]}20`, color: STATUS_COLORS[w.status] }}>
                      {w.status === 'available' ? 'Disponivel' : w.status === 'busy' ? 'Ocupado' : 'Sobrecarregado'}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tasks to publish */}
      {isDono && stats.toPublish?.length > 0 && (
        <section className="dash-section">
          <div className="section-title"><Send size={12} /> A Publicar ({stats.toPublish.length})</div>
          <div className="table-card">
            <table>
              <thead><tr><th>Tarefa</th><th>Cliente</th><th className="right">Prazo</th><th className="right">Link</th></tr></thead>
              <tbody>
                {stats.toPublish.map((t: any) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/${t.id}`)}>
                    <td className="name">{t.title}</td>
                    <td>{t.client_name}</td>
                    <td className="right">{t.due_date ? t.due_date.slice(0, 10) : '-'}</td>
                    <td className="right">{t.approval_link ? <a href={t.approval_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#5DADE2', fontSize: 12 }}>Ver arquivo</a> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showRequest && (
        <div className="modal-overlay" onClick={() => setShowRequest(false)}><div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
          <h2><Plus size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: '#FFB300' }} />Solicitar Nova Tarefa</h2>
          <p style={{ fontSize: 12, color: '#9B96B0', marginTop: -6, marginBottom: 16 }}>Sua solicitacao sera enviada para aprovacao do gerente/CEO. Apos aprovada, a equipe entrara em producao.</p>
          <div className="form-group"><label>Titulo *</label><input className="input" value={newRequest.title} onChange={e => setNewRequest(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Criar post novo sobre lancamento" /></div>
          <div className="form-group"><label>Descricao</label><textarea className="input" rows={5} value={newRequest.description} onChange={e => setNewRequest(p => ({ ...p, description: e.target.value }))} placeholder="Seja especifico e detalhado. O que, quando, como..." /></div>
          <div className="form-group"><label>Link dos arquivos (opcional)</label><input className="input" value={newRequest.drive_link_raw} onChange={e => setNewRequest(p => ({ ...p, drive_link_raw: e.target.value }))} placeholder="https://drive.google.com/... ou outro link" /></div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowRequest(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!newRequest.title} onClick={async () => { await createTaskRequest({ title: newRequest.title, description: newRequest.description, drive_link_raw: newRequest.drive_link_raw || undefined }); setShowRequest(false); setNewRequest({ title: '', description: '', drive_link_raw: '' }); alert('Solicitacao enviada! A equipe sera notificada.') }}>
              Enviar Solicitacao
            </button>
          </div>
        </div></div>
      )}
    </div>
  )
}
