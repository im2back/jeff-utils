import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { parseEntries, extractJson } from '../util/logs.js'

export const DEFAULT_APP = 'process-api-3s-sales'
const CAMPO_CRITICO = 'erroCritico'
const CAMPO_ETAPA = 'etapa'
const CAMPO_CORRELATION = 'correlationId'
export const INTERVALO_MS = 5000
export const JANELA_PARADO_S = 300
const MAX_IDS = 1000
const TICK_MS = 200

function agoraLocalStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes())
}

const Ctx = createContext(null)
export function usePainel() { return useContext(Ctx) }

function criarSessao(app) {
  return {
    appId: app.id || null,
    appNome: app.name,
    rodando: false,
    statusTxt: '',
    erro: '',
    inicioInput: agoraLocalStr(),
    inicioTxt: '',
    progresso: 0,
    estado: {},
    expandido: {},
    eventosProcessados: new Set(),
    startUtc: null,
    spec: null,
    timerPoll: null,
    timerTick: null,
    ultimoCiclo: 0,
    cfg: null,
    polling: false,
    geracao: 0
  }
}

// Provider no topo do app: cada aplicacao tem uma sessao independente e
// continua sendo monitorada mesmo quando outra tela ou aplicacao e selecionada.
export function PainelErrosProvider({ children }) {
  const [apps, setApps] = useState([])
  const [appNome, setAppNomeState] = useState(DEFAULT_APP)
  const [carregandoListaApps, setCarregandoListaApps] = useState(false)
  const [, setVersao] = useState(0)
  const sessoes = useRef(new Map([[DEFAULT_APP, criarSessao({ name: DEFAULT_APP })]]))
  const appSelecionada = useRef(DEFAULT_APP)
  const carregandoApps = useRef(null)

  function obterSessao(nome, app) {
    let sessao = sessoes.current.get(nome)
    if (!sessao) {
      sessao = criarSessao(app || { name: nome })
      sessoes.current.set(nome, sessao)
    } else if (app && app.id) {
      sessao.appId = app.id
    }
    return sessao
  }

  function redesenhar(nome, sempre = false) {
    if (sempre || appSelecionada.current === nome) setVersao((v) => v + 1)
  }

  function setAppNome(nome) {
    const app = apps.find((a) => a.name === nome)
    obterSessao(nome, app)
    appSelecionada.current = nome
    setAppNomeState(nome)
  }

  async function carregarApps(cfg) {
    if (!window.api) {
      const sessao = obterSessao(appSelecionada.current)
      sessao.erro = 'Bridge indisponivel (rode via Electron).'
      redesenhar(sessao.appNome)
      return
    }
    if (carregandoApps.current) return carregandoApps.current

    setCarregandoListaApps(true)
    carregandoApps.current = (async () => {
      const r = await window.api.mule.apps(cfg)
      if (r && r.error) {
        const sessao = obterSessao(appSelecionada.current)
        sessao.erro = r.error
        redesenhar(sessao.appNome)
        return
      }
      if (!r || !r.apps) return

      const recebidas = r.apps
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
      recebidas.forEach((app) => obterSessao(app.name, app))

      // Uma aplicacao monitorada continua acessivel no seletor mesmo se uma
      // recarga temporariamente nao a devolver.
      const nomes = new Set(recebidas.map((a) => a.name))
      const ativas = Array.from(sessoes.current.values())
        .filter((s) => s.rodando && !nomes.has(s.appNome))
        .map((s) => ({ id: s.appId, name: s.appNome }))
      const lista = recebidas.concat(ativas)
      setApps(lista)

      const atual = appSelecionada.current
      if (!lista.some((a) => a.name === atual)) {
        const def = lista.find((a) => a.name === DEFAULT_APP)
        const proxima = def ? def.name : (lista[0] ? lista[0].name : atual)
        obterSessao(proxima, def || lista[0])
        appSelecionada.current = proxima
        setAppNomeState(proxima)
      }
    })()

    try {
      await carregandoApps.current
    } finally {
      carregandoApps.current = null
      setCarregandoListaApps(false)
    }
  }

  async function iniciar(cfg) {
    const nome = appSelecionada.current
    const sessao = obterSessao(nome, apps.find((a) => a.name === nome))
    if (sessao.rodando) return

    sessao.erro = ''
    if (!window.api) {
      sessao.erro = 'Bridge indisponivel (rode via Electron).'
      redesenhar(nome)
      return
    }

    sessao.geracao++
    const geracao = sessao.geracao
    sessao.rodando = true
    sessao.statusTxt = 'localizando app...'
    sessao.progresso = 0
    sessao.cfg = { ...cfg }
    redesenhar(nome, true)

    const r = await window.api.mule.apps(cfg)
    if (sessao.geracao !== geracao || !sessao.rodando) return
    if (r.error) {
      sessao.erro = r.error
      finalizarComErro(sessao)
      return
    }
    const app = (r.apps || []).find((a) => a.name === nome)
    if (!app) {
      sessao.erro = 'App nao encontrado: ' + nome
      finalizarComErro(sessao)
      return
    }

    sessao.appId = app.id
    sessao.statusTxt = 'obtendo specID...'
    redesenhar(nome)
    const s = await window.api.mule.spec(cfg, app.id)
    if (sessao.geracao !== geracao || !sessao.rodando) return
    if (s.error || !s.spec) {
      sessao.erro = s.error || 'sem specID'
      finalizarComErro(sessao)
      return
    }

    sessao.spec = s.spec
    const dIni = sessao.inicioInput ? new Date(sessao.inicioInput) : new Date()
    sessao.startUtc = isNaN(dIni.getTime()) ? new Date() : dIni
    sessao.inicioTxt = sessao.startUtc.toLocaleString()
    sessao.eventosProcessados = new Set()
    sessao.estado = {}
    sessao.expandido = {}
    sessao.statusTxt = 'monitorando...'
    sessao.ultimoCiclo = Date.now()
    redesenhar(nome)

    await ciclo(nome, geracao)
    if (sessao.geracao !== geracao || !sessao.rodando) return
    sessao.timerPoll = setInterval(() => ciclo(nome, geracao), INTERVALO_MS)
    sessao.timerTick = setInterval(() => {
      if (sessao.geracao !== geracao || !sessao.rodando) return
      const el = Date.now() - sessao.ultimoCiclo
      sessao.progresso = Math.min(1, el / INTERVALO_MS)
      redesenhar(nome)
    }, TICK_MS)
  }

  function parar() {
    const nome = appSelecionada.current
    const sessao = obterSessao(nome)
    sessao.geracao++
    limparTimers(sessao)
    sessao.rodando = false
    sessao.statusTxt = 'parado'
    sessao.progresso = 0
    redesenhar(nome, true)
  }

  function finalizarComErro(sessao) {
    limparTimers(sessao)
    sessao.rodando = false
    sessao.statusTxt = ''
    sessao.progresso = 0
    redesenhar(sessao.appNome, true)
  }

  function limparTimers(sessao) {
    if (sessao.timerPoll) clearInterval(sessao.timerPoll)
    if (sessao.timerTick) clearInterval(sessao.timerTick)
    sessao.timerPoll = null
    sessao.timerTick = null
  }

  async function ciclo(nome, geracao) {
    const sessao = sessoes.current.get(nome)
    if (!sessao || !sessao.rodando || sessao.geracao !== geracao || sessao.polling) return
    sessao.polling = true
    try {
      const r = await window.api.logs.fetch(sessao.cfg, sessao.appId, sessao.spec)
      if (sessao.geracao !== geracao || !sessao.rodando) return
      const lines = r.lines || []
      // O download devolve um snapshot que pode girar, diminuir ou mudar de
      // arquivo entre ciclos. Reprocessamos o snapshot e usamos a identidade
      // do evento para impedir que uma mesma entrada seja contabilizada outra vez.
      const novas = parseEntries(lines)
      Object.values(sessao.estado).forEach((e) => { e.novo = false })
      for (const en of novas) {
        if (en.ts < sessao.startUtc) continue
        const js = extractJson(en.texto)
        if (!js) continue
        let obj
        try { obj = JSON.parse(js) } catch (e) { continue }
        if (!(CAMPO_CRITICO in obj)) continue
        const critico = obj[CAMPO_CRITICO] === true || String(obj[CAMPO_CRITICO]).toLowerCase() === 'true'
        const etapa = (obj[CAMPO_ETAPA] != null && obj[CAMPO_ETAPA] !== '') ? String(obj[CAMPO_ETAPA]) : '(sem etapa)'
        const cid = obj[CAMPO_CORRELATION] != null ? String(obj[CAMPO_CORRELATION]) : '(sem correlationId)'
        const assinatura = JSON.stringify([en.ts.getTime(), critico, etapa, cid])
        if (sessao.eventosProcessados.has(assinatura)) continue
        sessao.eventosProcessados.add(assinatura)
        const key = critico + '|' + etapa
        if (!sessao.estado[key]) sessao.estado[key] = { critico, etapa, count: 0, first: en.ts, last: en.ts, novo: false, ids: [] }
        const e = sessao.estado[key]
        e.count++
        if (en.ts > e.last) e.last = en.ts
        if (en.ts < e.first) e.first = en.ts
        e.novo = true
        e.ids.push({ cid, ts: en.ts })
        if (e.ids.length > MAX_IDS) e.ids = e.ids.slice(-MAX_IDS)
      }
    } catch (e) { /* ignora ciclo com erro */ }
    finally {
      sessao.polling = false
      if (sessao.geracao === geracao && sessao.rodando) {
        sessao.ultimoCiclo = Date.now()
        sessao.progresso = 0
        redesenhar(nome)
      }
    }
  }

  function setInicioInput(valor) {
    const sessao = obterSessao(appSelecionada.current)
    if (sessao.rodando) return
    sessao.inicioInput = valor
    redesenhar(sessao.appNome)
  }

  function toggleExpandido(k) {
    const sessao = obterSessao(appSelecionada.current)
    sessao.expandido = { ...sessao.expandido, [k]: !sessao.expandido[k] }
    redesenhar(sessao.appNome)
  }

  useEffect(() => () => {
    sessoes.current.forEach((sessao) => {
      sessao.geracao++
      limparTimers(sessao)
      sessao.rodando = false
    })
  }, [])

  const atual = obterSessao(appNome, apps.find((a) => a.name === appNome))
  const appsMonitoradas = Array.from(sessoes.current.values())
    .filter((s) => s.rodando)
    .map((s) => s.appNome)

  const value = {
    rodando: atual.rodando,
    apps,
    carregandoListaApps,
    appsMonitoradas,
    appNome,
    setAppNome,
    inicioInput: atual.inicioInput,
    setInicioInput,
    agoraLocalStr,
    statusTxt: atual.statusTxt,
    erro: atual.erro,
    inicioTxt: atual.inicioTxt,
    progresso: atual.progresso,
    estado: atual.estado,
    expandido: atual.expandido,
    toggleExpandido,
    carregarApps, iniciar, parar
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
