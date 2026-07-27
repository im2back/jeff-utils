import React, { useEffect, useState } from 'react'

export default function Rede() {
  const [portas, setPortas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('')
  const [portaFechar, setPortaFechar] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { atualizar() }, [])

  async function atualizar() {
    setErro(''); setMsg(''); setCarregando(true)
    try {
      if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
      const r = await window.api.rede.listarPortas()
      if (r.error) setErro(r.error)
      else setPortas(r.portas || [])
    } catch (e) { setErro(String(e && e.message || e)) }
    finally { setCarregando(false) }
  }

  async function fechar(porta) {
    if (!window.confirm('Encerrar o processo que esta usando a porta ' + porta + '?')) return
    setMsg('')
    const r = await window.api.rede.fecharPorta(porta)
    setMsg(r.msg || r.error || '')
    atualizar()
  }

  async function fecharManual() {
    const p = (portaFechar || '').trim()
    if (!p) return
    await fechar(p)
    setPortaFechar('')
  }

  const lista = portas.filter((p) => {
    if (!filtro) return true
    const t = String(p.porta) + ' ' + (p.processo || '') + ' ' + (p.processId || '') + ' ' + (p.endereco || '')
    return t.toLowerCase().includes(filtro.toLowerCase())
  })

  return (
    <div className="tela">
      <h1>Rede · Portas em uso</h1>

      <div className="barra-acoes">
        <button className="btn primary" onClick={atualizar} disabled={carregando}>{carregando ? 'Atualizando...' : 'Atualizar'}</button>
        <input className="input-filtro" placeholder="Filtrar por porta/processo..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="muted contador">{lista.length} porta(s)</span>
      </div>

      <div className="barra-acoes">
        <label className="filtro-inicio">Encerrar porta:
          <input type="number" value={portaFechar} onChange={(e) => setPortaFechar(e.target.value)} placeholder="ex: 8081" style={{ width: 120 }} />
        </label>
        <button className="btn danger" onClick={fecharManual} disabled={!portaFechar}>Encerrar</button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <div className="card sem-padding">
        <table className="tabela">
          <thead>
            <tr><th>Porta</th><th>Endereco</th><th>PID</th><th>Processo</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && !carregando && <tr><td colSpan="5" className="vazio">Nenhuma porta em escuta (ou clique em Atualizar).</td></tr>}
            {lista.map((p, i) => (
              <tr key={i}>
                <td className="mono"><b>{p.porta}</b></td>
                <td className="muted mono">{p.endereco}</td>
                <td className="muted mono">{p.processId}</td>
                <td className="mono">{p.processo || '-'}</td>
                <td><button className="btn danger small" onClick={() => fechar(p.porta)}>Encerrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>Dica: encerrar processos de sistema pode exigir abrir o app como administrador.</p>
    </div>
  )
}
