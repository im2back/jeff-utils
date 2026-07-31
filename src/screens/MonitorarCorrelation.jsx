import React, { useEffect, useRef, useState } from 'react'
import { parseEntries } from '../util/logs.js'

const INTERVALO_MS = 10000
const MAX = 2000
const TODAS_APIS = '__todas__'

function agoraLocalStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

function nivelDoLog(texto) {
  const match = String(texto || '').match(
    /^\d{4}-\d{2}-\d{2}T\S+\s+(INFO|ERROR)\b/i
  )
  return match ? match[1].toUpperCase() : ''
}

export default function MonitorarCorrelation({ cfg }) {
  const [correlationId, setCorrelationId] = useState('')
  const [apps, setApps] = useState([])
  const [apiIds, setApiIds] = useState([TODAS_APIS])
  const [menuApisAberto, setMenuApisAberto] = useState(false)
  const [inicioInput, setInicioInput] = useState('')
  const [ordem, setOrdem] = useState('desc')
  const [rodando, setRodando] = useState(false)
  const [entries, setEntries] = useState([])
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('')

  const alvos = useRef([])       // [{id, name, spec}]
  const seen = useRef(new Set())
  const acc = useRef([])         // acumulado das linhas que casaram
  const timer = useRef(null)
  const inicioUtc = useRef(null)
  const cfgAtual = useRef(null)
  const geracao = useRef(0)
  const cicloEmAndamento = useRef(false)
  const carregandoApps = useRef(null)
  const seletorApis = useRef(null)

  useEffect(() => {
    carregarApps(false)
    return () => {
      geracao.current++
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  useEffect(() => {
    function fecharMenuApis(e) {
      if (seletorApis.current && !seletorApis.current.contains(e.target)) {
        setMenuApisAberto(false)
      }
    }
    document.addEventListener('mousedown', fecharMenuApis)
    return () => document.removeEventListener('mousedown', fecharMenuApis)
  }, [])

  async function carregarApps(mostrarStatus = true) {
    if (!window.api) {
      setErro('Bridge indisponivel (rode via Electron).')
      return null
    }
    if (carregandoApps.current) return carregandoApps.current

    if (mostrarStatus) setStatus('carregando APIs...')
    setErro('')
    carregandoApps.current = (async () => {
      const r = await window.api.mule.apps(cfg)
      if (r.error) {
        setErro(r.error)
        if (mostrarStatus) setStatus('')
        return null
      }
      const lista = (r.apps || [])
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setApps(lista)
      setApiIds((atuais) => {
        if (atuais.includes(TODAS_APIS)) return [TODAS_APIS]
        const validas = atuais.filter((id) => lista.some((a) => a.id === id))
        return validas.length ? validas : [TODAS_APIS]
      })
      if (mostrarStatus) setStatus('')
      return lista
    })()

    try {
      return await carregandoApps.current
    } finally {
      carregandoApps.current = null
    }
  }

  async function buscar() {
    setErro('')
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    const cid = correlationId.trim()
    if (!cid) { setErro('Informe o correlation ID.'); return }

    const inicio = inicioInput ? new Date(inicioInput) : new Date()
    if (isNaN(inicio.getTime())) {
      setErro('Data/hora inicial invalida.')
      return
    }

    if (timer.current) clearInterval(timer.current)
    timer.current = null
    const buscaAtual = ++geracao.current
    cfgAtual.current = { ...cfg }
    setMenuApisAberto(false)
    setRodando(true)
    setStatus('preparando APIs...')

    const lista = apps.length ? apps : await carregarApps(false)
    if (geracao.current !== buscaAtual) return
    if (!lista) {
      setRodando(false)
      setStatus('')
      return
    }

    const todasSelecionadas = apiIds.includes(TODAS_APIS)
    const selecionadas = todasSelecionadas
      ? lista
      : lista.filter((a) => apiIds.includes(a.id))
    if (!selecionadas.length) {
      finalizarComErro('Selecione pelo menos uma API.', buscaAtual)
      return
    }

    const novos = []
    for (let i = 0; i < selecionadas.length; i++) {
      if (geracao.current !== buscaAtual) return
      const a = selecionadas[i]
      setStatus('preparando API ' + (i + 1) + ' de ' + selecionadas.length + '...')
      const s = await window.api.mule.spec(cfgAtual.current, a.id)
      if (s.spec) novos.push({ id: a.id, name: a.name, spec: s.spec })
    }
    if (geracao.current !== buscaAtual) return
    if (!novos.length) {
      finalizarComErro(
        todasSelecionadas
          ? 'Nenhuma API com specID no ambiente.'
          : 'As APIs selecionadas nao possuem specID.',
        buscaAtual
      )
      return
    }

    alvos.current = novos
    inicioUtc.current = inicio
    seen.current = new Set()
    acc.current = []
    setEntries([])
    setStatus(
      'monitorando ' + novos.length + ' API(s) desde ' + inicio.toLocaleString()
    )
    await ciclo(cid, buscaAtual)
    if (geracao.current !== buscaAtual) return
    timer.current = setInterval(() => ciclo(cid, buscaAtual), INTERVALO_MS)
  }

  function parar() {
    geracao.current++
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setRodando(false)
    setStatus('parado')
  }

  function finalizarComErro(mensagem, buscaAtual) {
    if (geracao.current !== buscaAtual) return
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setErro(mensagem)
    setStatus('')
    setRodando(false)
  }

  async function ciclo(cid, buscaAtual) {
    if (cicloEmAndamento.current || geracao.current !== buscaAtual) return
    cicloEmAndamento.current = true
    let mudou = false
    try {
      for (const alvo of alvos.current) {
        if (geracao.current !== buscaAtual) return
        try {
          const r = await window.api.logs.fetch(cfgAtual.current, alvo.id, alvo.spec)
          if (geracao.current !== buscaAtual) return
          const novas = parseEntries(r.lines || [])
          for (const en of novas) {
            if (en.ts < inicioUtc.current || !en.texto.includes(cid)) continue
            const key = JSON.stringify([alvo.id, en.ts.getTime(), en.texto])
            if (seen.current.has(key)) continue
            seen.current.add(key)
            acc.current.push({
              chave: key,
              app: alvo.name,
              nivel: nivelDoLog(en.texto),
              ts: en.ts,
              texto: en.texto
            })
            mudou = true
          }
        } catch (e) { /* ignora API com erro no ciclo */ }
      }
      if (mudou && geracao.current === buscaAtual) {
        acc.current.sort((a, b) => b.ts - a.ts) // mais novo no topo
        if (acc.current.length > MAX) acc.current = acc.current.slice(0, MAX)
        setEntries(acc.current.slice())
      }
    } finally {
      cicloEmAndamento.current = false
    }
  }

  function alternarApi(id) {
    setApiIds((atuais) => {
      if (id === TODAS_APIS) {
        return atuais.includes(TODAS_APIS) ? [] : [TODAS_APIS]
      }
      const semTodas = atuais.filter((item) => item !== TODAS_APIS)
      return semTodas.includes(id)
        ? semTodas.filter((item) => item !== id)
        : [...semTodas, id]
    })
  }

  const todasSelecionadas = apiIds.includes(TODAS_APIS)
  const appsSelecionadas = apps.filter((a) => apiIds.includes(a.id))
  const resumoApis = todasSelecionadas
    ? 'Todas as APIs'
    : appsSelecionadas.length === 0
      ? 'Selecione as APIs'
      : appsSelecionadas.length === 1
        ? appsSelecionadas[0].name
        : appsSelecionadas.length + ' APIs selecionadas'
  const nomesSelecionados = todasSelecionadas
    ? 'Todas as APIs'
    : appsSelecionadas.map((a) => a.name).join(', ')
  const escopoTxt = todasSelecionadas
    ? 'todas as APIs do ambiente'
    : appsSelecionadas.length === 1
      ? 'somente ' + appsSelecionadas[0].name
      : appsSelecionadas.length + ' APIs selecionadas'
  const entriesExibidas = ordem === 'asc' ? entries.slice().reverse() : entries

  return (
    <div className="tela">
      <h1>CloudHub · Monitorar por Correlation ID</h1>

      <div className="barra-acoes correlation-filtros">
        <input
          className="input-filtro correlation-input"
          placeholder="Cole o correlation ID (ex: 3d6b5a50-7a3f-11f1-...)"
          value={correlationId}
          onChange={(e) => setCorrelationId(e.target.value)}
          disabled={rodando}
        />
        <div className="api-multi" ref={seletorApis}>
          <span className="api-multi-label">APIs:</span>
          <button
            type="button"
            className="api-multi-trigger"
            onClick={() => setMenuApisAberto((aberto) => !aberto)}
            disabled={rodando}
            title={nomesSelecionados}
            aria-expanded={menuApisAberto}
          >
            <span>{resumoApis}</span>
            <span aria-hidden="true">{menuApisAberto ? '▲' : '▼'}</span>
          </button>
          {menuApisAberto && !rodando && (
            <div className="api-multi-menu">
              <label className="api-multi-opcao api-multi-todas">
                <input
                  type="checkbox"
                  checked={todasSelecionadas}
                  onChange={() => alternarApi(TODAS_APIS)}
                />
                <span>Todas as APIs</span>
              </label>
              <div className="api-multi-separador" />
              {apps.map((a) => (
                <label className="api-multi-opcao" key={a.id}>
                  <input
                    type="checkbox"
                    checked={!todasSelecionadas && apiIds.includes(a.id)}
                    onChange={() => alternarApi(a.id)}
                  />
                  <span>{a.name}</span>
                </label>
              ))}
              {apps.length === 0 && (
                <div className="api-multi-vazio">Nenhuma API carregada.</div>
              )}
            </div>
          )}
        </div>
        <button className="btn small" onClick={() => carregarApps(true)} disabled={rodando} title="recarregar lista de APIs">
          recarregar
        </button>
      </div>

      <div className="barra-acoes correlation-filtros">
        <label className="filtro-inicio">A partir de:
          <input
            type="datetime-local"
            step="1"
            value={inicioInput}
            onChange={(e) => setInicioInput(e.target.value)}
            disabled={rodando}
          />
        </label>
        <button
          className="btn small"
          onClick={() => setInicioInput(agoraLocalStr())}
          disabled={rodando}
          title="preencher com a data e hora atuais"
        >
          agora
        </button>
        {!rodando && <button className="btn primary" onClick={buscar} disabled={!correlationId.trim()}>Buscar</button>}
        {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
        <span className="muted">{status}</span>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Monitora {escopoTxt} e mostra apenas as linhas com o correlation ID.
        Se a data/hora ficar vazia, o monitoramento comeca no momento da busca.
        {ordem === 'desc' ? ' Mais novo no topo.' : ' Mais antigo no topo.'}
      </p>

      <div className="barra-acoes correlation-visualizacao">
        <label className="filtro-inicio">Ordenar:
          <select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="desc">Mais recentes primeiro</option>
            <option value="asc">Mais antigos primeiro</option>
          </select>
        </label>
        <span className="muted contador">{entries.length} linha(s)</span>
      </div>

      <div className="card sem-padding log-box correlation-log-box">
        {entries.length === 0 && <div className="vazio" style={{ padding: 20 }}>Nenhuma linha ainda. Informe um correlation ID e clique em Buscar.</div>}
        {entriesExibidas.map((e) => (
          <div key={e.chave || (e.app + '|' + e.ts.getTime() + '|' + e.texto)} className="log-linha">
            <span className="log-ts">{e.ts.toLocaleString()}</span>
            <span className="badge ok tag-app">{e.app}</span>
            {e.nivel && (
              <span className={'nivel-tag ' + e.nivel.toLowerCase()}>{e.nivel}</span>
            )}
            <span className="log-msg">{e.texto}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
