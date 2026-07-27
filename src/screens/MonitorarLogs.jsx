import React, { useEffect, useRef, useState } from 'react'
import { parseEntries } from '../util/logs.js'

const INTERVALO_MS = 10000
const MAX_ENTRADAS = 1000

export default function MonitorarLogs({ cfg }) {
  const [apps, setApps] = useState([])
  const [appId, setAppId] = useState('')
  const [rodando, setRodando] = useState(false)
  const [entradas, setEntradas] = useState([])
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('')

  const timer = useRef(null)
  const lastCount = useRef(0)
  const startUtc = useRef(null)
  const spec = useRef(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  async function carregarApps() {
    setErro('')
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    setStatus('carregando apps...')
    const r = await window.api.mule.apps(cfg)
    setStatus('')
    if (r.error) { setErro(r.error); return }
    const lista = (r.apps || []).map((a) => ({ id: a.id, name: a.name }))
    setApps(lista)
    if (lista.length && !appId) setAppId(lista[0].id)
  }

  async function iniciar() {
    setErro('')
    if (!appId) { setErro('Selecione uma aplicacao.'); return }
    setStatus('obtendo specID...')
    const s = await window.api.mule.spec(cfg, appId)
    if (s.error || !s.spec) { setErro(s.error || 'sem specID'); setStatus(''); return }
    spec.current = s.spec
    startUtc.current = new Date()
    lastCount.current = 0
    setEntradas([])
    setRodando(true)
    setStatus('monitorando...')
    await ciclo()
    timer.current = setInterval(ciclo, INTERVALO_MS)
  }

  function parar() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setRodando(false)
    setStatus('parado')
  }

  async function ciclo() {
    try {
      const r = await window.api.logs.fetch(cfg, appId, spec.current)
      const lines = r.lines || []
      if (lines.length < lastCount.current) lastCount.current = 0 // arquivo trocou
      const novas = parseEntries(lines, lastCount.current)
      lastCount.current = lines.length
      const inicio = startUtc.current
      const filtradas = novas.filter((e) => e.ts >= inicio)
      if (filtradas.length) {
        setEntradas((prev) => {
          const juntas = prev.concat(filtradas.map((e) => ({ ts: e.ts, texto: e.texto })))
          return juntas.slice(-MAX_ENTRADAS)
        })
      }
    } catch (e) { /* ignora ciclo com erro */ }
  }

  const visiveis = entradas.filter((e) => !filtro || e.texto.toLowerCase().includes(filtro.toLowerCase()))
  const appNome = (apps.find((a) => a.id === appId) || {}).name

  return (
    <div className="tela">
      <h1>CloudHub · Monitorar logs</h1>

      <div className="barra-acoes">
        <button className="btn" onClick={carregarApps}>Carregar apps</button>
        <select className="input-filtro" value={appId} onChange={(e) => setAppId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">-- selecione a aplicacao --</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {!rodando && <button className="btn primary" onClick={iniciar} disabled={!appId}>Iniciar</button>}
        {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
        <span className="muted">{status}</span>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <div className="barra-acoes">
        <input className="input-filtro" placeholder="Filtrar texto..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="muted contador">{visiveis.length} linha(s){appNome ? ' · ' + appNome : ''}</span>
      </div>

      <div className="card sem-padding log-box">
        {visiveis.length === 0 && <div className="vazio" style={{ padding: 20 }}>Sem logs ainda. Inicie o monitoramento e gere atividade na app.</div>}
        {visiveis.map((e, i) => (
          <div key={i} className="log-linha">
            <span className="log-ts">{e.ts.toLocaleTimeString()}</span>
            <span className="log-msg">{e.texto}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
