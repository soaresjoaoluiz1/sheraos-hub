import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSSE } from '../context/SSEContext'
import { apiFetch } from '../lib/api'
import {
  LayoutDashboard, Kanban, ListTodo, CheckCircle, Building2, UsersRound,
  Layers, Tag, Briefcase, DollarSign, Settings, LogOut, Menu, X, ChevronsLeft, ChevronsRight, Video,
} from 'lucide-react'
import NotificationBell from './NotificationBell'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [approvalCount, setApprovalCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1')
  if (!user) return null

  const isDono = user.role === 'dono'
  const isFunc = user.role === 'funcionario'
  const isCliente = user.role === 'cliente'
  const close = () => setMobileOpen(false)
  const toggleCollapse = () => { setCollapsed(p => { const v = !p; localStorage.setItem('sidebar_collapsed', v ? '1' : '0'); return v }) }

  const [overdueCount, setOverdueCount] = useState(0)

  useEffect(() => {
    if (isDono) {
      apiFetch('/api/approvals/internal').then((d: any) => setApprovalCount(d.tasks?.length || 0)).catch(() => {})
      apiFetch('/api/dashboard/stats?days=1').then((d: any) => setOverdueCount(d.overdue || 0)).catch(() => {})
    } else if (isCliente) apiFetch('/api/approvals/client').then((d: any) => setApprovalCount(d.tasks?.length || 0)).catch(() => {})
  }, [isDono, isCliente])

  useSSE('task:stage_changed', () => {
    if (isDono) apiFetch('/api/approvals/internal').then((d: any) => setApprovalCount(d.tasks?.length || 0)).catch(() => {})
    else if (isCliente) apiFetch('/api/approvals/client').then((d: any) => setApprovalCount(d.tasks?.length || 0)).catch(() => {})
  })

  return (
    <>
      {!mobileOpen && <button className="hamburger-btn" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>}
      {mobileOpen && <div className="sidebar-overlay" onClick={close} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div><img src="/hub/logo-dros.png" alt="Sheraos" className="sidebar-logo" />{!collapsed && <div className="sidebar-subtitle">HUB</div>}</div>
              {!collapsed && <NotificationBell />}
            </div>
            <button className="sidebar-close-btn" onClick={close}><X size={18} /></button>
          </div>
        </div>
        <nav className="sidebar-nav">
          {isDono && <div className="nav-section">Gestao</div>}
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          {(isDono || isFunc) && (
            <NavLink to="/pipeline" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
              <Kanban size={16} /> Pipeline
            </NavLink>
          )}
          {(isDono || isFunc) && (
            <NavLink to="/gravacoes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
              <Video size={16} /> Gravacoes
            </NavLink>
          )}
          <NavLink to="/tasks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
            <ListTodo size={16} /> {isCliente ? 'Minhas Tarefas' : 'Tarefas'}
            {overdueCount > 0 && isDono && <span className="nav-badge" style={{ background: '#FF6B6B' }}>{overdueCount}</span>}
          </NavLink>
          {(isDono || isCliente) && (
            <NavLink to="/approvals" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
              <CheckCircle size={16} /> {isCliente ? 'Aprovações' : 'Aprovacoes'}
              {approvalCount > 0 && <span className="nav-badge">{approvalCount}</span>}
            </NavLink>
          )}
          {isDono && (
            <>
              <div className="nav-section">Administracao</div>
              <NavLink to="/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><Building2 size={16} /> Clientes</NavLink>
              <NavLink to="/team" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><UsersRound size={16} /> Equipe</NavLink>
              <NavLink to="/departments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><Layers size={16} /> Departamentos</NavLink>
              <NavLink to="/categories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><Tag size={16} /> Categorias</NavLink>
              <NavLink to="/services" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><Briefcase size={16} /> Servicos</NavLink>
              <NavLink to="/financial" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><DollarSign size={16} /> Financeiro</NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}><Settings size={16} /> Configuracoes</NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          {collapsed ? (
            <button className="logout-btn" onClick={logout} title="Sair" style={{ margin: '0 auto' }}><LogOut size={16} /></button>
          ) : (
            <>
              <div><div className="sidebar-user">{user.name}</div><div className="sidebar-role">{user.role === 'dono' ? 'CEO' : user.role === 'funcionario' ? 'Funcionario' : 'Cliente'}</div></div>
              <button className="logout-btn" onClick={logout} title="Sair"><LogOut size={16} /></button>
            </>
          )}
        </div>
        <button className="collapse-btn" onClick={toggleCollapse} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>
    </>
  )
}
