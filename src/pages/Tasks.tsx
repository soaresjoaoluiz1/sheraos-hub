import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchTasks, fetchClients, fetchDepartments, fetchUsers, fetchCategories, fetchStages,
  createTask, createTaskRequest, bulkMoveTasks, bulkAssignTasks, formatNumber,
  type Task, type Client, type Department, type User as UserT, type TaskCategory, type PipelineStage,
} from '../lib/api'
import { Plus, Clock, Building2, User, ExternalLink, Download, AlertTriangle, CheckSquare, Square, Users, ArrowRight, ArrowUpDown, Filter } from 'lucide-react'

function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d` }
function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` }
function isOverdue(d: string | null) { return d ? d.slice(0, 10) < todayStr() : false }
function isDueSoon(d: string | null) {
  if (!d || isOverdue(d)) return false
  const ms = new Date(d + 'T23:59:59').getTime() - Date.now()
  return ms >= 0 && ms < 2 * 86400000
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'rgba(255,107,107,0.15)', text: '#FF6B6B' },
  high: { bg: 'rgba(255,170,131,0.15)', text: '#FFAA83' },
  normal: { bg: 'rgba(255,255,255,0.05)', text: '#A8A3B8' },
  low: { bg: 'rgba(255,255,255,0.03)', text: '#6B6580' },
}

export default function Tasks() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDono = user?.role === 'dono'
  const isFunc = user?.role === 'funcionario'
  const isCliente = user?.role === 'cliente'
  const [tasks, setTasks] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers] = useState<UserT[]>([])
  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  // Filters
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterStages, setFilterStages] = useState<Set<string>>(new Set())
  const [showStageFilter, setShowStageFilter] = useState(false)
  const [filterDept, setFilterDept] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssigned, setFilterAssigned] = useState(isFunc ? String(user?.id || '') : '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Sort
  const [sortField, setSortField] = useState('updated_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // Modal
  const [showNew, setShowNew] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const [newRequest, setNewRequest] = useState({ title: '', description: '', drive_link_raw: '' })
  const [newTask, setNewTask] = useState({ title: '', description: '', client_id: '', category_id: '', department_id: '', assigned_to: [] as string[], due_date: '', priority: 'normal', drive_link: '' })
  // Bulk
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showBulkStage, setShowBulkStage] = useState(false)
  const [showBulkAssign, setShowBulkAssign] = useState(false)

  useEffect(() => {
    if (isDono || isFunc) { fetchClients().then(setClients); fetchDepartments().then(setDepartments); fetchUsers().then(setAllUsers) }
    fetchCategories().then(setCategories); fetchStages().then(setStages)
  }, [isDono])

  const loadTasks = () => {
    setLoading(true)
    const filters: any = { search, page, limit: 30 }
    if (filterClient) filters.client_id = +filterClient
    if (filterStages.size === 1) filters.stage = [...filterStages][0]
    if (filterDept) filters.department_id = +filterDept
    if (filterPriority) filters.priority = filterPriority
    if (filterAssigned) filters.assigned_to = +filterAssigned
    if (dateFrom) filters.date_from = dateFrom
    if (dateTo) filters.date_to = dateTo
    fetchTasks(filters).then(d => {
      // Client-side sort
      const sorted = [...d.tasks].sort((a, b) => {
        let va: any = (a as any)[sortField], vb: any = (b as any)[sortField]
        if (sortField === 'due_date') { va = va || '9999'; vb = vb || '9999' }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      setTasks(sorted); setTotal(d.total)
    }).finally(() => setLoading(false))
  }

  useEffect(loadTasks, [search, filterClient, filterStage, filterStages.size, filterDept, filterPriority, filterAssigned, dateFrom, dateTo, page, sortField, sortDir])

  // Client-side multi-stage filter
  const filteredTasks = filterStages.size > 1 ? tasks.filter(t => filterStages.has(t.stage)) : tasks

  const handleCreate = async () => {
    if (!newTask.title || !newTask.client_id) return
    await createTask({ ...newTask, client_id: +newTask.client_id, category_id: newTask.category_id ? +newTask.category_id : undefined, department_id: newTask.department_id ? +newTask.department_id : undefined, assigned_to: newTask.assigned_to.map(Number) } as any)
    setShowNew(false); setNewTask({ title: '', description: '', client_id: '', category_id: '', department_id: '', assigned_to: [] as string[], due_date: '', priority: 'normal', drive_link: '' }); loadTasks()
  }

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const toggleSelect = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => { selected.size === tasks.length ? setSelected(new Set()) : setSelected(new Set(tasks.map(t => t.id))) }

  const handleBulkStage = async (stage: string) => { await bulkMoveTasks([...selected], stage); setSelected(new Set()); setShowBulkStage(false); loadTasks() }
  const handleBulkAssign = async (userId: number | null) => { await bulkAssignTasks([...selected], userId); setSelected(new Set()); setShowBulkAssign(false); loadTasks() }

  const handleExport = async () => {
    const token = localStorage.getItem('dros_hub_token')
    const params = new URLSearchParams()
    if (filterClient) params.set('client_id', filterClient)
    if (filterStage) params.set('stage', filterStage)
    if (filterDept) params.set('department_id', filterDept)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const res = await fetch(`/api/tasks/export?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tarefas-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th className={field === 'due_date' || field === 'created_at' ? 'right' : ''} style={{ cursor: 'pointer' }} onClick={() => toggleSort(field)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{children} {sortField === field && <ArrowUpDown size={10} style={{ color: '#FFB300' }} />}</span>
    </th>
  )

  return (
    <div>
      <div className="page-header">
        <h1>Tarefas <span style={{ fontSize: 14, color: '#A8A3B8', fontWeight: 400 }}>({formatNumber(total)})</span></h1>
        <div className="page-header-actions">
          {isDono && <button className="btn btn-secondary btn-sm" onClick={handleExport}><Download size={14} /> Exportar</button>}
          {(isDono || isFunc) && <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={14} /> Nova Tarefa</button>}
          {isCliente && <button className="btn btn-primary btn-sm" onClick={() => setShowRequest(true)}><Plus size={14} /> Nova Solicitacao</button>}
        </div>
      </div>

      {/* Quick filters */}
      {isFunc && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button className={`btn btn-sm ${filterAssigned === String(user?.id) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setFilterAssigned(filterAssigned === String(user?.id) ? '' : String(user?.id)); setPage(1) }}>
            <Filter size={12} /> Minhas Tarefas
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <input className="input search-input" placeholder="Buscar..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <div style={{ position: 'relative' }}>
          <button className="select" onClick={() => setShowStageFilter(p => !p)} style={{ cursor: 'pointer', minWidth: 150, textAlign: 'left' }}>
            {filterStages.size === 0 ? 'Todas etapas' : filterStages.size === 1 ? stages.find(s => filterStages.has(s.slug))?.name : `${filterStages.size} etapas`} ▾
          </button>
          {showStageFilter && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 6, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <button onClick={() => { setFilterStages(new Set()); setFilterStage(''); setPage(1) }} style={{ display: 'block', width: '100%', padding: '6px 10px', background: filterStages.size === 0 ? 'rgba(255,179,0,0.12)' : 'transparent', border: 'none', borderRadius: 4, color: filterStages.size === 0 ? '#FFB300' : '#A8A3B8', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>Todas etapas</button>
              {stages.map(s => {
                const on = filterStages.has(s.slug)
                return <button key={s.slug} onClick={() => {
                  setFilterStages(prev => {
                    const next = new Set(prev)
                    if (on) next.delete(s.slug); else next.add(s.slug)
                    setFilterStage(next.size === 1 ? [...next][0] : '')
                    setPage(1)
                    return next
                  })
                }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: on ? 'rgba(255,179,0,0.08)' : 'transparent', border: 'none', borderRadius: 4, color: on ? '#FFB300' : '#A8A3B8', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${on ? s.color : 'rgba(255,255,255,0.12)'}`, background: on ? s.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: on ? '#0A0118' : 'transparent', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />{s.name}
                </button>
              })}
            </div>
          )}
        </div>
        {isDono && <select className="select" value={filterClient} onChange={e => { setFilterClient(e.target.value); setPage(1) }}><option value="">Todos clientes</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <select className="select" value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1) }}><option value="">Prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select>
        {isDono && <select className="select" value={filterAssigned} onChange={e => { setFilterAssigned(e.target.value); setPage(1) }}><option value="">Todos</option>{allUsers.filter(u => u.role !== 'cliente').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      </div>
      <div className="filter-bar" style={{ marginTop: -6 }}>
        <input className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} style={{ width: 150 }} />
        <span style={{ color: '#6B6580', fontSize: 12 }}>ate</span>
        <input className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} style={{ width: 150 }} />
        {(search || filterStage || filterStages.size > 0 || filterClient || filterPriority || filterAssigned || dateFrom || dateTo) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterStage(''); setFilterStages(new Set()); setFilterClient(''); setFilterPriority(''); setFilterAssigned(isFunc ? String(user?.id) : ''); setDateFrom(''); setDateTo(''); setPage(1) }}>Limpar</button>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && isDono && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'rgba(255,179,0,0.08)', borderRadius: 8, marginBottom: 12, border: '1px solid rgba(255,179,0,0.15)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFB300' }}>{selected.size} selecionadas</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkStage(true)}><ArrowRight size={12} /> Mover</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkAssign(true)}><Users size={12} /> Atribuir</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      {/* Table */}
      {loading ? <div className="loading-container"><div className="spinner" /></div> : (
        <div className="table-card">
          <table>
            <thead><tr>
              {isDono && <th style={{ width: 32 }}><button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6580' }} onClick={toggleSelectAll}>{selected.size === tasks.length && tasks.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}</button></th>}
              <SortHeader field="title">Titulo</SortHeader>
              {!isCliente && <th>Cliente</th>}
              <SortHeader field="stage">Etapa</SortHeader>
              {!isCliente && <th>Responsavel</th>}
              {!isCliente && <SortHeader field="priority">Prioridade</SortHeader>}
              {isCliente ? <th className="right">Aguardando</th> : <SortHeader field="due_date">Prazo</SortHeader>}
              <SortHeader field="created_at">Criado</SortHeader>
            </tr></thead>
            <tbody>
              {filteredTasks.map(t => {
                const overdue = isOverdue(t.due_date) && t.stage !== 'concluido' && t.stage !== 'rejeitado'
                const soon = isDueSoon(t.due_date) && !overdue
                const pc = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal
                // For cliente: compute days waiting since moved to aguardando_cliente
                const waitingSince = (t as any).waiting_client_since
                const waitingDays = (isCliente && t.stage === 'aguardando_cliente' && waitingSince)
                  ? Math.max(0, Math.floor((Date.now() - new Date(waitingSince + '-03:00').getTime()) / 86400000))
                  : null
                return (
                  <tr key={t.id} style={{ cursor: 'pointer', background: overdue ? 'rgba(255,107,107,0.03)' : undefined }}>
                    {isDono && <td onClick={e => { e.stopPropagation(); toggleSelect(t.id) }}><span style={{ color: selected.has(t.id) ? '#FFB300' : '#6B6580', cursor: 'pointer' }}>{selected.has(t.id) ? <CheckSquare size={14} /> : <Square size={14} />}</span></td>}
                    <td className="name" onClick={() => navigate(`/tasks/${t.id}`)}>
                      {t.title} {t.drive_link && <ExternalLink size={10} style={{ color: '#5DADE2', marginLeft: 4 }} />}
                      {overdue && <AlertTriangle size={10} style={{ color: '#FF6B6B', marginLeft: 4 }} />}
                    </td>
                    {!isCliente && <td onClick={() => navigate(`/tasks/${t.id}`)} style={{ fontSize: 12 }}><Building2 size={10} /> {t.client_name}</td>}
                    <td onClick={() => navigate(`/tasks/${t.id}`)}><span className="stage-badge" style={{ background: `${t.stage_color}20`, color: t.stage_color }}>{t.stage_name}</span></td>
                    {!isCliente && <td onClick={() => navigate(`/tasks/${t.id}`)}>{t.assigned_name || <span style={{ color: '#6B6580' }}>-</span>}</td>}
                    {!isCliente && <td onClick={() => navigate(`/tasks/${t.id}`)}><span className="stage-badge" style={{ background: pc.bg, color: pc.text }}>{t.priority === 'urgent' ? '🔴 ' : t.priority === 'high' ? '🟠 ' : ''}{t.priority}</span></td>}
                    {isCliente ? (
                      <td className="right" onClick={() => navigate(`/tasks/${t.id}`)} style={{ color: waitingDays === null ? '#6B6580' : waitingDays > 3 ? '#FF6B6B' : waitingDays > 1 ? '#FBBC04' : '#34C759', fontWeight: waitingDays && waitingDays > 3 ? 700 : 400 }}>
                        {waitingDays === null ? '-' : waitingDays === 0 ? 'Hoje' : `${waitingDays}d`}
                      </td>
                    ) : (
                      <td className="right" onClick={() => navigate(`/tasks/${t.id}`)} style={{ color: overdue ? '#FF6B6B' : soon ? '#FBBC04' : '#6B6580', fontWeight: overdue ? 700 : 400 }}>
                        {t.due_date ? t.due_date.slice(0, 10) : '-'} {overdue && '⚠️'} {soon && '⏰'}
                      </td>
                    )}
                    <td className="right" onClick={() => navigate(`/tasks/${t.id}`)}><Clock size={10} /> {timeAgo(t.created_at)}</td>
                  </tr>
                )
              })}
              {tasks.length === 0 && <tr><td colSpan={isDono ? 8 : isCliente ? 4 : 7} style={{ textAlign: 'center', padding: 40, color: '#6B6580' }}>Nenhuma tarefa encontrada</td></tr>}
            </tbody>
          </table>
          {total > 30 && <div style={{ padding: 12, display: 'flex', justifyContent: 'center', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span style={{ fontSize: 12, color: '#A8A3B8', padding: '6px 12px' }}>Pag {page}/{Math.ceil(total / 30)}</span><button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}>Proxima</button></div>}
        </div>
      )}

      {/* New task modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}><div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
          <h2>Nova Tarefa</h2>
          <div className="form-group"><label>Titulo *</label><input className="input" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="form-group"><label>Descricao</label><textarea className="input" rows={3} value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label>Cliente *</label><select className="select" value={newTask.client_id} onChange={e => setNewTask(p => ({ ...p, client_id: e.target.value }))}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="form-group"><label>Categoria</label><select className="select" value={newTask.category_id} onChange={e => setNewTask(p => ({ ...p, category_id: e.target.value }))}><option value="">Nenhuma</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Departamento</label><select className="select" value={newTask.department_id} onChange={e => setNewTask(p => ({ ...p, department_id: e.target.value }))}><option value="">Nenhum</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="form-group"><label>Responsaveis</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{allUsers.filter(u => u.role !== 'cliente').map(u => { const sel = newTask.assigned_to.includes(String(u.id)); return <button type="button" key={u.id} onClick={() => setNewTask(p => ({ ...p, assigned_to: sel ? p.assigned_to.filter(x => x !== String(u.id)) : [...p.assigned_to, String(u.id)] }))} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${sel ? '#34C759' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(52,199,89,0.12)' : 'transparent', color: sel ? '#34C759' : '#9B96B0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{sel ? '\u2713 ' : ''}{u.name}</button> })}</div></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Prazo</label><input className="input" type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} /></div>
            <div className="form-group"><label>Prioridade</label><select className="select" value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
          </div>
          <div className="form-group"><label>Link Drive (Arquivo Bruto)</label><input className="input" value={newTask.drive_link} onChange={e => setNewTask(p => ({ ...p, drive_link: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleCreate}>Criar Tarefa</button></div>
        </div></div>
      )}

      {/* Client request modal */}
      {showRequest && (
        <div className="modal-overlay" onClick={() => setShowRequest(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Nova Solicitacao</h2>
          <p style={{ fontSize: 12, color: '#9B96B0', marginTop: -6, marginBottom: 16 }}>Sua solicitacao sera enviada para aprovacao da equipe. Apos aprovada, entrara em producao.</p>
          <div className="form-group"><label>Titulo *</label><input className="input" value={newRequest.title} onChange={e => setNewRequest(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Mudar bio do perfil..." /></div>
          <div className="form-group"><label>Descricao</label><textarea className="input" rows={4} value={newRequest.description} onChange={e => setNewRequest(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes da solicitacao..." /></div>
          <div className="form-group"><label>Link dos arquivos (opcional)</label><input className="input" value={newRequest.drive_link_raw} onChange={e => setNewRequest(p => ({ ...p, drive_link_raw: e.target.value }))} placeholder="https://drive.google.com/... ou outro" /></div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowRequest(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!newRequest.title} onClick={async () => { await createTaskRequest({ title: newRequest.title, description: newRequest.description, drive_link_raw: newRequest.drive_link_raw || undefined }); setShowRequest(false); setNewRequest({ title: '', description: '', drive_link_raw: '' }); loadTasks() }}>Enviar Solicitacao</button>
          </div>
        </div></div>
      )}

      {/* Bulk stage modal */}
      {showBulkStage && (
        <div className="modal-overlay" onClick={() => setShowBulkStage(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Mover {selected.size} tarefas</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{stages.map(s => <button key={s.id} className="btn btn-secondary" onClick={() => handleBulkStage(s.slug)} style={{ justifyContent: 'flex-start' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />{s.name}</button>)}</div>
        </div></div>
      )}

      {/* Bulk assign modal */}
      {showBulkAssign && (
        <div className="modal-overlay" onClick={() => setShowBulkAssign(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Atribuir {selected.size} tarefas</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-secondary" onClick={() => handleBulkAssign(null)} style={{ justifyContent: 'flex-start' }}>Remover responsavel</button>
            {allUsers.filter(u => u.role !== 'cliente').map(u => <button key={u.id} className="btn btn-secondary" onClick={() => handleBulkAssign(u.id)} style={{ justifyContent: 'flex-start' }}><User size={14} /> {u.name}</button>)}
          </div>
        </div></div>
      )}
    </div>
  )
}
