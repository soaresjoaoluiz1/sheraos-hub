import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SSEProvider } from './context/SSEContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Approvals from './pages/Approvals'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Team from './pages/Team'
import Departments from './pages/Departments'
import Categories from './pages/Categories'
import SettingsPage from './pages/Settings'
import Notifications from './pages/Notifications'
import Services from './pages/Services'
import Financial from './pages/Financial'
import Gravacoes from './pages/Gravacoes'
import Onboard from './pages/Onboard'
import TimerCheck from './components/TimerCheck'

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-container"><div className="spinner" /><span>Carregando...</span></div>
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>

  const isDono = user.role === 'dono'
  const isFunc = user.role === 'funcionario'
  const isCliente = user.role === 'cliente'
  const home = isDono ? '/dashboard' : isFunc ? '/pipeline' : '/approvals'

  return (
    <SSEProvider>
      <TimerCheck />
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Navigate to={home} />} />
            <Route path="/" element={<Navigate to={home} />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            {(isDono || isFunc) && <Route path="/pipeline" element={<Pipeline />} />}
            {(isDono || isFunc) && <Route path="/gravacoes" element={<Gravacoes />} />}
            {(isDono || isCliente) && <Route path="/approvals" element={<Approvals />} />}
            {isDono && <>
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/team" element={<Team />} />
              <Route path="/departments" element={<Departments />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/services" element={<Services />} />
              <Route path="/financial" element={<Financial />} />
              <Route path="/settings" element={<SettingsPage />} />
            </>}
            <Route path="*" element={<Navigate to={home} />} />
          </Routes>
        </main>
      </div>
    </SSEProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/onboard/:token" element={<Onboard />} />
        <Route path="/*" element={<AuthProvider><AppRoutes /></AuthProvider>} />
      </Routes>
    </BrowserRouter>
  )
}
