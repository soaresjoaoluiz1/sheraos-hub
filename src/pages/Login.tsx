import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login(email, password) } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
          <img src="https://drosagencia.com.br/wp-content/uploads/2025/12/DROS-LOGO-1-1024x1024.png" alt="Dros" style={{ height: 80, marginBottom: 14 }} />
          <h1 style={{ margin: 0 }}>Sheraos Hub</h1>
          <div className="subtitle" style={{ marginTop: 4 }}>Gestao de Projetos & Aprovacoes</div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Email</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group"><label>Senha</label><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}
