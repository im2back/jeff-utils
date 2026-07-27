import React, { createContext, useContext, useRef, useState } from 'react'
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

// Provider no topo do app: o monitoramento continua mesmo trocando de tela.
export function PainelErrosProvider({ children }) {
  const [rodando, setRodando] = useState(false)
  const [apps, setApps] = useState([])
  const [appNome, setAppNome] = useState(DEFAULT_APP)
  const [inicioInput, setInicioInput] = useState(agoraLocalStr())
  const [statusTxt, setStatusTxt] = useState('')
  const [erro, setErro] = useState('')
  const [inicioTxt, setInicioTxt] = useState('')
  const [, setVersao] = useState(0)
  const [progresso, setProgresso] = useState(0)
  const [expandido, setExpandido] = useState({})

  const estado = useRef({})
  const lastCount = useRef(0)
  const startUtc = useRef(null)
  const spec = useRef(null)
  const appId = useRef(null)
  const timerPoll = useRef(null)
  const timerTick = useRef(null)
  const ultimoCiclo = useRef(0)
  const cfgRef = useRef(null)

  async function carregarApps(cfg) {
    cfgRef.current = cfg
    if (!window.api) return
    const r = await window.api.mule.apps(cfg)
    if (r && r.apps) {
      const lista = r.apps.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name))
      setApps(lista)
      setAppNome((prev) => {
        if (lista.some((a) => a.name === prev)) return prev
        const def = lista.find((a) => a.name === DEFAULT_APP)
        return def ? def.name : (lista[0] ? lista[0].name : prev)
      })
    }
  }

  async function iniciar(cfg) {
    cfgRef.current = cfg
    setErro('')
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    setStatusTxt('localizando app...')
    const r = await window.api.mule.apps(cfg)
    if (r.error) { setErro(r.error); setStatusTxt(''); return }
    const app = (r.apps || []).find((a) => a.name === appNome)
    if (!app) { setErro('App nao encontrado: ' + appNome); setStatusTxt(''); return }
    const s = await window.api.mule.spec(cfg, app.id)
    if (s.error || !s.spec) { setErro(s.error || 'sem specID'); setStatusTxt(''); return }
    appId.current = app.id
    spec.current = s.spec
    const dIni = inicioInput ? new Date(inicioInput) : new Date()
    startUtc.current = isNaN(dIni.getTime()) ? new Date() : dIni
    setInicioTxt(startUtc.current.toLocaleString())
    lastCount.current = 0
    estado.current = {}
    setRodando(true)
    setStatusTxt('monitorando...')
    ultimoCiclo.current = Date.now()
    setProgresso(0)
    await ciclo()
    timerPoll.current = setInterval(ciclo, INTERVALO_MS)
    timerTick.current = setInterval(() => {
      const el = Date.now() - ultimoCiclo.current
      setProgresso(Math.min(1, el / INTERVALO_MS))
    }, TICK_MS)
  }

  function parar() {
    if (timerPoll.current) clearInterval(timerPoll.current)
    if (timerTick.current) clearInterval(timerTick.current)
    timerPoll.current = null
    timerTick.current = null
    setRodando(false)
    setStatusTxt('parado')
    setProgresso(0)
  }

  async function ciclo() {
    try {
      const r = await window.api.logs.fetch(cfgRef.current, appId.current, spec.current)
      const lines = r.lines || []
      if (lines.length < lastCount.current) lastCount.current = 0
      const novas = parseEntries(lines, lastCount.current)
      lastCount.current = lines.length
      Object.values(estado.current).forEach((e) => { e.novo = false })
      for (const en of novas) {
        if (en.ts < startUtc.current) continue
        const js = extractJson(en.texto)
        if (!js) continue
        let obj
        try { obj = JSON.parse(js) } catch (e) { continue }
        if (!(CAMPO_CRITICO in obj)) continue
        const critico = obj[CAMPO_CRITICO] === true || String(obj[CAMPO_CRITICO]).toLowerCase() === 'true'
        const etapa = (obj[CAMPO_ETAPA] != null && obj[CAMPO_ETAPA] !== '') ? String(obj[CAMPO_ETAPA]) : '(sem etapa)'
        const cid = obj[CAMPO_CORRELATION] != null ? String(obj[CAMPO_CORRELATION]) : '(sem correlationId)'
        const key = critico + '|' + etapa
        if (!estado.current[key]) estado.current[key] = { critico, etapa, count: 0, first: en.ts, last: en.ts, novo: false, ids: [] }
        const e = estado.current[key]
        e.count++
        if (en.ts > e.last) e.last = en.ts
        if (en.ts < e.first) e.first = en.ts
        e.novo = true
        e.ids.push({ cid, ts: en.ts })
        if (e.ids.length > MAX_IDS) e.ids = e.ids.slice(-MAX_IDS)
      }
      ultimoCiclo.current = Date.now()
      setProgresso(0)
      setVersao((v) => v + 1)
    } catch (e) { /* ignora ciclo com erro */ }
  }

  function toggleExpandido(k) { setExpandido((x) => ({ ...x, [k]: !x[k] })) }

  const value = {
    rodando, apps, appNome, setAppNome, inicioInput, setInicioInput, agoraLocalStr,
    statusTxt, erro, inicioTxt, progresso, estado: estado.current,
    expandido, toggleExpandido,
    carregarApps, iniciar, parar
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
