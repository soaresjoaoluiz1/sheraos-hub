import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchClients, createClient, updateClient, formatNumber, type Client } from '../lib/api'
import { Building2, Plus, Edit3, Save, X, Eye } from 'lucide-react'

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', contact_name: '', contact_email: '', contact_phone: '', drive_folder: '', password: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const navigate = useNavigate()
  const [editData, setEditData] = useState<any>({})

  const load = () => { setLoading(true); fetchClients().then(setClients).finally(() => setLoading(false)) }
  useEffect(load, [])

  const handleCreate = async () => { if (!newClient.name || !newClient.contact_email || !newClient.password) return; await createClient(newClient); setShowNew(false); setNewClient({ name: '', contact_name: '', contact_email: '', contact_phone: '', drive_folder: '', password: '' }); load() }
  const handleSaveEdit = async () => { if (!editId) return; await updateClient(editId, editData); setEditId(null); load() }
  const startEdit = (c: Client) => { setEditId(c.id); setEditData({ name: c.name, contact_name: c.contact_name || '', contact_email: c.contact_email || '', contact_phone: (c as any).contact_phone || '' }) }

  return (
    <div>
      <div className="page-header"><h1><Building2 size={22} style={{ marginRight: 8 }} /> Clientes</h1><button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Plus size={14} /> Novo Cliente</button></div>
      {loading ? <div className="loading-container"><div className="spinner" /></div> : (
        <div className="table-card"><table>
          <thead><tr><th>Nome</th><th>Contato</th><th>Email</th><th className="right">Tarefas</th><th>Status</th><th className="right">Acoes</th></tr></thead>
          <tbody>
            {clients.map(c => editId === c.id ? (
              <tr key={c.id}>
                <td><input className="input" value={editData.name} onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))} style={{ padding: '4px 8px' }} /></td>
                <td><input className="input" value={editData.contact_name} onChange={e => setEditData((p: any) => ({ ...p, contact_name: e.target.value }))} style={{ padding: '4px 8px' }} /></td>
                <td><input className="input" value={editData.contact_email} onChange={e => setEditData((p: any) => ({ ...p, contact_email: e.target.value }))} style={{ padding: '4px 8px' }} /></td>
                <td className="right">{formatNumber(c.task_count || 0)}</td>
                <td><span style={{ color: '#34C759' }}>Ativo</span></td>
                <td className="right" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary btn-sm btn-icon" onClick={handleSaveEdit}><Save size={12} /></button>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditId(null)}><X size={12} /></button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td className="name">{c.name}</td><td>{c.contact_name || '-'}</td><td>{c.contact_email || '-'}</td>
                <td className="right" style={{ fontWeight: 600 }}>{formatNumber(c.task_count || 0)}</td>
                <td><span style={{ color: c.is_active ? '#34C759' : '#FF6B6B' }}>{c.is_active ? 'Ativo' : 'Inativo'}</span></td>
                <td className="right" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => navigate(`/clients/${c.id}`)}><Eye size={12} /></button>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => startEdit(c)}><Edit3 size={12} /></button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6B6580' }}>Nenhum cliente</td></tr>}
          </tbody>
        </table></div>
      )}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Novo Cliente</h2>
          <div className="form-group"><label>Nome *</label><input className="input" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-row"><div className="form-group"><label>Nome do Contato</label><input className="input" value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} placeholder="Nome da pessoa" /></div><div className="form-group"><label>Email de Acesso *</label><input className="input" type="email" value={newClient.contact_email} onChange={e => setNewClient(p => ({ ...p, contact_email: e.target.value }))} placeholder="email@cliente.com" /></div></div>
          <div className="form-row">
            <div className="form-group"><label>Telefone</label><input className="input" value={newClient.contact_phone} onChange={e => setNewClient(p => ({ ...p, contact_phone: e.target.value }))} /></div>
            <div className="form-group"><label>Senha de Acesso *</label><input className="input" type="password" value={newClient.password} onChange={e => setNewClient(p => ({ ...p, password: e.target.value }))} placeholder="Senha para o cliente acessar o sistema" /></div>
          </div>
          <div className="form-group"><label>Pasta do Drive</label><input className="input" value={newClient.drive_folder} onChange={e => setNewClient(p => ({ ...p, drive_folder: e.target.value }))} placeholder="https://drive.google.com/..." /></div>
          <div style={{ padding: '10px 12px', background: 'rgba(245,166,35,0.06)', borderRadius: 8, fontSize: 12, color: '#F5A623', marginTop: 4 }}>
            Um usuario sera criado automaticamente com o email e senha acima. O cliente usara essas credenciais pra acessar o sistema, aprovar tarefas e acompanhar o andamento.
          </div>
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button><button className="btn btn-primary" onClick={handleCreate}>Criar</button></div>
        </div></div>
      )}
    </div>
  )
}
