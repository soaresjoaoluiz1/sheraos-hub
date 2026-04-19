import { useState, useEffect } from 'react'
import { fetchStages, apiFetch, type PipelineStage } from '../lib/api'
import { Settings as SettingsIcon, Save, Plus, Trash2, GripVertical, Check } from 'lucide-react'

export default function SettingsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [editStages, setEditStages] = useState<Partial<PipelineStage>[]>([])
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = () => { setLoading(true); fetchStages().then(s => { setStages(s); setEditStages(s.map(x => ({ ...x }))) }).finally(() => setLoading(false)) }
  useEffect(load, [])

  const addStage = () => setEditStages(prev => [...prev, { name: '', slug: '', position: prev.length, color: '#FFB300', is_terminal: 0 }])
  const removeStage = (i: number) => setEditStages(prev => prev.filter((_, idx) => idx !== i))
  const updateStage = (i: number, field: string, value: any) => setEditStages(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  const handleSave = async () => {
    for (let i = 0; i < editStages.length; i++) {
      const s = editStages[i]
      const slug = s.slug || s.name!.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      if (s.id) {
        await apiFetch(`/api/stages/${s.id}`, { method: 'PUT', body: JSON.stringify({ name: s.name, color: s.color, position: i, is_terminal: s.is_terminal ? 1 : 0 }) })
      } else if (s.name) {
        await apiFetch('/api/stages', { method: 'POST', body: JSON.stringify({ name: s.name, slug, color: s.color, position: i, is_terminal: s.is_terminal ? 1 : 0 }) })
      }
    }
    setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 3000); load()
  }

  return (
    <div>
      <div className="page-header">
        <h1><SettingsIcon size={22} style={{ marginRight: 8 }} /> Configuracoes</h1>
        {editing ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}><Save size={14} /> Salvar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditStages(stages.map(x => ({ ...x }))) }}>Cancelar</button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            {saved ? <><Check size={14} /> Salvo!</> : 'Editar Pipeline'}
          </button>
        )}
      </div>

      <section className="dash-section">
        <div className="section-title">Etapas do Pipeline</div>
        {loading ? <div className="loading-container"><div className="spinner" /></div> : (
          <div className="card">
            {editing ? (
              <>
                {editStages.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: i < editStages.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <GripVertical size={14} style={{ color: '#6B6580', cursor: 'grab', flexShrink: 0 }} />
                    <span style={{ color: '#6B6580', fontSize: 11, width: 20, textAlign: 'center' }}>{i + 1}</span>
                    <input type="color" value={s.color || '#FFB300'} onChange={e => updateStage(i, 'color', e.target.value)} style={{ width: 30, height: 30, border: 'none', cursor: 'pointer', borderRadius: 4, flexShrink: 0 }} />
                    <input className="input" value={s.name || ''} onChange={e => updateStage(i, 'name', e.target.value)} placeholder="Nome da etapa" style={{ flex: 1, padding: '6px 10px' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', color: '#6B6580' }}>
                      <input type="checkbox" checked={!!s.is_terminal} onChange={e => updateStage(i, 'is_terminal', e.target.checked ? 1 : 0)} /> Final
                    </label>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeStage(i)}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={addStage}><Plus size={12} /> Adicionar Etapa</button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stages.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < stages.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <span style={{ color: '#6B6580', fontSize: 11, width: 20, textAlign: 'center' }}>{i + 1}</span>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: '#6B6580' }}>{s.slug}</span>
                    {s.is_terminal ? <span style={{ fontSize: 9, background: '#FF6B6B20', color: '#FF6B6B', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>FINAL</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
