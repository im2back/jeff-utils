import React, { useEffect, useMemo, useRef, useState } from 'react'

const MAX_CHARS = 200000

function lsGet(k) { try { return localStorage.getItem(k) || '' } catch (e) { return '' } }

// detecta o nivel de um bloco de log (INFO / WARN / ERROR)
function nivelDe(bloco) {
  const m = bloco.match(/^LOG\s+\d+\s+\[(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\]/i)
  if (m) return m[1].toUpperCase()
  if (/"erroCritico"\s*:\s*true/.test(bloco) || /failed:/i.test(bloco) || /Exception/.test(bloco) || /unauthorized|bad request|RETRY_EXHAUSTED/i.test(bloco)) return 'ERROR'
  if (/"erroCritico"\s*:\s*false/.test(bloco)) return 'WARN'
  return 'INFO'
}
function classeNivel(n) {
  if (n === 'ERROR' || n === 'FATAL') return 'error'
  if (n === 'WARN') return 'warn'
  return 'info'
}
function parseEntradas(texto) {
  if (!texto) return []
  return texto.split(/(?=^LOG \d+ )/m).map((b) => b.replace(/\s+$/, '')).filter((b) => b.length).map((b) => ({ nivel: nivelDe(b), texto: b }))
}

export default function LogLocal() {
  const [projeto, setProjeto] = useState(() => lsGet('loglocal_projeto'))
  const [logFile, setLogFile] = useState(() => lsGet('loglocal_arquivo'))
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState(false)
  const [texto, setTexto] = useState('')
  const [zerar, setZerar] = useState(true)

  const offset = useRef(0)
  const timer = useRef(null)
  const boxRef = useRef(null)
  const seguir = useRef(true)

  useEffect(() => { try { localStorage.setItem('loglocal_projeto', projeto) } catch (e) {} }, [projeto])
  useEffect(() => { try { localStorage.setItem('loglocal_arquivo', logFile) } catch (e) {} }, [logFile])
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  // auto-scroll para o fim SO se o usuario ja estiver acompanhando o final
  useEffect(() => { const el = boxRef.current; if (el && seguir.current) el.scrollTop = el.scrollHeight }, [texto])

  function onScroll(e) {
    const el = e.target
    seguir.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 40
  }
  async function limparAoVivo() {
    try { if (logFile) await window.api.mule.clearLog(logFile) } catch (e) {}
    offset.current = 0
    seguir.current = true
    setTexto('')
  }

  async function escolher() { if (!window.api) return; const p = await window.api.dialog.openFolder(); if (p) setProjeto(p) }

  async function configurar() {
    setErro(''); setMsg('')
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    if (!projeto) { setErro('Informe a pasta do projeto.'); return }
    const r = await window.api.mule.configurarLog({ projetoRoot: projeto })
    if (r.error) { setErro(r.error); return }
    setLogFile(r.logFile)
    setMsg('Configurado! log4j2 injetado. Backup: ' + r.backup)
  }

  async function reverter() {
    setErro(''); setMsg('')
    if (!projeto) { setErro('Informe a pasta do projeto.'); return }
    if (!window.confirm('Reverter o log4j2 para o ORIGINAL e apagar o arquivo de log?')) return
    const r = await window.api.mule.reverterLog({ projetoRoot: projeto })
    if (r.error) { setErro(r.error); return }
    setMsg('Revertido. Original restaurado.' + (r.logRemovido ? ' Arquivo de log apagado.' : ''))
  }

  async function iniciar() {
    setErro('')
    if (!logFile) { setErro('Configure primeiro, ou informe o caminho do arquivo de log.'); return }
    if (zerar) { try { await window.api.mule.clearLog(logFile) } catch (e) {} }
    offset.current = 0
    seguir.current = true
    setTexto('')
    setRodando(true)
    await ciclo()
    timer.current = setInterval(ciclo, 1000)
  }
  function parar() { if (timer.current) clearInterval(timer.current); timer.current = null; setRodando(false) }

  async function ciclo() {
    try {
      const r = await window.api.mule.readLog({ caminho: logFile, offset: offset.current })
      if (r.erro) return
      if (typeof r.size === 'number') offset.current = r.size
      if (r.data) {
        setTexto((t) => { const novo = t + r.data; return novo.length > MAX_CHARS ? novo.slice(-MAX_CHARS) : novo })
      }
    } catch (e) { /* ignora ciclo com erro */ }
  }

  const entradas = useMemo(() => parseEntradas(texto), [texto])

  return (
    <div className="tela">
      <h1>MuleSoft · Log local</h1>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Injeta um log4j2 formatado no projeto (backup do original), cria o arquivo de log local
          e acompanha ao vivo. Use "Reverter" para restaurar o log4j2 original.
        </p>
        <div className="form">
          <label>Pasta RAIZ do projeto Mule
            <div className="linha-input">
              <input value={projeto} onChange={(e) => { setProjeto(e.target.value); setMsg('') }} placeholder="C:\Projetos\process-api-3s-sales" disabled={rodando} />
              <button className="btn" onClick={escolher} disabled={rodando}>Escolher...</button>
            </div>
          </label>
        </div>
        <div className="acoes">
          <button className="btn primary" onClick={configurar} disabled={rodando}>Configurar (injetar log4j2)</button>
          <button className="btn danger" onClick={reverter} disabled={rodando}>Reverter (restaurar original)</button>
          {msg && <span className="ok-msg">{msg}</span>}
        </div>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <div className="card">
        <div className="form">
          <label>Arquivo de log a monitorar
            <input value={logFile} onChange={(e) => setLogFile(e.target.value)} placeholder="C:\temp\mule-logs\seu-projeto.log" disabled={rodando} />
          </label>
        </div>
        <div className="acoes">
          <label className="check-inline"><input type="checkbox" checked={zerar} onChange={(e) => setZerar(e.target.checked)} disabled={rodando} /> zerar ao iniciar</label>
          {!rodando && <button className="btn primary" onClick={iniciar} disabled={!logFile}>Monitorar</button>}
          {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
          <button className="btn" onClick={limparAoVivo} disabled={!logFile} title="apaga a tela e zera o arquivo; a proxima request aparece do zero">Limpar (zerar ao vivo)</button>
          {logFile && <button className="btn" onClick={() => window.api.shell.openPath(logFile.replace(/[^\\\/]+$/, ''))}>Abrir pasta</button>}
        </div>
      </div>

      <div className="card sem-padding log-box" ref={boxRef} onScroll={onScroll}>
        {entradas.length === 0 && <div className="vazio" style={{ padding: 20 }}>Sem conteudo ainda. Configure, rode o projeto no Studio e clique em Monitorar.</div>}
        {entradas.map((e, i) => (
          <div key={i} className="log-entry">
            <span className={'nivel-tag ' + classeNivel(e.nivel)}>{e.nivel}</span>
            <pre className="log-tail">{e.texto}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}
