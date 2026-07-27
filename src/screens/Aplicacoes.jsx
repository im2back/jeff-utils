import React, { useState } from 'react'

export default function Aplicacoes({ cfg }) {
  const [apps, setApps] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('')

  async function listar() {
    setErro('')
    setCarregando(true)
    setApps([])
    try {
      if (!window.api) { setErro('Bridge indisponivel (rode via Electron, nao pelo navegador).'); return }
      if (!cfg.client_id || !cfg.client_secret) {
        setErro('Preencha Client ID e Client Secret em Configuracoes.')
        return
      }
      const args = [
        'runtime-mgr:application:list',
        '--environment', cfg.environment || 'Dev',
        '--client_id', cfg.client_id,
        '--client_secret', cfg.client_secret,
        '--output', 'json'
      ]
      const r = await window.api.cli.run(args)
      if (r.code !== 0) {
        setErro('Falha no CLI (codigo ' + r.code + '):\n' + (r.stderr || r.stdout || 'sem detalhe'))
        return
      }
      let dados
      try { dados = JSON.parse(r.stdout) } catch (e) {
        setErro('Nao consegui interpretar a saida como JSON:\n' + r.stdout.slice(0, 500))
        return
      }
      setApps(Array.isArray(dados) ? dados : [])
    } catch (e) {
      setErro(String(e && e.message || e))
    } finally {
      setCarregando(false)
    }
  }

  const lista = apps.filter((a) => {
    if (!filtro) return true
    const t = (a.name || '') + ' ' + (a.id || '') + ' ' + (a.status || '')
    return t.toLowerCase().includes(filtro.toLowerCase())
  })

  return (
    <div className="tela">
      <h1>CloudHub · Aplicacoes</h1>

      <div className="barra-acoes">
        <button className="btn primary" onClick={listar} disabled={carregando}>
          {carregando ? 'Consultando...' : 'Listar aplicacoes'}
        </button>
        <input
          className="input-filtro"
          placeholder="Filtrar por nome/status..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <span className="muted contador">{lista.length} app(s)</span>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <div className="card sem-padding">
        <table className="tabela">
          <thead>
            <tr>
              <th>App</th>
              <th>Status</th>
              <th>Atualizado</th>
              <th>App ID</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && !carregando && (
              <tr><td colSpan="4" className="vazio">Nenhuma aplicacao. Clique em "Listar aplicacoes".</td></tr>
            )}
            {lista.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.name}</td>
                <td>
                  <span className={'badge ' + (a.status === 'APPLIED' || a.status === 'RUNNING' ? 'ok' : 'warn')}>
                    {a.status || '-'}
                  </span>
                </td>
                <td className="muted">{fmtData(a.lastModifiedDate)}</td>
                <td className="mono muted">{a.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtData(v) {
  if (!v) return '-'
  try {
    const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString()
  } catch (e) { return '-' }
}
