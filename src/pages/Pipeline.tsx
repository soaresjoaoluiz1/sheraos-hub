import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSSE } from '../context/SSEContext'
import { fetchPipelineTasks, fetchClients, fetchDepartments, fetchUsers, fetchCategories, createTask, createEditorialTask, createMaeTask, moveTaskStage, type Task, type PipelineStage, type Client, type Department, type User as UserT, type TaskCategory } from '../lib/api'
import { Clock, Building2, User, ExternalLink, ChevronDown, ChevronRight, ArrowRight, Search, AlertTriangle, Plus, Layers, X } from 'lucide-react'
import { useToast } from '../components/Toast'

function timeAgo(d: string) {
  const [datePart, timePartRaw] = d.split(/[ T]/)
  const [y, mo, da] = datePart.split('-').map(Number)
  const [h, mi, s] = ((timePartRaw || '00:00:00').split(':').map(Number)) as [number, number, number]
  const utcMs = Date.UTC(y, (mo || 1) - 1, da || 1, (h || 0) + 3, mi || 0, s || 0)
  const m = Math.floor((Date.now() - utcMs) / 60000)
  if (m < 0) return 'agora'
  if (m < 60) return `${m}m`
  const hr = Math.floor(m / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}
function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` }
function isOverdue(d: string | null) { return d ? d.slice(0, 10) < todayStr() : false }
function useIsMobile() { const [m, setM] = useState(window.innerWidth <= 640); useEffect(() => { const h = () => setM(window.innerWidth <= 640); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, []); return m }

const PRIORITY_COLORS: Record<string, string> = { low: '#6B6580', normal: '#5DADE2', high: '#FFAA83', urgent: '#FF6B6B' }

export default function Pipeline() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [saving, setSaving] = useState(false)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filterClient, setFilterClient] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [draggedTask, setDraggedTask] = useState<number | null>(null)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [moveTaskId, setMoveTaskId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTerminal, setShowTerminal] = useState(() => localStorage.getItem('pipeline_show_terminal') === '1')
  const [viewMode, setViewMode] = useState<'all' | 'maes' | 'subtarefas'>(() => (localStorage.getItem('pipeline_view_mode') as any) || 'all')
  const [groupByClient, setGroupByClient] = useState(() => localStorage.getItem('pipeline_group_client') === '1')
  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [showNew, setShowNew] = useState(false)
  const [showNewEditorial, setShowNewEditorial] = useState(false)
  const [showNewMae, setShowNewMae] = useState(false)
  const [newEditorial, setNewEditorial] = useState({ client_id: '', month_label: '', num_posts: '8', num_videos: '4', due_date: '', category_id: '' })
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const [newMae, setNewMae] = useState({ title: '', client_id: '', description: '', due_date: today, category_id: '', department_id: '', priority: 'normal' })
  const [newTask, setNewTask] = useState({ title: '', description: '', client_id: '', category_id: '', department_id: '', assigned_to: [] as string[], due_date: today, priority: 'normal', drive_link_raw: '', drive_link: '', approval_link: '', approval_text: '', publish_date: '', publish_objective: '', recording_date: '', recording_time: '' })
  const [newTaskIsCarrossel, setNewTaskIsCarrossel] = useState(false)
  const [newTaskFiles, setNewTaskFiles] = useState<string[]>([''])
  const isDono = user?.role === 'dono'
  const isFunc = user?.role === 'funcionario' || user?.role === 'gerente'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const filters: Record<string, any> = {}
      if (filterClient) filters.client_id = filterClient
      if (filterDept) filters.department_id = filterDept
      const data = await fetchPipelineTasks(filters)
      setStages(data.stages); setTasks(data.tasks)
      if (isMobile) setExpandedStages(new Set(data.stages.filter(s => data.tasks.some(t => t.stage === s.slug)).map(s => s.slug)))
    } catch {} finally { setLoading(false) }
  }, [filterClient, filterDept, isMobile])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (isDono || isFunc) { fetchClients().then(setClients).catch(() => {}); fetchDepartments().then(setDepartments).catch(() => {}); fetchUsers().then(u => setUsers(u as any)).catch(() => {}); fetchCategories().then(setCategories).catch(() => {}) } }, [isDono, isFunc])
  const [allUsers, setUsers] = useState<UserT[]>([])

  useSSE('task:created', useCallback(() => loadData(), [loadData]))
  useSSE('task:stage_changed', useCallback(() => loadData(), [loadData]))

  const handleDrop = async (stageSlug: string) => {
    if (!draggedTask) return
    const task = tasks.find(t => t.id === draggedTask)
    if (!task || task.stage === stageSlug) return
    if ((stageSlug === 'aprovacao_interna' || stageSlug === 'aguardando_cliente') && !task.approval_link) {
      alert('Preencha o "Conteudo para Aprovacao" na tarefa antes de enviar pra aprovacao.\n\nAbra a tarefa, clique em Editar e preencha o link na secao dourada.')
      setDraggedTask(null); return
    }
    setTasks(prev => prev.map(t => t.id === draggedTask ? { ...t, stage: stageSlug } : t))
    setDraggedTask(null)
    try { await moveTaskStage(draggedTask, stageSlug) } catch { loadData() }
  }

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.client_id) return
    setSaving(true)
    try {
      const recording_datetime = newTask.recording_date ? `${newTask.recording_date}T${newTask.recording_time || '09:00'}` : undefined
      const approval_files = newTaskIsCarrossel ? newTaskFiles.filter(s => s && s.trim()) : (newTask.approval_link ? [newTask.approval_link] : [])
      await createTask({ ...newTask, client_id: +newTask.client_id, category_id: newTask.category_id ? +newTask.category_id : undefined, department_id: newTask.department_id ? +newTask.department_id : undefined, assigned_to: newTask.assigned_to.map(Number), recording_datetime, approval_files } as any)
      setShowNew(false); setNewTask({ title: '', description: '', client_id: '', category_id: '', department_id: '', assigned_to: [], due_date: today, priority: 'normal', drive_link_raw: '', drive_link: '', approval_link: '', approval_text: '', publish_date: '', publish_objective: '', recording_date: '', recording_time: '' })
      setNewTaskIsCarrossel(false); setNewTaskFiles([''])
      loadData()
      toast('Tarefa criada com sucesso!')
    } catch (err: any) { toast(err.message || 'Erro ao criar tarefa', 'error') }
    finally { setSaving(false) }
  }

  const handleCreateMae = async () => {
    if (!newMae.title || !newMae.client_id) return
    setSaving(true)
    try {
      await createMaeTask({
        client_id: +newMae.client_id,
        title: newMae.title,
        description: newMae.description || undefined,
        due_date: newMae.due_date || undefined,
        category_id: newMae.category_id ? +newMae.category_id : undefined,
        department_id: newMae.department_id ? +newMae.department_id : undefined,
        priority: newMae.priority,
      })
      setShowNewMae(false)
      setNewMae({ title: '', client_id: '', description: '', due_date: today, category_id: '', department_id: '', priority: 'normal' })
      loadData()
      toast('Tarefa Mae criada — abra ela e adicione as subtarefas')
    } catch (err: any) { toast(err.message || 'Erro ao criar tarefa mae', 'error') }
    finally { setSaving(false) }
  }

  const handleCreateEditorial = async () => {
    if (!newEditorial.client_id || !newEditorial.month_label) return
    setSaving(true)
    try {
      await createEditorialTask({
        client_id: +newEditorial.client_id,
        month_label: newEditorial.month_label,
        num_posts: newEditorial.num_posts ? +newEditorial.num_posts : undefined,
        num_videos: newEditorial.num_videos ? +newEditorial.num_videos : undefined,
        due_date: newEditorial.due_date || undefined,
        category_id: newEditorial.category_id ? +newEditorial.category_id : undefined,
      })
      setShowNewEditorial(false)
      setNewEditorial({ client_id: '', month_label: '', num_posts: '8', num_videos: '4', due_date: '', category_id: '' })
      loadData()
      toast('Linha Editorial criada com sucesso!')
    } catch (err: any) { toast(err.message || 'Erro ao criar linha editorial', 'error') }
    finally { setSaving(false) }
  }

  const handleMobileMove = async (taskId: number, stageSlug: string) => {
    const task = tasks.find(t => t.id === taskId)
    if ((stageSlug === 'aprovacao_interna' || stageSlug === 'aguardando_cliente') && task && !task.approval_link) {
      alert('Preencha o "Conteudo para Aprovacao" na tarefa antes de enviar pra aprovacao.\n\nAbra a tarefa, clique em Editar e preencha o link na secao dourada.')
      setMoveTaskId(null); return
    }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stage: stageSlug } : t))
    setMoveTaskId(null)
    try { await moveTaskStage(taskId, stageSlug) } catch { loadData() }
  }

  if (loading) return <div className="loading-container"><div className="spinner" /></div>

  // Mobile vertical
  if (isMobile) return (
    <div>
      <div className="page-header"><h1>Pipeline</h1></div>
      {stages.filter(s => showTerminal || !s.is_terminal).map(stage => {
        const stageTasks = tasks.filter(t => t.stage === stage.slug)
        const expanded = expandedStages.has(stage.slug)
        return (
          <div key={stage.id} className="kanban-mobile-stage">
            <div className="kanban-mobile-stage-header" onClick={() => setExpandedStages(prev => { const n = new Set(prev); n.has(stage.slug) ? n.delete(stage.slug) : n.add(stage.slug); return n })}>
              <div className="kanban-mobile-stage-title"><span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color }} />{stage.name}<span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#A8A3B8' }}>{stageTasks.length}</span></div>
              {expanded ? <ChevronDown size={16} style={{ color: '#6B6580' }} /> : <ChevronRight size={16} style={{ color: '#6B6580' }} />}
            </div>
            {expanded && <div className="kanban-mobile-cards">
              {stageTasks.map(task => (
                <div key={task.id} className="kanban-mobile-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div onClick={() => navigate(`/tasks/${task.id}`)} style={{ cursor: 'pointer', flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{task.title}</div>
                      <div style={{ fontSize: 11, color: '#A8A3B8', marginTop: 2 }}>{task.client_name}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setMoveTaskId(task.id)}><ArrowRight size={12} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: '#6B6580', flexWrap: 'wrap' }}>
                    {task.department_name && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: task.department_color }} />{task.department_name}</span>}
                    {task.assigned_name && <span><User size={9} /> {task.assigned_name}</span>}
                    {task.due_date && <span style={{ color: isOverdue(task.due_date) ? '#FF6B6B' : undefined }}><Clock size={9} /> {task.due_date.slice(0, 10)}</span>}
                  </div>
                </div>
              ))}
              {stageTasks.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#6B6580', fontSize: 12 }}>Vazio</div>}
            </div>}
          </div>
        )
      })}
      {moveTaskId && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setMoveTaskId(null))() }}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Mover tarefa</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stages.map(s => { const current = tasks.find(t => t.id === moveTaskId)?.stage === s.slug; return (
              <button key={s.id} className={`btn ${current ? 'btn-primary' : 'btn-secondary'}`} disabled={current} onClick={() => !current && handleMobileMove(moveTaskId, s.slug)} style={{ justifyContent: 'flex-start', minHeight: 44 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />{s.name}{current && ' (atual)'}
              </button>
            )})}
          </div>
        </div></div>
      )}
    </div>
  )

  // Desktop Kanban
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>Pipeline</h1>
          {(isDono || isFunc) && <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={14} /> Nova Tarefa</button>}
          {(isDono || isFunc) && <button className="btn btn-secondary btn-sm" onClick={() => setShowNewMae(true)}><Layers size={14} /> Tarefa Mae</button>}
          {isDono && <button className="btn btn-secondary btn-sm" onClick={() => setShowNewEditorial(true)}><Layers size={14} /> Linha Editorial</button>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6B6580' }} />
            <input className="input" placeholder="Buscar tarefa..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 32, width: 200 }} />
          </div>
          {isDono && <>
            <select className="select" style={{ width: 160 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}><option value="">Todos clientes</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="select" style={{ width: 160 }} value={filterDept} onChange={e => setFilterDept(e.target.value)}><option value="">Todos deptos</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </>}
          <button className={`btn btn-sm ${showTerminal ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setShowTerminal(p => { const v = !p; localStorage.setItem('pipeline_show_terminal', v ? '1' : '0'); return v }) }} style={{ fontSize: 11 }}>
            {showTerminal ? 'Ocultar Concluidos' : 'Mostrar Concluidos'}
          </button>
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => { setViewMode('all'); localStorage.setItem('pipeline_view_mode', 'all') }} style={{ padding: '6px 10px', fontSize: 11, background: viewMode === 'all' ? '#FFB300' : 'transparent', color: viewMode === 'all' ? '#1a1625' : '#9B96B0', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Tudo</button>
            <button onClick={() => { setViewMode('maes'); localStorage.setItem('pipeline_view_mode', 'maes') }} style={{ padding: '6px 10px', fontSize: 11, background: viewMode === 'maes' ? '#FFB300' : 'transparent', color: viewMode === 'maes' ? '#1a1625' : '#9B96B0', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Tarefas</button>
            <button onClick={() => { setViewMode('subtarefas'); localStorage.setItem('pipeline_view_mode', 'subtarefas') }} style={{ padding: '6px 10px', fontSize: 11, background: viewMode === 'subtarefas' ? '#FFB300' : 'transparent', color: viewMode === 'subtarefas' ? '#1a1625' : '#9B96B0', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Subtarefas</button>
          </div>
          <button className={`btn btn-sm ${groupByClient ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setGroupByClient(p => { const v = !p; localStorage.setItem('pipeline_group_client', v ? '1' : '0'); return v }) }} style={{ fontSize: 11 }}>
            {groupByClient ? 'Desagrupar' : 'Agrupar por Cliente'}
          </button>
        </div>
      </div>
      <div className="kanban-board">
        {stages.filter(s => showTerminal || !s.is_terminal).map(stage => {
          const searchLower = searchQuery.toLowerCase()
          const stageTasks = tasks.filter(t => {
            if (t.stage !== stage.slug) return false
            // viewMode filter
            const isSubtask = !!(t as any).parent_task_id
            const isMother = !isSubtask && !!(t as any).task_type && (t as any).task_type !== 'normal'
            if (viewMode === 'maes' && isSubtask) return false
            if (viewMode === 'subtarefas' && !isSubtask && !isMother) return false
            if (viewMode === 'subtarefas' && isMother) return false
            // search filter
            if (searchQuery && !t.title.toLowerCase().includes(searchLower) && !t.client_name?.toLowerCase().includes(searchLower) && !t.assigned_name?.toLowerCase().includes(searchLower)) return false
            return true
          })
          return (
            <div key={stage.id} className="kanban-column"
              onDragOver={e => { e.preventDefault(); e.currentTarget.querySelector('.kanban-cards')?.classList.add('drag-over') }}
              onDragLeave={e => e.currentTarget.querySelector('.kanban-cards')?.classList.remove('drag-over')}
              onDrop={e => { e.preventDefault(); e.currentTarget.querySelector('.kanban-cards')?.classList.remove('drag-over'); handleDrop(stage.slug) }}>
              <div className="kanban-column-header">
                <div className="kanban-column-title"><span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />{stage.name}</div>
                <span className="kanban-column-count">{stageTasks.length}</span>
              </div>
              <div className="kanban-cards">
                {(() => {
                  const renderCard = (task: Task) => {
                    const isSubtask = !!(task as any).parent_task_id
                    const isMother = !isSubtask && !!(task as any).task_type && (task as any).task_type !== 'normal'
                    const displayTitle = isSubtask ? task.title.split(' - ')[0] : task.title
                    const overdue = isOverdue(task.due_date) && task.stage !== 'concluido' && task.stage !== 'rejeitado'
                    return (
                      <div key={task.id} className={`kanban-card ${draggedTask === task.id ? 'dragging' : ''}`}
                        data-subtask={isSubtask ? '1' : undefined}
                        draggable onDragStart={() => setDraggedTask(task.id)} onDragEnd={() => setDraggedTask(null)}
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        style={{ borderLeft: `3px solid ${overdue ? '#FF6B6B' : stage.color}`, ...(overdue ? { background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)' } : isSubtask ? { background: 'rgba(255,179,0,0.03)' } : isMother ? { background: 'rgba(255,179,0,0.05)' } : {}) }}>
                        {isMother && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#FFB300', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                            <Layers size={9} /> Tarefa Mae
                          </div>
                        )}
                        {isSubtask && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#FFB300', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                            <Layers size={9} /> Subtarefa
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="kanban-card-name">{displayTitle}</div>
                          {task.priority === 'urgent' && <span style={{ fontSize: 9, background: '#FF6B6B20', color: '#FF6B6B', padding: '1px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>URGENTE</span>}
                          {task.priority === 'high' && <span style={{ fontSize: 9, background: '#FFAA8320', color: '#FFAA83', padding: '1px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>ALTA</span>}
                        </div>
                        {(task as any).changes_requested && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, background: 'rgba(255,179,0,0.18)', color: '#FFB300', padding: '2px 7px', borderRadius: 4, fontWeight: 700, marginTop: 4, marginBottom: 2, border: '1px solid rgba(255,179,0,0.3)' }}>
                            🔄 ALTERACAO SOLICITADA
                          </div>
                        )}
                        {!groupByClient && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#A8A3B8', marginBottom: 4 }}>
                            <Building2 size={10} /> {task.client_name}
                          </div>
                        )}
                        {task.department_name && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6B6580' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: task.department_color }} />{task.department_name}</div>}
                        <div className="kanban-card-meta">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {task.assigned_name && <span><User size={10} /> {task.assigned_name}</span>}
                            {(() => { const days = Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 86400000); return days > 0 ? <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: days > 7 ? '#FF6B6B15' : days > 3 ? '#FBBC0415' : 'rgba(255,255,255,0.04)', color: days > 7 ? '#FF6B6B' : days > 3 ? '#FBBC04' : '#6B6580' }}>{days}d</span> : null })()}
                          </div>
                          {task.due_date && <span style={{ color: isOverdue(task.due_date) ? '#FF6B6B' : '#6B6580', fontWeight: isOverdue(task.due_date) ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3 }}>{isOverdue(task.due_date) && <AlertTriangle size={9} />}<Clock size={10} />{task.due_date.slice(5, 10)}</span>}
                        </div>
                        {!!(task as any).subtask_count && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9B96B0' }}>
                            <Layers size={10} style={{ color: '#FFB300' }} />
                            <span>{(task as any).subtask_done_count || 0}/{(task as any).subtask_count} subtarefas</span>
                          </div>
                        )}
                        {task.drive_link && <div style={{ marginTop: 4 }}><ExternalLink size={10} style={{ color: '#5DADE2' }} /></div>}
                      </div>
                    )
                  }

                  if (!groupByClient) return stageTasks.map(renderCard)

                  // Group by client
                  const groups: Record<string, Task[]> = {}
                  for (const t of stageTasks) {
                    const key = t.client_name || 'Sem cliente'
                    if (!groups[key]) groups[key] = []
                    groups[key].push(t)
                  }
                  const sortedKeys = Object.keys(groups).sort()
                  return sortedKeys.map(clientName => (
                    <div key={clientName} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', marginBottom: 6, fontSize: 10, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,179,0,0.2)' }}>
                        <Building2 size={10} /> {clientName} <span style={{ color: '#6B6580' }}>({groups[clientName].length})</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {groups[clientName].map(renderCard)}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* New task modal */}
      {showNew && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setShowNew(false))() }}><div className="modal" style={{ maxWidth: 550 }} onClick={e => e.stopPropagation()}>
          <h2>Nova Tarefa</h2>
          <div className="form-group"><label>Titulo *</label><input className="input" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="form-group"><label>Descricao</label><textarea className="input" rows={2} value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label>Cliente *</label><select className="select" value={newTask.client_id} onChange={e => setNewTask(p => ({ ...p, client_id: e.target.value }))}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="form-group"><label>Categoria</label><select className="select" value={newTask.category_id} onChange={e => setNewTask(p => ({ ...p, category_id: e.target.value }))}><option value="">Nenhuma</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Departamento</label><select className="select" value={newTask.department_id} onChange={e => setNewTask(p => ({ ...p, department_id: e.target.value }))}><option value="">Nenhum</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="form-group"><label>Responsaveis</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{allUsers.filter((u: any) => u.role !== 'cliente').map((u: any) => { const sel = newTask.assigned_to.includes(String(u.id)); return <button type="button" key={u.id} onClick={() => setNewTask(p => ({ ...p, assigned_to: sel ? p.assigned_to.filter(x => x !== String(u.id)) : [...p.assigned_to, String(u.id)] }))} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${sel ? '#34C759' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(52,199,89,0.12)' : 'transparent', color: sel ? '#34C759' : '#9B96B0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{sel ? '\u2713 ' : ''}{u.name}</button> })}</div></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Prazo</label><input className="input" type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} /></div>
            <div className="form-group"><label>Prioridade</label><select className="select" value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Link Drive (Arquivo Bruto)</label><input className="input" value={newTask.drive_link_raw} onChange={e => setNewTask(p => ({ ...p, drive_link_raw: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
            <div className="form-group"><label>Link Drive (Arquivo Pronto)</label><input className="input" value={newTask.drive_link} onChange={e => setNewTask(p => ({ ...p, drive_link: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
          </div>
          <div style={{ padding: '14px 16px', background: 'rgba(245,166,35,0.04)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conteudo para Aprovacao (opcional)</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#A8A3B8', cursor: 'pointer' }}>
                <input type="checkbox" checked={newTaskIsCarrossel} onChange={e => {
                  const checked = e.target.checked
                  if (checked) {
                    setNewTaskIsCarrossel(true)
                    setNewTaskFiles(newTask.approval_link ? [newTask.approval_link] : [''])
                  } else {
                    setNewTaskIsCarrossel(false)
                    setNewTask(p => ({ ...p, approval_link: newTaskFiles[0] || '' }))
                  }
                }} style={{ accentColor: '#FFB300' }} />
                Carrossel (varios arquivos)
              </label>
            </div>
            {newTaskIsCarrossel ? (
              <div className="form-group">
                <label>Arquivos do carrossel</label>
                {newTaskFiles.map((url, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ minWidth: 56, fontSize: 11, color: '#6B6580', fontWeight: 700 }}>Slide {idx + 1}</span>
                    <input className="input" value={url} placeholder="Link do Drive (publico)" style={{ flex: 1 }} onChange={e => setNewTaskFiles(arr => arr.map((x, i) => i === idx ? e.target.value : x))} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewTaskFiles(arr => arr.filter((_, i) => i !== idx))} title="Remover" style={{ padding: '6px 10px' }}><X size={12} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewTaskFiles(arr => [...arr, ''])} style={{ marginTop: 4 }}><Plus size={12} /> Adicionar slide</button>
                <small style={{ fontSize: 11, color: '#6B6580', marginTop: 6, display: 'block' }}>Cada link vira um slide pro cliente ver. Precisam ser publicos no Drive.</small>
              </div>
            ) : (
              <div className="form-group"><label>Link do arquivo finalizado</label><input className="input" value={newTask.approval_link} onChange={e => setNewTask(p => ({ ...p, approval_link: e.target.value }))} placeholder="Link do Drive — compartilhamento: qualquer pessoa com o link" /><small style={{ fontSize: 11, color: '#6B6580', marginTop: 4, display: 'block' }}>O cliente vai ver o video/imagem embutido. Precisa estar publico no Drive.</small></div>
            )}
            <div className="form-group"><label>Texto / Legenda</label><textarea className="input" rows={3} value={newTask.approval_text} onChange={e => setNewTask(p => ({ ...p, approval_text: e.target.value }))} placeholder="Legenda do post, texto da publicacao, descricao..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Data da Publicacao</label><input className="input" type="date" value={newTask.publish_date} onChange={e => setNewTask(p => ({ ...p, publish_date: e.target.value }))} /></div>
              <div className="form-group"><label>Objetivo da Publicacao</label><input className="input" value={newTask.publish_objective} onChange={e => setNewTask(p => ({ ...p, publish_objective: e.target.value }))} placeholder="Ex: Gerar leads, engajamento..." /></div>
            </div>
          </div>
          {/* Show recording date/time fields when dept is Captacao */}
          {(() => {
            const selDept = departments.find(d => String(d.id) === newTask.department_id)
            const isCaptacao = selDept && (/capt|produ/i.test(selDept.name))
            if (!isCaptacao) return null
            return (
              <div style={{ padding: '12px 14px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Data e Hora da Gravacao</div>
                <div className="form-row">
                  <div className="form-group"><label>Data *</label><input className="input" type="date" value={newTask.recording_date} onChange={e => setNewTask(p => ({ ...p, recording_date: e.target.value }))} /></div>
                  <div className="form-group"><label>Hora *</label><input className="input" type="time" value={newTask.recording_time} onChange={e => setNewTask(p => ({ ...p, recording_time: e.target.value }))} /></div>
                </div>
                <div style={{ fontSize: 10, color: '#6E6887' }}>Essa tarefa aparecera no calendario de Gravacoes.</div>
              </div>
            )
          })()}
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleCreateTask} disabled={saving}>{saving ? 'Criando...' : 'Criar Tarefa'}</button></div>
        </div></div>
      )}

      {/* New Editorial modal */}
      {showNewEditorial && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setShowNewEditorial(false))() }}><div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
          <h2><Layers size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#FFB300' }} />Nova Linha Editorial</h2>
          <p style={{ fontSize: 12, color: '#9B96B0', marginTop: -6, marginBottom: 16 }}>Cria uma tarefa-mae com 5 subtarefas fixas: Briefing, Aprovacoes e Publicacao.</p>
          <div className="form-row">
            <div className="form-group"><label>Cliente *</label><select className="select" value={newEditorial.client_id} onChange={e => setNewEditorial(p => ({ ...p, client_id: e.target.value }))}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="form-group"><label>Mes/Referencia *</label><input className="input" placeholder="Ex: Janeiro 2026" value={newEditorial.month_label} onChange={e => setNewEditorial(p => ({ ...p, month_label: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Qtd Posts</label><input className="input" type="number" min="0" value={newEditorial.num_posts} onChange={e => setNewEditorial(p => ({ ...p, num_posts: e.target.value }))} /></div>
            <div className="form-group"><label>Qtd Videos</label><input className="input" type="number" min="0" value={newEditorial.num_videos} onChange={e => setNewEditorial(p => ({ ...p, num_videos: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Prazo Final</label><input className="input" type="date" value={newEditorial.due_date} onChange={e => setNewEditorial(p => ({ ...p, due_date: e.target.value }))} /></div>
            <div className="form-group"><label>Categoria</label><select className="select" value={newEditorial.category_id} onChange={e => setNewEditorial(p => ({ ...p, category_id: e.target.value }))}><option value="">Nenhuma</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div style={{ padding: '10px 12px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.18)', borderRadius: 8, fontSize: 11, color: '#A8A3B8', marginBottom: 12 }}>
            <strong style={{ color: '#FFB300' }}>Inicia com 5 subtarefas:</strong>
            <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>Briefing (Ideias + Copies) → Ivandro</li>
              <li>Reuniao Aprovacao Cliente (Briefing)</li>
              <li>Aprovacao Interna Final</li>
              <li>Aprovacao Cliente (Final)</li>
              <li>Publicacao</li>
            </ol>
            <strong style={{ color: '#FFB300', display: 'block', marginTop: 8 }}>Criadas automaticamente durante o fluxo:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0, listStyle: 'disc' }}>
              <li>Briefing → Criar Imagens (Dalila, em paralelo)</li>
              <li>Criar Imagens → Programar Publ Imagens (Graziele)</li>
              <li>Reuniao → Gravacao (Ivandro, prazo na data marcada)</li>
              <li>Gravacao → Subir Arquivos (Ivandro)</li>
              <li>Subir Arquivos → Editar Videos (Ivandro)</li>
              <li>Editar Videos → Programar Publ Videos (Graziele)</li>
            </ul>
            <div style={{ marginTop: 8, fontStyle: 'italic' }}>Quando todas concluirem, a tarefa-mae auto-conclui.</div>
          </div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowNewEditorial(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleCreateEditorial} disabled={saving || !newEditorial.client_id || !newEditorial.month_label}>{saving ? 'Criando...' : 'Criar Linha Editorial'}</button></div>
        </div></div>
      )}

      {/* New Mae generica modal */}
      {showNewMae && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setShowNewMae(false))() }}><div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
          <h2><Layers size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#FFB300' }} />Nova Tarefa Mae</h2>
          <p style={{ fontSize: 12, color: '#9B96B0', marginTop: -6, marginBottom: 16 }}>Cria uma tarefa-mae vazia. Voce adiciona as subtarefas manualmente depois. Quando todas concluirem, a mae auto-conclui.</p>
          <div className="form-row">
            <div className="form-group"><label>Titulo *</label><input className="input" value={newMae.title} onChange={e => setNewMae(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Campanha Black Friday 2026" /></div>
            <div className="form-group"><label>Cliente *</label><select className="select" value={newMae.client_id} onChange={e => setNewMae(p => ({ ...p, client_id: e.target.value }))}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="form-group"><label>Descricao</label><textarea className="input" rows={3} value={newMae.description} onChange={e => setNewMae(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label>Prazo</label><input className="input" type="date" value={newMae.due_date} onChange={e => setNewMae(p => ({ ...p, due_date: e.target.value }))} /></div>
            <div className="form-group"><label>Prioridade</label><select className="select" value={newMae.priority} onChange={e => setNewMae(p => ({ ...p, priority: e.target.value }))}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Departamento</label><select className="select" value={newMae.department_id} onChange={e => setNewMae(p => ({ ...p, department_id: e.target.value }))}><option value="">Nenhum</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="form-group"><label>Categoria</label><select className="select" value={newMae.category_id} onChange={e => setNewMae(p => ({ ...p, category_id: e.target.value }))}><option value="">Nenhuma</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowNewMae(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleCreateMae} disabled={saving || !newMae.title || !newMae.client_id}>{saving ? 'Criando...' : 'Criar Tarefa Mae'}</button></div>
        </div></div>
      )}
    </div>
  )
}
