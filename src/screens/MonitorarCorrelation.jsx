import React, { useEffect, useRef, useState } from 'react'
import { parseEntries } from '../util/logs.js'

const INTERVALO_MS = 10000
const MAX = 2000

export default function MonitorarCorrelation({ cfg }) {
  const [correlationId, setCorrelationId] = useState('')
  const [rodando, setRodando] = useState(false)
  const [entries, setEntries] = useState([])
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('')

  const alvos = useRef([])       // [{id, name, spec, lastCount}]
  const seen = useRef(new Set())
  const acc = useRef([])         // acumulado das linhas que casaram
  const timer = useRef(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  async function buscar() {
    setErro('')
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    const cid = correlationId.trim()
    if (!cid) { setErro('Informe o correlation ID.'); return }
    setStatus('preparando apps...')
    const r = await window.api.mule.apps(cfg)
    if (r.error) { setErro(r.error); setStatus(''); return }
    const lista = r.apps || []
    const novos = []
    for (const a of lista) {
      const s = await window.api.mule.spec(cfg, a.id)
      if (s.spec) novos.push({ id: a.id, name: a.name, spec: s.spec, lastCount: 0 })
    }
    if (!novos.length) { setErro('Nenhuma app com specID no ambiente.'); setStatus(''); return }
    alvos.current = novos
    seen.current = new Set()
    acc.current = []
    setEntries([])
    setRodando(true)
    setStatus('escutando ' + novos.length + ' app(s)...')
    await ciclo(cid)
    timer.current = setInterval(() => ciclo(cid), INTERVALO_MS)
  }

  function parar() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setRodando(false)
    setStatus('parado')
  }

  async function ciclo(cid) {
    let mudou = false
    for (const alvo of alvos.current) {
      try {
        const r = await window.api.logs.fetch(cfg, alvo.id, alvo.spec)
        const lines = r.lines || []
        if (lines.length < alvo.lastCount) alvo.lastCount = 0
        const novas = parseEntries(lines, alvo.lastCount)
        alvo.lastCount = lines.length
        for (const en of novas) {
          if (!en.texto.includes(cid)) continue
          const key = alvo.name + '|' + en.ts.getTime() + '|' + en.texto.length + '|' + en.texto.slice(0, 48)
          if (seen.current.has(key)) continue
          seen.current.add(key)
          acc.current.push({ app: alvo.name, ts: en.ts, texto: en.texto })
          mudou = true
        }
      } catch (e) { /* ignora app com erro no ciclo */ }
    }
    if (mudou) {
      acc.current.sort((a, b) => b.ts - a.ts) // mais novo no topo
      if (acc.current.length > MAX) acc.current = acc.current.slice(0, MAX)
      setEntries(acc.current.slice())
    }
  }

  return (
    <div className="tela">
      <h1>CloudHub · Monitorar por Correlation ID</h1>

      <div className="barra-acoes">
        <input
          className="input-filtro"
          style={{ maxWidth: 420 }}
          placeholder="Cole o correlation ID (ex: 3d6b5a50-7a3f-11f1-...)"
          value={correlationId}
          onChange={(e) => setCorrelationId(e.target.value)}
          disabled={rodando}
        />
        {!rodando && <button className="btn primary" onClick={buscar} disabled={!correlationId.trim()}>Buscar</button>}
        {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
        <span className="muted">{status}</span>
        <span className="muted contador">{entries.length} linha(s)</span>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Varre todas as apps do ambiente e mostra so as linhas que contem o correlation ID.
        Mais novo no topo. Continua escutando e reorganizando conforme novos logs chegam.
      </p>

      <div className="card sem-padding log-box">
        {entries.length === 0 && <div className="vazio" style={{ padding: 20 }}>Nenhuma linha ainda. Informe um correlation ID e clique em Buscar.</div>}
        {entries.map((e, i) => (
          <div key={i} className="log-linha">
            <span className="log-ts">{e.ts.toLocaleString()}</span>
            <span className="badge ok tag-app">{e.app}</span>
            <span className="log-msg">{e.texto}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
