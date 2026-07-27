import React, { useState } from 'react'

export default function Configuracoes({ cfg, onSalvar }) {
  const [form, setForm] = useState(cfg)
  const [salvo, setSalvo] = useState(false)

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setSalvo(false)
  }

  async function salvar() {
    await onSalvar(form)
    setSalvo(true)
  }

  return (
    <div className="tela">
      <h1>Configuracoes</h1>
      <div className="card">
        <p className="muted">
          Credenciais da Connected App do Anypoint. Ficam salvas localmente e sao
          usadas pelas telas de CloudHub. Nada fica fixo no codigo.
        </p>
        <div className="form">
          <label>Ambiente
            <input value={form.environment || ''} onChange={(e) => set('environment', e.target.value)} placeholder="Dev" />
          </label>
          <label>Client ID
            <input value={form.client_id || ''} onChange={(e) => set('client_id', e.target.value)} placeholder="seu client_id" />
          </label>
          <label>Client Secret
            <input type="password" value={form.client_secret || ''} onChange={(e) => set('client_secret', e.target.value)} placeholder="seu client_secret" />
          </label>
        </div>
        <div className="acoes">
          <button className="btn primary" onClick={salvar}>Salvar credenciais</button>
          {salvo && <span className="ok-msg">Salvo!</span>}
        </div>
      </div>
    </div>
  )
}
