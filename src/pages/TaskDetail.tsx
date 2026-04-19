import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSSE } from '../context/SSEContext'
import { fetchTask, fetchClients, fetchDepartments, fetchUsers, fetchCategories, fetchStages, updateTask, moveTaskStage, addTaskComment, addTaskAttachment, deleteTaskAttachment, approveTask, rejectTask, startTimer, stopTimer, confirmRecording, type Task, type TaskComment, type TaskHistory, type TaskAttachment, type TimeEntry, type Client, type Department, type User as UserT, type TaskCategory, type PipelineStage } from '../lib/api'
import { ArrowLeft, Building2, Clock, User, ExternalLink, CheckCircle, XCircle, Send, MessageCircle, GitBranch, Paperclip, Eye, Edit3, Save, X, Plus, AlertTriangle, Layers, ChevronRight, Video, Trash2 } from 'lucide-react'

export default function TaskDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'attachments' | 'time'>('comments')
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [totalTime, setTotalTime] = useState(0)
  const [activeTimerEntry, setActiveTimerEntry] = useState<TimeEntry | null>(null)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerElapsed, setTimerElapsed] = useState(0)
  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [clients, setClients] = useState<Client[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [users, setUsers] = useState<UserT[]>([])
  const [categories, setCategories] = useState<TaskCategory[]>([])
  // Attachment
  const [newAttUrl, setNewAttUrl] = useState('')
  const [newAttName, setNewAttName] = useState('')
  // Recording confirmation modal (editorial workflow)
  const [showRecording, setShowRecording] = useState(false)
  const [recordingData, setRecordingData] = useState({ recording_datetime: '', capture_user_id: '', edit_user_id: '', design_user_id: '' })

  const isDono = user?.role === 'dono'
  const isFunc = user?.role === 'funcionario'
  const isCliente = user?.role === 'cliente'
  const canEdit = isDono || (isFunc && ((task as any)?.assignees?.some((a: any) => a.user_id === user?.id) || task?.assigned_to === user?.id))

  const loadTask = useCallback(async () => {
    if (!id) return
    const data = await fetchTask(+id)
    setTask(data.task); setComments(data.comments); setHistory(data.history); setAttachments(data.attachments)
    setEditData({ title: data.task.title, description: data.task.description || '', due_date: data.task.due_date?.slice(0, 10) || '', priority: data.task.priority, department_id: data.task.department_id || '', assigned_to: (data.task.assignees || []).map((a: any) => String(a.user_id)), category_id: data.task.category_id || '', drive_link: data.task.drive_link || '', drive_link_raw: data.task.drive_link_raw || '', approval_link: data.task.approval_link || '', approval_text: data.task.approval_text || '', publish_date: data.task.publish_date || '', publish_objective: data.task.publish_objective || '', meeting_datetime: (data.task as any).meeting_datetime || '', recording_datetime: (data.task as any).recording_datetime || '' })
    setTimeEntries(data.timeEntries || []); setTotalTime(data.totalTimeSeconds || 0)
    if (data.activeTimer) { setActiveTimerEntry(data.activeTimer); setTimerRunning(true) } else { setActiveTimerEntry(null); setTimerRunning(false) }
  }, [id])

  useEffect(() => {
    setLoading(true)
    const loadMeta = isDono || isFunc
    Promise.all([loadTask(), loadMeta ? fetchClients().then(setClients) : Promise.resolve(), loadMeta ? fetchDepartments().then(setDepartments) : Promise.resolve(), loadMeta ? fetchUsers().then(setUsers) : Promise.resolve(), fetchCategories().then(setCategories), fetchStages().then(setStages)])
      .finally(() => setLoading(false))
  }, [loadTask, isDono])
  useSSE('task:stage_changed', useCallback((data: any) => { if (data.id === parseInt(id || '0')) loadTask() }, [id, loadTask]))
  useSSE('task:comment', useCallback((data: any) => { if (data.taskId === parseInt(id || '0')) loadTask() }, [id, loadTask]))

  const [showTimerCheck, setShowTimerCheck] = useState(false)
  const lastCheckRef = useRef(0)

  // Timer tick + hourly check
  useEffect(() => {
    if (!timerRunning || !activeTimerEntry) return
    const interval = setInterval(() => {
      const startedAt = new Date(activeTimerEntry.started_at + '-03:00').getTime()
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      setTimerElapsed(elapsed)
      // Check every 1 hour (3600s)
      const currentHour = Math.floor(elapsed / 3600)
      if (currentHour > 0 && currentHour > lastCheckRef.current) {
        lastCheckRef.current = currentHour
        setShowTimerCheck(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [timerRunning, activeTimerEntry])

  const handleStartTimer = async () => { if (task) { lastCheckRef.current = 0; await startTimer(task.id); loadTask() } }
  const handleStopTimer = async () => { if (task) { await stopTimer(task.id); setTimerRunning(false); setTimerElapsed(0); loadTask() } }
  const handleTimerCheckNo = async () => {
    setShowTimerCheck(false)
    if (task) {
      await stopTimer(task.id)
      await moveTaskStage(task.id, 'backlog')
      setTimerRunning(false); setTimerElapsed(0); loadTask()
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60
    return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const handleSaveEdit = async () => {
    if (!task) return
    await updateTask(task.id, { ...editData, department_id: editData.department_id ? +editData.department_id : null, assigned_to: (editData.assigned_to || []).map(Number), category_id: editData.category_id ? +editData.category_id : null })
    setEditing(false); loadTask()
  }

  const handleAddAttachment = async () => {
    if (!task || !newAttUrl || !newAttName) return
    await addTaskAttachment(task.id, newAttUrl, newAttName)
    setNewAttUrl(''); setNewAttName(''); loadTask()
  }

  const handleComment = async () => {
    if (!commentText.trim() || !task) return
    const comment = await addTaskComment(task.id, commentText, isInternal)
    setComments(prev => [...prev, comment]); setCommentText('')
  }

  const handleApprove = async () => { if (task) { await approveTask(task.id); loadTask() } }
  const handleReject = async () => { if (task && rejectReason) { await rejectTask(task.id, rejectReason); setShowReject(false); setRejectReason(''); loadTask() } }

  const handleConfirmRecording = async () => {
    if (!task || !recordingData.recording_datetime) return
    await confirmRecording(task.id, {
      recording_datetime: recordingData.recording_datetime,
      capture_user_id: recordingData.capture_user_id ? +recordingData.capture_user_id : undefined,
      edit_user_id: recordingData.edit_user_id ? +recordingData.edit_user_id : undefined,
      design_user_id: recordingData.design_user_id ? +recordingData.design_user_id : undefined,
    })
    setShowRecording(false)
    setRecordingData({ recording_datetime: '', capture_user_id: '', edit_user_id: '', design_user_id: '' })
    loadTask()
  }

  const handleStageMove = async (stage: string) => {
    if (!task) return
    if ((stage === 'aprovacao_interna' || stage === 'aguardando_cliente') && !task.approval_link) {
      alert('Preencha o "Conteudo para Aprovacao" antes de enviar pra aprovacao.\n\nClique em Editar e preencha o link do arquivo finalizado na secao dourada.')
      return
    }
    try {
      if (stage === 'em_producao') lastCheckRef.current = 0
      await moveTaskStage(task.id, stage)
      loadTask()
    }
    catch (err: any) { alert(err.message || 'Erro ao mover tarefa') }
  }

  if (loading) return <div className="loading-container"><div className="spinner" /></div>
  if (!task) return <div className="empty-state"><h3>Tarefa nao encontrada</h3></div>

  const canApproveInternal = isDono && task.stage === 'aprovacao_interna'
  const canApproveClient = isCliente && task.stage === 'aguardando_cliente'
  const canPickUp = isFunc && task.stage === 'backlog'
  const canSubmitReview = isFunc && task.stage === 'em_producao' && task.assigned_to === user?.id
  const canMoveToApproval = isDono && task.stage === 'revisao_interna'
  const canSchedule = isDono && task.stage === 'aprovado_cliente'
  const canComplete = isDono && task.stage === 'programar_publicacao'

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-icon" onClick={() => navigate(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20 }}>{task.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A8A3B8' }}>
              <Building2 size={12} /> {task.client_name}
              <span className="stage-badge" style={{ background: `${task.stage_color}20`, color: task.stage_color }}>{task.stage_name}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canPickUp && <button className="btn btn-primary btn-sm" onClick={() => handleStageMove('em_producao')}>Iniciar</button>}
          {canSubmitReview && <button className="btn btn-primary btn-sm" onClick={() => handleStageMove('revisao_interna')}><Send size={12} /> Enviar pra Revisao</button>}
          {canMoveToApproval && <button className="btn btn-primary btn-sm" onClick={() => handleStageMove('aprovacao_interna')}>Enviar pra Aprovacao</button>}
          {canApproveInternal && <><button className="btn btn-primary btn-sm" onClick={handleApprove}><CheckCircle size={12} /> Aprovar</button><button className="btn btn-danger btn-sm" onClick={() => setShowReject(true)}><XCircle size={12} /> Rejeitar</button></>}
          {canApproveClient && <><button className="btn btn-primary btn-sm" onClick={handleApprove}><CheckCircle size={12} /> Aprovar</button><button className="btn btn-danger btn-sm" onClick={() => setShowReject(true)}><XCircle size={12} /> Rejeitar</button></>}
          {canSchedule && <button className="btn btn-primary btn-sm" onClick={() => handleStageMove('programar_publicacao')}>Programar</button>}
          {canComplete && <button className="btn btn-primary btn-sm" onClick={() => handleStageMove('concluido')}><CheckCircle size={12} /> Concluir</button>}
          {(isDono || isFunc) && stages.length > 0 && (
            <select className="select" style={{ fontSize: 12, padding: '6px 10px', width: 'auto', minWidth: 140 }} value="" onChange={e => { if (e.target.value) handleStageMove(e.target.value) }}>
              <option value="">Mover para...</option>
              {stages.filter(s => s.slug !== task.stage).map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="lead-detail">
        {/* Left: Info */}
        <div>
          {/* Changes requested banner (client asked for changes) */}
          {(task as any).changes_requested && !isCliente && (
            <div className="card" style={{ marginBottom: 12, background: 'linear-gradient(135deg, rgba(255,179,0,0.12), rgba(255,107,107,0.04))', border: '1px solid rgba(255,179,0,0.35)', borderLeft: '4px solid #FFB300' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                🔄 Alteracao Solicitada pelo Cliente
              </div>
              <div style={{ fontSize: 14, color: '#F2F0F7', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{(task as any).changes_requested}</div>
              <div style={{ marginTop: 10, fontSize: 11, color: '#9B96B0', fontStyle: 'italic' }}>Ao reenviar pra aprovacao, essa flag e limpa automaticamente.</div>
            </div>
          )}

          {/* Parent task summary (when viewing a subtask) */}
          {(task as any).parent && (
            <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #FFB300', background: 'rgba(255,179,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} /> Tarefa-Mae
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/tasks/${(task as any).parent.id}`)}>
                  Abrir mae <ChevronRight size={12} />
                </button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 6 }}>
                {(task as any).parent.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9B96B0', marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="stage-badge" style={{ background: `${(task as any).parent.stage_color}20`, color: (task as any).parent.stage_color }}>{(task as any).parent.stage_name}</span>
                {(task as any).parent.assigned_name && <span><User size={10} /> {(task as any).parent.assigned_name}</span>}
                {(task as any).parent.due_date && <span><Clock size={10} /> {(task as any).parent.due_date.slice(0, 10)}</span>}
              </div>
              {/* Sibling navigation */}
              {(task as any).parent.subtasks?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {(task as any).parent.subtasks.map((s: any) => {
                    const isCurrent = s.id === task.id
                    return (
                      <div key={s.id} onClick={() => !isCurrent && navigate(`/tasks/${s.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: isCurrent ? 'default' : 'pointer', background: isCurrent ? 'rgba(255,179,0,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isCurrent ? 'rgba(255,179,0,0.3)' : 'rgba(255,255,255,0.04)'}` }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: s.stage_color || '#6B6580', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.subtask_position}</span>
                        <span style={{ flex: 1, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#F2F0F7' : '#9B96B0' }}>{s.title.replace(' - ' + (task as any).parent.title, '').replace((task as any).parent.title + ' - ', '')}</span>
                        <span style={{ fontSize: 10, color: s.stage_color }}>{s.stage_name}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            {/* Edit toggle */}
            {canEdit && !editing && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}><Edit3 size={12} /> Editar</button>
              </div>
            )}
            {editing && canEdit ? (
              <>
                <div className="form-group"><label>Titulo</label><input className="input" value={editData.title} onChange={e => setEditData((p: any) => ({ ...p, title: e.target.value }))} /></div>
                <div className="form-group"><label>Descricao</label><textarea className="input" rows={3} value={editData.description} onChange={e => setEditData((p: any) => ({ ...p, description: e.target.value }))} /></div>
                <div className="form-row">
                  <div className="form-group"><label>Departamento</label><select className="select" value={editData.department_id} onChange={e => setEditData((p: any) => ({ ...p, department_id: e.target.value }))}><option value="">Nenhum</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div className="form-group"><label>Responsaveis</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{users.filter((u: any) => u.role !== 'cliente' && u.is_active).map((u: any) => { const sel = (editData.assigned_to || []).includes(String(u.id)); return <button type="button" key={u.id} onClick={() => setEditData((p: any) => ({ ...p, assigned_to: sel ? p.assigned_to.filter((x: string) => x !== String(u.id)) : [...(p.assigned_to || []), String(u.id)] }))} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${sel ? '#34C759' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(52,199,89,0.12)' : 'transparent', color: sel ? '#34C759' : '#9B96B0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{sel ? '\u2713 ' : ''}{u.name}</button> })}</div></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Prazo</label><input className="input" type="date" value={editData.due_date} onChange={e => setEditData((p: any) => ({ ...p, due_date: e.target.value }))} /></div>
                  <div className="form-group"><label>Prioridade</label><select className="select" value={editData.priority} onChange={e => setEditData((p: any) => ({ ...p, priority: e.target.value }))}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div>
                </div>
                <div className="form-group"><label>Categoria</label><select className="select" value={editData.category_id} onChange={e => setEditData((p: any) => ({ ...p, category_id: e.target.value }))}><option value="">Nenhuma</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="form-row">
                  <div className="form-group"><label>Link Drive (Arquivo Bruto)</label><input className="input" value={editData.drive_link_raw} onChange={e => setEditData((p: any) => ({ ...p, drive_link_raw: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
                  <div className="form-group"><label>Link Drive (Arquivo Pronto)</label><input className="input" value={editData.drive_link} onChange={e => setEditData((p: any) => ({ ...p, drive_link: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
                </div>
                {/* Editorial workflow special fields */}
                {(task as any).subtask_kind === 'briefing' && (() => {
                  const dt = editData.meeting_datetime || ''
                  const datePart = dt.slice(0, 10)
                  const timePart = dt.slice(11, 16)
                  return (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Reuniao de Apresentacao</div>
                      <div className="form-row">
                        <div className="form-group"><label>Data da Reuniao *</label><input className="input" type="date" value={datePart} onChange={e => setEditData((p: any) => ({ ...p, meeting_datetime: e.target.value ? `${e.target.value}T${timePart || '09:00'}` : '' }))} /></div>
                        <div className="form-group"><label>Hora *</label><input className="input" type="time" value={timePart} onChange={e => setEditData((p: any) => ({ ...p, meeting_datetime: datePart ? `${datePart}T${e.target.value || '09:00'}` : '' }))} /></div>
                      </div>
                      <div style={{ fontSize: 10, color: '#6E6887' }}>Obrigatorio preencher antes de concluir o Briefing. Esta data vira o prazo da Reuniao Aprovacao Cliente.</div>
                    </div>
                  )
                })()}
                {(task as any).subtask_kind === 'aprov_briefing' && (() => {
                  const dt = editData.recording_datetime || ''
                  const datePart = dt.slice(0, 10)
                  const timePart = dt.slice(11, 16)
                  return (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Marcar Gravacao</div>
                      <div className="form-row">
                        <div className="form-group"><label>Data da Gravacao *</label><input className="input" type="date" value={datePart} onChange={e => setEditData((p: any) => ({ ...p, recording_datetime: e.target.value ? `${e.target.value}T${timePart || '09:00'}` : '' }))} /></div>
                        <div className="form-group"><label>Hora *</label><input className="input" type="time" value={timePart} onChange={e => setEditData((p: any) => ({ ...p, recording_datetime: datePart ? `${datePart}T${e.target.value || '09:00'}` : '' }))} /></div>
                      </div>
                      <div style={{ fontSize: 10, color: '#6E6887' }}>Obrigatorio preencher antes de concluir. Ao concluir, sera criada a tarefa de Gravacao (Ivandro) automaticamente.</div>
                    </div>
                  )
                })()}

                {/* Captacao dept — recording date/time (for non-editorial tasks) */}
                {!(task as any).subtask_kind && (() => {
                  const selDept = departments.find(d => String(d.id) === String(editData.department_id))
                  const isCaptacao = selDept && (/capt|produ/i.test(selDept.name))
                  if (!isCaptacao) return null
                  const dt = editData.recording_datetime || ''
                  const datePart = dt.slice(0, 10)
                  const timePart = dt.slice(11, 16)
                  return (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        <Video size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Data e Hora da Gravacao
                      </div>
                      <div className="form-row">
                        <div className="form-group"><label>Data</label><input className="input" type="date" value={datePart} onChange={e => setEditData((p: any) => ({ ...p, recording_datetime: e.target.value ? `${e.target.value}T${timePart || '09:00'}` : '' }))} /></div>
                        <div className="form-group"><label>Hora</label><input className="input" type="time" value={timePart} onChange={e => setEditData((p: any) => ({ ...p, recording_datetime: datePart ? `${datePart}T${e.target.value || '09:00'}` : '' }))} /></div>
                      </div>
                      <div style={{ fontSize: 10, color: '#6E6887' }}>Essa tarefa aparecera no calendario de Gravacoes.</div>
                    </div>
                  )
                })()}

                {/* Approval content section */}
                <div style={{ marginTop: 12, padding: '14px 16px', background: 'rgba(245,166,35,0.04)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Conteudo para Aprovacao</div>
                  <div className="form-group"><label>Link do arquivo finalizado *</label><input className="input" value={editData.approval_link} onChange={e => setEditData((p: any) => ({ ...p, approval_link: e.target.value }))} placeholder="Link do Drive com o arquivo pronto pra aprovacao..." /></div>
                  <div className="form-group"><label>Texto / Legenda</label><textarea className="input" rows={3} value={editData.approval_text} onChange={e => setEditData((p: any) => ({ ...p, approval_text: e.target.value }))} placeholder="Legenda do post, texto da publicacao, descricao..." /></div>
                  <div className="form-row">
                    <div className="form-group"><label>Data da Publicacao</label><input className="input" type="date" value={editData.publish_date} onChange={e => setEditData((p: any) => ({ ...p, publish_date: e.target.value }))} /></div>
                    <div className="form-group"><label>Objetivo da Publicacao</label><input className="input" value={editData.publish_objective} onChange={e => setEditData((p: any) => ({ ...p, publish_objective: e.target.value }))} placeholder="Ex: Gerar leads, engajamento, branding..." /></div>
                  </div>
                  <div style={{ fontSize: 10, color: '#6E6887' }}>Obrigatorio preencher o link antes de enviar pra aprovacao. Data e objetivo sao opcionais.</div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}><Save size={12} /> Salvar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}><X size={12} /> Cancelar</button>
                </div>
              </>
            ) : (
              <>
                {task.description && !isCliente && <div style={{ fontSize: 13, color: '#A8A3B8', marginBottom: 16, lineHeight: 1.6 }}>{task.description}</div>}
                {/* Overdue warning */}
                {!isCliente && task.due_date && (() => { const n = new Date(); return task.due_date.slice(0, 10) < `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })() && task.stage !== 'concluido' && task.stage !== 'rejeitado' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(255,107,107,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#FF6B6B', fontWeight: 600 }}>
                    <AlertTriangle size={14} /> Tarefa atrasada! Prazo era {task.due_date.slice(0, 10)}
                  </div>
                )}
                <div className="lead-info">
                  <div className="lead-info-row"><span className="lead-info-label"><Building2 size={12} /> Cliente</span><span className="lead-info-value">{task.client_name}</span></div>
                  {task.department_name && <div className="lead-info-row"><span className="lead-info-label">Departamento</span><span className="lead-info-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: task.department_color }} />{task.department_name}</span></div>}
                  {task.category_name && <div className="lead-info-row"><span className="lead-info-label">Categoria</span><span className="stage-badge" style={{ background: `${task.category_color}20`, color: task.category_color }}>{task.category_name}</span></div>}
                  <div className="lead-info-row"><span className="lead-info-label"><User size={12} /> Responsavel</span><span className="lead-info-value">{task.assigned_name || 'Nao atribuido'}</span></div>
                  <div className="lead-info-row"><span className="lead-info-label">Prioridade</span><span className="lead-info-value" style={{ color: task.priority === 'urgent' ? '#FF6B6B' : task.priority === 'high' ? '#FFAA83' : '#A8A3B8' }}>{task.priority}</span></div>
                  {!isCliente && task.due_date && (() => { const n = new Date(); const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; const due = task.due_date.slice(0, 10); const overdue = due < today && task.stage !== 'concluido' && task.stage !== 'rejeitado'; const soon = !overdue && due <= today; return <div className="lead-info-row"><span className="lead-info-label"><Clock size={12} /> Prazo</span><span className="lead-info-value" style={{ color: overdue ? '#FF6B6B' : soon ? '#FBBC04' : undefined }}>{due}{overdue ? ' (ATRASADO)' : ''}</span></div> })()}
                  <div className="lead-info-row"><span className="lead-info-label">Criado por</span><span className="lead-info-value">{task.created_by_name}</span></div>
                  <div className="lead-info-row"><span className="lead-info-label"><Clock size={12} /> Criado em</span><span className="lead-info-value">{new Date(task.created_at).toLocaleString('pt-BR')}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  {task.drive_link_raw && <a href={task.drive_link_raw} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><ExternalLink size={12} /> Arquivo Bruto</a>}
                  {task.drive_link && <a href={task.drive_link} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm"><ExternalLink size={12} /> Arquivo Pronto</a>}
                </div>

                {/* Editorial workflow display fields */}
                {(task as any).subtask_kind === 'briefing' && (
                  <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reuniao de Apresentacao</div>
                    {(task as any).meeting_datetime ? (
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{new Date((task as any).meeting_datetime).toLocaleString('pt-BR')}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#FFAA83' }}>Nao definida — preencha em "Editar" antes de concluir</div>
                    )}
                  </div>
                )}
                {(task as any).subtask_kind === 'aprov_briefing' && (
                  <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Data da Gravacao</div>
                    {(task as any).recording_datetime ? (
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{new Date((task as any).recording_datetime).toLocaleString('pt-BR')}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#FFAA83' }}>Nao definida — preencha em "Editar" antes de concluir</div>
                    )}
                  </div>
                )}
                {(task as any).recording_datetime && ((task as any).subtask_kind === 'gravacao' || (/capt|produ/i.test(task.department_name || ''))) && (
                  <div style={{ marginTop: 14, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(255,179,0,0.08), rgba(93,173,226,0.06))', border: '1px solid rgba(255,179,0,0.25)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      <Video size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Data e Hora da Gravacao
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#F2F0F7' }}>
                      {new Date((task as any).recording_datetime).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#FFB300', marginTop: 2 }}>
                      {new Date((task as any).recording_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}
                {/* Timer — mae editorial mostra agregado sem botoes; tarefas normais e subtarefas tem o botao */}
                {(isFunc || isDono) && (() => {
                  const isMother = (task as any).task_type && (task as any).task_type !== 'normal'
                  return (
                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#6B6580', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{isMother ? 'Tempo Total (Soma das Subtarefas)' : 'Tempo Total'}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-heading)', color: totalTime > 0 ? '#FFB300' : '#6B6580' }}>{formatTime(totalTime + (timerRunning && !isMother ? timerElapsed : 0))}</div>
                        </div>
                        {!isMother && (timerRunning ? (
                          <button className="btn btn-danger btn-sm" onClick={handleStopTimer}>⏹ Parar</button>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={handleStartTimer}>▶ Iniciar Timer</button>
                        ))}
                      </div>
                      {timerRunning && !isMother && <div style={{ fontSize: 11, color: '#34C759', marginTop: 4 }}>⏱ Cronometro ativo: {formatTime(timerElapsed)}</div>}
                    </div>
                  )
                })()}
              </>
            )}
          </div>

          {/* Subtasks (when viewing a mother task) */}
          {(task as any).subtasks?.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #FFB300' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB300', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} /> Subtarefas ({(task as any).subtasks.filter((s: any) => s.stage === 'concluido').length}/{(task as any).subtasks.length})
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(task as any).subtasks.map((sub: any) => {
                  const isOverdueSub = sub.due_date && sub.due_date.slice(0, 10) < (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })() && sub.stage !== 'concluido' && sub.stage !== 'rejeitado'
                  return (
                    <div key={sub.id} onClick={() => navigate(`/tasks/${sub.id}`)}
                      style={{ padding: '12px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.02)', border: `1px solid ${sub.stage === 'concluido' ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.06)'}`, borderLeft: `3px solid ${sub.stage_color || '#6B6580'}`, transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: sub.stage_color || '#6B6580', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{sub.subtask_position}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sub.title.replace(' - ' + task.title, '').replace(task.title + ' - ', '')}
                          </span>
                        </div>
                        <span className="stage-badge" style={{ background: `${sub.stage_color}20`, color: sub.stage_color, flexShrink: 0 }}>{sub.stage_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#6B6580', flexWrap: 'wrap' }}>
                        {sub.department_name && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sub.department_color }} />
                            {sub.department_name}
                          </span>
                        )}
                        {sub.assigned_name && <span><User size={10} /> {sub.assigned_name}</span>}
                        {sub.due_date && (
                          <span style={{ color: isOverdueSub ? '#FF6B6B' : '#6B6580', fontWeight: isOverdueSub ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} /> {sub.due_date.slice(0, 10)}{isOverdueSub ? ' (atrasada)' : ''}
                          </span>
                        )}
                        {sub.comment_count > 0 && <span><MessageCircle size={10} /> {sub.comment_count}</span>}
                        {sub.total_time_seconds > 0 && <span style={{ color: '#FFB300' }}><Clock size={10} /> {formatTime(sub.total_time_seconds)}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column — different for client vs team */}
        <div>
          {/* CLIENT VIEW: Approval content only */}
          {isCliente ? (
            <div>
              {/* Approval content */}
              {(task.approval_link || task.approval_text) ? (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Conteudo para Aprovacao</div>
                  {task.approval_link && (
                    <a href={task.approval_link} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ marginBottom: 12, display: 'inline-flex' }}>
                      <ExternalLink size={14} /> Ver Arquivo
                    </a>
                  )}
                  {task.approval_text && (
                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', fontSize: 14, lineHeight: 1.6, color: '#F2F0F7', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                      {task.approval_text}
                    </div>
                  )}
                  {(task.publish_date || task.publish_objective) && (
                    <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                      {task.publish_date && <div><span style={{ color: '#6E6887', fontSize: 11 }}>Data publicacao: </span><strong>{task.publish_date}</strong></div>}
                      {task.publish_objective && <div><span style={{ color: '#6E6887', fontSize: 11 }}>Objetivo: </span><strong>{task.publish_objective}</strong></div>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6E6887' }}>
                  Conteudo ainda nao disponivel. A equipe esta trabalhando nesta tarefa.
                </div>
              )}

              {/* Client comments (non-internal only) */}
              <div className="card">
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6E6887', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Comentarios</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input className="input" placeholder="Deixe um comentario..." value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleComment()} />
                  <button className="btn btn-primary btn-icon" onClick={handleComment}><Send size={16} /></button>
                </div>
                {comments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#6E6887', padding: 20, fontSize: 13 }}>Nenhum comentario</div>
                ) : [...comments].reverse().map(c => (
                  <div key={c.id} style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 8, background: 'rgba(52,199,89,0.04)', border: '1px solid rgba(52,199,89,0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user_name}</span>
                    </div>
                    <div style={{ fontSize: 13 }}>{c.content}</div>
                    <div style={{ fontSize: 10, color: '#6E6887', marginTop: 4 }}>{new Date(c.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          /* TEAM VIEW: Full tabs */
          <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${activeTab === 'comments' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('comments')}><MessageCircle size={12} /> Comentarios ({comments.length})</button>
            <button className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('history')}><GitBranch size={12} /> Historico</button>
            <button className={`btn btn-sm ${activeTab === 'time' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('time')}><Clock size={12} /> Tempo ({formatTime(totalTime)})</button>
            <button className={`btn btn-sm ${activeTab === 'attachments' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('attachments')}><Paperclip size={12} /> Anexos ({attachments.length})</button>
          </div>

          {activeTab === 'comments' && (
            <div className="card" style={{ minHeight: 350 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input className="input" placeholder="Adicionar comentario..." value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleComment()} />
                {!isCliente && <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', color: '#6B6580' }}><input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />Interno</label>}
                <button className="btn btn-primary btn-icon" onClick={handleComment}><Send size={16} /></button>
              </div>
              {[...comments].reverse().map(c => (
                <div key={c.id} style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 8, borderLeft: `3px solid ${c.is_internal ? '#FFB300' : '#34C759'}`, background: c.is_internal ? 'rgba(255,179,0,0.04)' : 'rgba(52,199,89,0.04)', border: `1px solid ${c.is_internal ? 'rgba(255,179,0,0.12)' : 'rgba(52,199,89,0.12)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user_name} <span style={{ fontSize: 10, color: '#6B6580', fontWeight: 400 }}>({c.user_role})</span></span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.is_internal ? '#FFB300' : '#34C759' }}>{c.is_internal ? '🔒 INTERNO' : '👁 CLIENTE'}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.content}</div>
                  <div style={{ fontSize: 10, color: '#6B6580', marginTop: 4 }}>{new Date(c.created_at).toLocaleString('pt-BR')}</div>
                </div>
              ))}
              {comments.length === 0 && <div style={{ textAlign: 'center', color: '#6B6580', padding: 30 }}>Nenhum comentario</div>}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="card" style={{ minHeight: 350 }}>
              {history.map((h, i) => (
                <div key={h.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFB300', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13 }}>{h.from_stage_name ? `${h.from_stage_name} → ${h.to_stage_name}` : `Criado: ${h.to_stage_name}`}</div>
                    {h.comment && <div style={{ fontSize: 12, color: '#A8A3B8', marginTop: 2 }}>{h.comment}</div>}
                    <div style={{ fontSize: 10, color: '#6B6580' }}>{h.user_name} · {new Date(h.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                </div>
              ))}
              {history.length === 0 && <div style={{ textAlign: 'center', color: '#6B6580', padding: 30 }}>Sem historico</div>}
            </div>
          )}

          {activeTab === 'time' && (
            <div className="card" style={{ minHeight: 350 }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#FFB300', marginBottom: 16 }}>
                Total: {formatTime(totalTime)}
              </div>
              {timeEntries.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6B6580', padding: 30 }}>Nenhum registro de tempo</div>
              ) : timeEntries.map(te => (
                <div key={te.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{te.user_name}</div>
                    <div style={{ fontSize: 11, color: '#6B6580' }}>{new Date(te.started_at).toLocaleString('pt-BR')}{te.ended_at ? ` → ${new Date(te.ended_at).toLocaleString('pt-BR')}` : ' (ativo)'}</div>
                    {te.description && <div style={{ fontSize: 11, color: '#A8A3B8', marginTop: 2 }}>{te.description}</div>}
                  </div>
                  <div style={{ fontWeight: 700, color: te.ended_at ? '#A8A3B8' : '#34C759', fontFamily: 'var(--font-heading)' }}>
                    {te.duration_seconds ? formatTime(te.duration_seconds) : '⏱ Ativo'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="card" style={{ minHeight: 350 }}>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <input className="input" placeholder="URL do arquivo..." value={newAttUrl} onChange={e => setNewAttUrl(e.target.value)} style={{ flex: 2 }} />
                  <input className="input" placeholder="Nome..." value={newAttName} onChange={e => setNewAttName(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-icon" onClick={handleAddAttachment} disabled={!newAttUrl || !newAttName}><Plus size={16} /></button>
                </div>
              )}
              {attachments.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{a.filename}</div><div style={{ fontSize: 10, color: '#6B6580' }}>{a.uploaded_by_name} · {new Date(a.created_at).toLocaleString('pt-BR')}</div></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Eye size={12} /> Ver</a>
                    {canEdit && <button className="btn btn-danger btn-sm btn-icon" onClick={() => { if (confirm(`Excluir anexo "${a.filename}"?`)) { deleteTaskAttachment(task!.id, a.id).then(loadTask) } }}><Trash2 size={12} /></button>}
                  </div>
                </div>
              ))}
              {attachments.length === 0 && <div style={{ textAlign: 'center', color: '#6B6580', padding: 30 }}>Nenhum anexo</div>}
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Confirm Recording modal */}
      {showRecording && (
        <div className="modal-overlay" onClick={() => setShowRecording(false)}><div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
          <h2><Video size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: '#FFB300' }} />Confirmar Data de Gravacao</h2>
          <p style={{ fontSize: 12, color: '#9B96B0', marginTop: -6, marginBottom: 16 }}>Sera criada a tarefa de Gravacao (no dia escolhido) e Criar Imagens (em paralelo). Apos a Gravacao concluir, Subir Arquivos e Editar Video sao criadas automaticamente.</p>
          <div className="form-group"><label>Data e Hora da Gravacao *</label><input className="input" type="datetime-local" value={recordingData.recording_datetime} onChange={e => setRecordingData(p => ({ ...p, recording_datetime: e.target.value }))} /></div>
          <div className="form-group">
            <label>Quem Grava (Captacao)</label>
            <select className="select" value={recordingData.capture_user_id} onChange={e => setRecordingData(p => ({ ...p, capture_user_id: e.target.value }))}>
              <option value="">Selecione</option>
              {users.filter(u => u.role !== 'cliente' && u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Quem Edita Video</label>
              <select className="select" value={recordingData.edit_user_id} onChange={e => setRecordingData(p => ({ ...p, edit_user_id: e.target.value }))}>
                <option value="">Selecione</option>
                {users.filter(u => u.role !== 'cliente' && u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quem Cria Imagens (Design)</label>
              <select className="select" value={recordingData.design_user_id} onChange={e => setRecordingData(p => ({ ...p, design_user_id: e.target.value }))}>
                <option value="">Selecione</option>
                {users.filter(u => u.role !== 'cliente' && u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding: '10px 12px', background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.18)', borderRadius: 8, fontSize: 11, color: '#A8A3B8', marginBottom: 12 }}>
            <strong style={{ color: '#FFB300' }}>O que sera criado agora:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>Gravacao (prazo no dia da gravacao)</li>
              <li>Criar Imagens (Design, em paralelo)</li>
            </ul>
            <strong style={{ color: '#FFB300', display: 'block', marginTop: 6 }}>Criadas automaticamente depois:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>Subir Arquivos (apos gravacao concluir)</li>
              <li>Editar Video (apos subir arquivos concluir)</li>
            </ul>
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowRecording(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleConfirmRecording} disabled={!recordingData.recording_datetime}>Confirmar e Criar Tarefas</button>
          </div>
        </div></div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="modal-overlay" onClick={() => setShowReject(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Rejeitar Tarefa</h2>
          <div className="form-group"><label>Motivo da rejeicao *</label><textarea className="input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Descreva o que precisa ser alterado..." /></div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowReject(false)}>Cancelar</button><button className="btn btn-danger" onClick={handleReject} disabled={!rejectReason.trim()}>Rejeitar</button></div>
        </div></div>
      )}

      {/* Timer hourly check popup */}
      {showTimerCheck && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#9202;</div>
            <h2 style={{ marginBottom: 8 }}>Ainda esta produzindo?</h2>
            <p style={{ color: '#9B96B0', fontSize: 14, marginBottom: 8 }}>Timer ativo ha <strong style={{ color: '#FFB300' }}>{formatTime(timerElapsed)}</strong></p>
            <p style={{ color: '#6B6580', fontSize: 12, marginBottom: 20 }}>"{task?.title}"</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowTimerCheck(false)} style={{ minWidth: 120 }}>Sim, continuar</button>
              <button className="btn btn-danger" onClick={handleTimerCheckNo} style={{ minWidth: 120 }}>Nao, parar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
