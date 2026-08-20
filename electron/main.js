// Processo principal do Electron (backend com acesso ao sistema).
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const http = require('http')
const https = require('https')
const { spawn } = require('child_process')
const AdmZip = require('adm-zip')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0f172a',
    title: 'SLCLI Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// ---- helper: roda um comando e resolve {code,stdout,stderr} ----
function runCmd(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', done = false
    const child = spawn(cmd || 'anypoint-cli-v4', args || [], { shell: true, windowsHide: true })
    const timer = setTimeout(() => {
      if (!done) { done = true; try { child.kill() } catch (e) {} resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]' }) }
    }, timeoutMs || 120000)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { if (!done) { done = true; clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(err && err.message || err) }) } })
    child.on('close', (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr }) } })
  })
}
function tstamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
}
function credArgs(c) {
  return ['--environment', c.environment || 'Dev', '--client_id', c.client_id || '', '--client_secret', c.client_secret || '']
}

// ---- Config persistida ----
function configPath() { return path.join(app.getPath('userData'), 'config.json') }
ipcMain.handle('config:load', () => {
  try { const p = configPath(); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) {}
  return {}
})
ipcMain.handle('config:save', (_e, obj) => {
  try { fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2), 'utf8'); return { ok: true } }
  catch (e) { return { ok: false, error: String(e && e.message || e) } }
})

// ---- CLI generico ----
ipcMain.handle('cli:run', (_e, { cmd, args, timeoutMs }) => runCmd(cmd, args, timeoutMs))

// ---- Dialogs / shell ----
ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths.length) return null
  return r.filePaths[0]
})
ipcMain.handle('shell:openPath', (_e, p) => { if (p) shell.openPath(p); return true })

// ---- Mule: apps e specID ----
ipcMain.handle('mule:apps', async (_e, creds) => {
  const r = await runCmd('anypoint-cli-v4', ['runtime-mgr:application:list', ...credArgs(creds), '--output', 'json'])
  if (r.code !== 0) return { error: r.stderr || r.stdout || 'falha' }
  try { return { apps: JSON.parse(r.stdout) } } catch (e) { return { error: 'JSON invalido: ' + r.stdout.slice(0, 300) } }
})
ipcMain.handle('mule:spec', async (_e, { creds, appId }) => {
  const r = await runCmd('anypoint-cli-v4', ['runtime-mgr:application:describe', appId, ...credArgs(creds), '--output', 'json'])
  if (r.code !== 0) return { error: r.stderr || r.stdout || 'falha' }
  try { const d = JSON.parse(r.stdout); return { spec: d.desiredVersion || d.lastSuccessfulVersion } } catch (e) { return { error: 'JSON invalido' } }
})

// ---- Logs: download-logs + unzip -> linhas ----
ipcMain.handle('logs:fetch', async (_e, { creds, appId, spec }) => {
  try {
    const tmp = path.join(os.tmpdir(), 'slcli-logs')
    fs.mkdirSync(tmp, { recursive: true })
    const r = await runCmd('anypoint-cli-v4', ['runtime-mgr:application:download-logs', appId, spec, tmp, ...credArgs(creds)])
    const zips = fs.readdirSync(tmp).filter((f) => f.startsWith(appId + '-') && f.endsWith('.zip'))
      .map((f) => ({ f, t: fs.statSync(path.join(tmp, f)).mtimeMs })).sort((a, b) => b.t - a.t)
    if (!zips.length) return { lines: [], erro: (r.code !== 0 ? (r.stderr || r.stdout) : 'sem zip') }
    const zipPath = path.join(tmp, zips[0].f)
    const zip = new AdmZip(zipPath)
    let txt = ''
    for (const en of zip.getEntries()) { if (en.entryName.toLowerCase().endsWith('.txt')) { txt = en.getData().toString('utf8'); break } }
    try { fs.unlinkSync(zipPath) } catch (e) {}
    return { lines: txt.split(/\r?\n/) }
  } catch (err) { return { lines: [], erro: String(err && err.message || err) } }
})

// ---- Automacao de POST em lote ----
// Traduz uma falha de rede (fetch rejeitado = sem resposta HTTP) em algo legivel.
// O fetch do Node quase sempre devolve so "fetch failed"; a causa real vem em err.cause.
const MOTIVOS_REDE = {
  CONNECT_TIMEOUT: 'Timeout ao ABRIR a conexao (handshake nao completou no tempo configurado).',
  RESPONSE_TIMEOUT: 'Conexao aberta, mas o servidor nao devolveu a resposta no tempo configurado.',
  ECONNRESET: 'Conexao derrubada pelo servidor/rede no meio da requisicao (connection reset).',
  ECONNREFUSED: 'Conexao recusada: nada escutando nesse host/porta.',
  ETIMEDOUT: 'Tempo esgotado esperando o servidor (timeout de socket).',
  UND_ERR_CONNECT_TIMEOUT: 'Timeout ao ABRIR a conexao com o servidor (nao respondeu o handshake a tempo).',
  UND_ERR_HEADERS_TIMEOUT: 'Servidor aceitou a conexao mas nao enviou os headers de resposta a tempo.',
  UND_ERR_BODY_TIMEOUT: 'Servidor parou de enviar o corpo da resposta (timeout de body).',
  UND_ERR_SOCKET: 'Socket fechado inesperadamente (socket hang up).',
  ENOTFOUND: 'DNS nao resolveu o host (nome invalido ou sem DNS).',
  EAI_AGAIN: 'Falha temporaria de DNS (rede instavel ou sem internet).',
  EPIPE: 'Conexao quebrada durante o envio do corpo.',
  EHOSTUNREACH: 'Host inalcancavel (roteamento/rede).',
  ENETUNREACH: 'Rede inalcancavel.',
  EMFILE: 'Muitos arquivos/sockets abertos - reduza a concorrencia.',
  EADDRNOTAVAIL: 'Sem portas locais disponiveis - reduza a concorrencia (esgotamento de portas efemeras).',
  CERT_HAS_EXPIRED: 'Certificado TLS do servidor expirado.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificado TLS autoassinado/nao confiavel.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Nao foi possivel validar a cadeia do certificado TLS.'
}
function detalharFalhaRede(err) {
  const causa = (err && err.cause) || null
  const codigo = (causa && (causa.code || causa.name)) || (err && err.code) || (err && err.name) || 'DESCONHECIDO'
  const msgs = []
  if (err && err.message) msgs.push(err.message)
  if (causa && causa.message && causa.message !== (err && err.message)) msgs.push(causa.message)
  const explicacao = MOTIVOS_REDE[codigo] || 'Falha de rede antes de receber resposta HTTP.'
  return {
    erroCodigo: String(codigo),
    erroMensagem: msgs.join(' | ') || String(err),
    erroExplicacao: explicacao,
    payload: 'SEM RESPOSTA HTTP (' + codigo + '): ' + explicacao + ' [detalhe: ' + (msgs.join(' | ') || String(err)) + ']'
  }
}

// Envia um POST reaproveitando conexoes (keep-alive) e limitando quantas
// conexoes sao abertas ao mesmo tempo (maxSockets). Isso evita a rajada de
// handshakes TLS simultaneos que causava UND_ERR_CONNECT_TIMEOUT.
function enviarPost(urlStr, headers, body, opts) {
  const { agent, connectTimeoutMs, respostaTimeoutMs } = opts
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(urlStr) } catch (err) { return reject(Object.assign(new Error('URL invalida: ' + urlStr), { code: 'URL_INVALIDA' })) }
    const mod = u.protocol === 'https:' ? https : http
    const cab = Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(body) })

    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: cab,
      agent
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        limpar()
        resolve({ status: res.statusCode, payload: Buffer.concat(chunks).toString('utf8') })
      })
    })

    let conectado = false
    const tConnect = setTimeout(() => {
      if (!conectado) req.destroy(Object.assign(new Error('handshake nao completou em ' + connectTimeoutMs + 'ms'), { code: 'CONNECT_TIMEOUT' }))
    }, connectTimeoutMs)
    const tResp = setTimeout(() => {
      req.destroy(Object.assign(new Error('sem resposta em ' + respostaTimeoutMs + 'ms'), { code: 'RESPONSE_TIMEOUT' }))
    }, respostaTimeoutMs)
    function limpar() { clearTimeout(tConnect); clearTimeout(tResp) }

    req.on('socket', (socket) => {
      // socket reaproveitado do pool keep-alive: ja esta pronto
      if (!socket.connecting) { conectado = true; clearTimeout(tConnect); return }
      const marcar = () => { conectado = true; clearTimeout(tConnect) }
      if (u.protocol === 'https:') socket.once('secureConnect', marcar)
      else socket.once('connect', marcar)
    })
    req.on('error', (err) => { limpar(); reject(err) })
    req.end(body)
  })
}

let automacaoCancel = false
ipcMain.on('automacao:cancel', () => { automacaoCancel = true })
ipcMain.handle('automacao:run', async (e, { pasta, url, headers, concorrencia, maxPorMinuto, saida, retentativas, esperaRetryMs, poolConexoes, connectTimeoutSeg }) => {
  automacaoCancel = false
  let files
  try { files = fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.json')) } catch (err) { return { error: 'Pasta invalida: ' + pasta } }
  const total = files.length
  if (total === 0) return { error: 'Nenhum arquivo .json na pasta.' }
  const conc = concorrencia || 100
  const intervalo = Math.max(1, Math.floor(60000 / (maxPorMinuto || 1000)))
  // retentativas: SO para falhas de rede (fetch rejeitado). Respostas HTTP (4xx/5xx) nunca sao repetidas.
  const maxRetry = Math.max(0, retentativas == null ? 2 : Number(retentativas))
  const baseEspera = Math.max(0, esperaRetryMs == null ? 500 : Number(esperaRetryMs))
  // pool de conexoes keep-alive: nunca abre mais que N sockets ao mesmo tempo
  const maxSockets = Math.max(1, Number(poolConexoes) || 6)
  const connectTimeoutMs = Math.max(500, (Number(connectTimeoutSeg) || 5) * 1000)
  const respostaTimeoutMs = 120000
  const ehHttps = String(url).toLowerCase().startsWith('https:')
  const agent = new (ehHttps ? https.Agent : http.Agent)({
    keepAlive: true, keepAliveMsecs: 15000, maxSockets, maxFreeSockets: maxSockets, scheduling: 'fifo'
  })
  const resultados = []
  let primeiroEnvioMs = null, ultimoEnvioMs = null, ultimaConclusaoMs = null
  let idx = 0, ativos = 0, enviados = 0, concluidos = 0
  let totalRetentativas = 0, recuperadasNoRetry = 0

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

  async function lancar(arquivo) {
    ativos++
    const correlationId = crypto.randomUUID()
    let body
    try { body = await fs.promises.readFile(path.join(pasta, arquivo)) } catch (err) { body = Buffer.from('') }
    const h = Object.assign({ 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId }, headers || {})
    const inicioChamadaMs = performance.now()
    if (primeiroEnvioMs == null) primeiroEnvioMs = inicioChamadaMs
    ultimoEnvioMs = inicioChamadaMs
    enviados++

    let resposta = null
    let tentativas = 0
    let ultimaFalha = null

    for (let t = 0; t <= maxRetry; t++) {
      tentativas = t + 1
      try {
        const resp = await enviarPost(url, h, body, { agent, connectTimeoutMs, respostaTimeoutMs })
        // resposta HTTP recebida (mesmo 4xx/5xx) = resultado final, sem retry
        resposta = { status: resp.status, payload: resp.payload }
        if (t > 0) recuperadasNoRetry++
        break
      } catch (err) {
        // falha de rede: nao houve resposta HTTP -> elegivel a retry
        ultimaFalha = detalharFalhaRede(err)
        if (t < maxRetry && !automacaoCancel) {
          totalRetentativas++
          await dormir(baseEspera * Math.pow(2, t)) // backoff: 500ms, 1s, 2s...
          continue
        }
        resposta = {
          status: 0, payload: ultimaFalha.payload,
          erroCodigo: ultimaFalha.erroCodigo, erroMensagem: ultimaFalha.erroMensagem,
          erroExplicacao: ultimaFalha.erroExplicacao
        }
      }
    }

    ultimaConclusaoMs = performance.now()
    resultados.push({
      arquivo, ...resposta, correlationId, headers: headers || {},
      tentativas, duracaoMs: ultimaConclusaoMs - inicioChamadaMs
    })
    ativos--; concluidos++
    try { e.sender.send('automacao:progress', { enviados, concluidos, total, retentativas: totalRetentativas, recuperadas: recuperadasNoRetry }) } catch (x) {}
  }

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (automacaoCancel || idx >= total) {
        clearInterval(timer)
        const fim = setInterval(() => { if (ativos === 0) { clearInterval(fim); resolve() } }, 100)
        return
      }
      if (ativos >= conc) return
      lancar(files[idx++])
    }, intervalo)
  })

  try { agent.destroy() } catch (err) {}

  // agrupa por status
  const grupos = {}
  for (const r of resultados) { const s = r.status; if (!grupos[s]) grupos[s] = []; grupos[s].push(r) }
  const statusList = Object.keys(grupos).map(Number).sort((a, b) => a - b)
  const resumo = statusList.map((s) => ({ status: s, quantidade: grupos[s].length }))

  // detalhamento das falhas "sem resposta" (status 0), agrupadas pelo motivo real
  const semResposta = grupos[0] || []
  const porMotivo = {}
  for (const r of semResposta) {
    const cod = r.erroCodigo || 'DESCONHECIDO'
    if (!porMotivo[cod]) porMotivo[cod] = { codigo: cod, explicacao: r.erroExplicacao || '', quantidade: 0, exemplos: [] }
    porMotivo[cod].quantidade++
    if (porMotivo[cod].exemplos.length < 5) porMotivo[cod].exemplos.push({ arquivo: r.arquivo, correlationId: r.correlationId, mensagem: r.erroMensagem })
  }
  const diagnosticoSemResposta = Object.values(porMotivo).sort((a, b) => b.quantidade - a.quantidade)
  const intervaloRealMs = enviados > 1 && ultimoEnvioMs > primeiroEnvioMs
    ? (ultimoEnvioMs - primeiroEnvioMs) / (enviados - 1)
    : intervalo
  const reqPorSegundoEnviados = enviados > 0 ? 1000 / intervaloRealMs : 0
  const tempoTotalChamadasMs = resultados.reduce((totalMs, r) => totalMs + (r.duracaoMs || 0), 0)
  const mediaDuracaoChamadasMs = resultados.length > 0 ? tempoTotalChamadasMs / resultados.length : 0
  const tempoRealExecucaoMs = primeiroEnvioMs != null && ultimaConclusaoMs != null
    ? ultimaConclusaoMs - primeiroEnvioMs
    : 0
  const relObj = {
    gerado_em: new Date().toISOString(),
    url,
    interrompido: automacaoCancel,
    total_arquivos_na_pasta: total,
    total_processados: resultados.length,
    requisicoes_por_segundo_enviadas: reqPorSegundoEnviados,
    tempo_total_chamadas_ms: tempoTotalChamadasMs,
    media_duracao_chamadas_ms: mediaDuracaoChamadasMs,
    tempo_real_execucao_ms: tempoRealExecucaoMs,
    resumo_por_status: resumo,
    retentativas: {
      configuradas_por_requisicao: maxRetry,
      total_de_retentativas: totalRetentativas,
      recuperadas_no_retry: recuperadasNoRetry,
      falharam_mesmo_com_retry: (grupos[0] || []).length
    },
    diagnostico_sem_resposta: diagnosticoSemResposta,
    resultados: statusList.map((s) => ({
      status: s,
      quantidade: grupos[s].length,
      respostas: grupos[s].map((r) => ({
        arquivo: r.arquivo, correlationId: r.correlationId, headersCustomizados: r.headers, payload: r.payload,
        tentativas: r.tentativas || 1,
        ...(r.erroCodigo ? { erroCodigo: r.erroCodigo, erroExplicacao: r.erroExplicacao, erroMensagem: r.erroMensagem } : {})
      }))
    }))
  }
  let caminhoSaida = null
  if (saida) {
    try {
      fs.mkdirSync(saida, { recursive: true })
      caminhoSaida = path.join(saida, 'relatorio-requisicoes-' + tstamp() + '.json')
      fs.writeFileSync(caminhoSaida, JSON.stringify(relObj, null, 2), 'utf8')
    } catch (err) { caminhoSaida = null }
  }
  return {
    interrompido: automacaoCancel, total, processados: resultados.length, resumo,
    diagnosticoSemResposta,
    retentativasConfig: maxRetry, totalRetentativas, recuperadasNoRetry,
    reqPorSegundoEnviados, tempoTotalChamadasMs, mediaDuracaoChamadasMs,
    tempoRealExecucaoMs, caminhoSaida, relatorio: relObj
  }
})

// ---- Relatorios: ler / apagar / limpar pasta ----
ipcMain.handle('relatorio:ler', (_e, caminho) => {
  try { return { relatorio: JSON.parse(fs.readFileSync(caminho, 'utf8')) } }
  catch (e) { return { error: String(e && e.message || e) } }
})
ipcMain.handle('fs:deleteFile', (_e, arquivo) => {
  try { if (arquivo && fs.existsSync(arquivo)) fs.unlinkSync(arquivo); return { ok: true } }
  catch (e) { return { ok: false, error: String(e && e.message || e) } }
})
ipcMain.handle('fs:cleanFolder', (_e, pasta) => {
  try {
    if (!pasta || !fs.existsSync(pasta)) return { removidos: 0 }
    let n = 0
    for (const f of fs.readdirSync(pasta)) {
      try { fs.rmSync(path.join(pasta, f), { recursive: true, force: true }); n++ } catch (e) {}
    }
    return { removidos: n }
  } catch (e) { return { error: String(e && e.message || e) } }
})

// ---- MuleSoft: log local (injetar log4j2 + monitorar arquivo) ----
function buscarArquivo(dir, nome, depth) {
  if (depth < 0) return null
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return null }
  for (const en of entries) { if (en.isFile() && en.name === nome) return path.join(dir, en.name) }
  for (const en of entries) {
    if (en.isDirectory() && !['node_modules', 'target', '.git', '.mvn'].includes(en.name)) {
      const r = buscarArquivo(path.join(dir, en.name), nome, depth - 1)
      if (r) return r
    }
  }
  return null
}
function acharLog4j(root) {
  const cand = [path.join(root, 'src', 'main', 'resources', 'log4j2.xml'), path.join(root, 'log4j2.xml')]
  for (const c of cand) { if (fs.existsSync(c)) return c }
  return buscarArquivo(root, 'log4j2.xml', 6)
}
function log4jTemplate(fileName, filePattern) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Appenders>
        <Console name="console" target="SYSTEM_OUT">
            <PatternLayout pattern="%-5p %d [%t] [processor: %X{processorPath}; event: %X{correlationId}] %c: %m%n"/>
        </Console>
        <RollingFile name="appFile" fileName="${fileName}" filePattern="${filePattern}">
            <PatternLayout pattern="LOG %sn --> %m%n%n"/>
            <Policies>
                <SizeBasedTriggeringPolicy size="10 MB"/>
            </Policies>
            <DefaultRolloverStrategy max="10"/>
        </RollingFile>
    </Appenders>
    <Loggers>
        <AsyncLogger name="org.mule.service.http" level="WARN"/>
        <AsyncLogger name="org.mule.extension.http" level="WARN"/>
        <AsyncLogger name="org.mule.runtime.core.internal.processor.LoggerMessageProcessor" level="INFO" additivity="false">
            <AppenderRef ref="console"/>
            <AppenderRef ref="appFile"/>
        </AsyncLogger>
        <AsyncLogger name="gcs-error" level="ERROR" additivity="false">
            <AppenderRef ref="console"/>
            <AppenderRef ref="appFile"/>
        </AsyncLogger>
        <AsyncLogger name="gcs-error-registro" level="ERROR" additivity="false">
            <AppenderRef ref="console"/>
            <AppenderRef ref="appFile"/>
        </AsyncLogger>
        <AsyncRoot level="WARN">
            <AppenderRef ref="console"/>
        </AsyncRoot>
    </Loggers>
</Configuration>
`
}

ipcMain.handle('mule:configurarLog', (_e, { projetoRoot }) => {
  try {
    const root = (projetoRoot || '').trim().replace(/^"|"$/g, '')
    if (!root || !fs.existsSync(root)) return { error: 'Pasta do projeto nao encontrada: ' + root }
    const log4jPath = acharLog4j(root)
    if (!log4jPath) return { error: 'log4j2.xml nao encontrado em: ' + root }
    const backup = path.join(path.dirname(log4jPath), 'log4j2-ORIGINAL.xml')
    if (!fs.existsSync(backup)) fs.copyFileSync(log4jPath, backup)
    const logDir = 'C:\\temp\\mule-logs'
    let nomeBase = path.basename(root).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
    if (!nomeBase) nomeBase = 'mule-app'
    const logFile = path.join(logDir, nomeBase + '.log')
    fs.mkdirSync(logDir, { recursive: true })
    if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf8')
    const fileName = logFile.replace(/\\/g, '/')
    const filePattern = fileName.replace(/(\.[^./]+)$/, '-%i$1')
    fs.writeFileSync(log4jPath, log4jTemplate(fileName, filePattern), 'utf8')
    return { ok: true, logFile, log4jPath, backup }
  } catch (e) { return { error: String(e && e.message || e) } }
})

ipcMain.handle('mule:reverterLog', (_e, { projetoRoot }) => {
  try {
    const root = (projetoRoot || '').trim().replace(/^"|"$/g, '')
    if (!root || !fs.existsSync(root)) return { error: 'Pasta do projeto nao encontrada: ' + root }
    const log4jPath = acharLog4j(root)
    if (!log4jPath) return { error: 'log4j2.xml nao encontrado em: ' + root }
    const backup = path.join(path.dirname(log4jPath), 'log4j2-ORIGINAL.xml')
    let logFile = null
    try { const m = fs.readFileSync(log4jPath, 'utf8').match(/fileName\s*=\s*"([^"]+)"/); if (m) logFile = m[1] } catch (e) {}
    let logRemovido = false
    if (logFile) {
      const lf = logFile.replace(/\//g, '\\')
      try { if (fs.existsSync(lf)) { fs.unlinkSync(lf); logRemovido = true } } catch (e) {}
      try {
        const dir = path.dirname(lf), base = path.basename(lf, path.extname(lf)), ext = path.extname(lf)
        for (const f of fs.readdirSync(dir)) { if (f.startsWith(base + '-') && f.endsWith(ext)) { try { fs.unlinkSync(path.join(dir, f)) } catch (e) {} } }
      } catch (e) {}
    }
    if (!fs.existsSync(backup)) return { error: 'Backup log4j2-ORIGINAL.xml nao encontrado. O log4j2 atual foi mantido.', logFile }
    fs.copyFileSync(backup, log4jPath)
    try { fs.unlinkSync(backup) } catch (e) {}
    return { ok: true, log4jPath, logFile, logRemovido }
  } catch (e) { return { error: String(e && e.message || e) } }
})

ipcMain.handle('mule:readLog', (_e, { caminho, offset }) => {
  try {
    if (!caminho || !fs.existsSync(caminho)) return { size: 0, data: '', existe: false }
    const size = fs.statSync(caminho).size
    let start = offset || 0
    if (start > size) start = 0
    if (start === size) return { size, data: '', existe: true }
    const fd = fs.openSync(caminho, 'r')
    const len = size - start
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, start)
    fs.closeSync(fd)
    return { size, data: buf.toString('utf8'), existe: true }
  } catch (e) { return { size: 0, data: '', erro: String(e && e.message || e) } }
})

ipcMain.handle('mule:clearLog', (_e, caminho) => {
  try { if (caminho) fs.writeFileSync(caminho, '', 'utf8'); return { ok: true } }
  catch (e) { return { ok: false, error: String(e && e.message || e) } }
})

// ---- Rede: listar portas em uso / encerrar por porta ----
function runPwsh(script, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', done = false
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill() } catch (e) {} resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]' }) } }, timeoutMs || 30000)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { if (!done) { done = true; clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(err && err.message || err) }) } })
    child.on('close', (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr }) } })
  })
}

ipcMain.handle('rede:listarPortas', async () => {
  const script = "Get-NetTCPConnection -State Listen | ForEach-Object { $p=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; $pn=''; if($p){$pn=$p.ProcessName}; [pscustomobject]@{ endereco=[string]$_.LocalAddress; porta=[int]$_.LocalPort; processId=[int]$_.OwningProcess; processo=$pn } } | Sort-Object porta | ConvertTo-Json -Compress"
  const r = await runPwsh(script)
  const out = (r.stdout || '').trim()
  if (!out) { if (r.code !== 0) return { error: r.stderr || 'falha ao listar' }; return { portas: [] } }
  try { const d = JSON.parse(out); return { portas: Array.isArray(d) ? d : [d] } }
  catch (e) { return { error: 'Nao consegui interpretar a saida: ' + out.slice(0, 200) } }
})

ipcMain.handle('rede:fecharPorta', async (_e, porta) => {
  const p = parseInt(porta, 10)
  if (!p || p < 1 || p > 65535) return { error: 'Porta invalida.' }
  const script = "$porta=" + p + "; $ps=(Get-NetTCPConnection -LocalPort $porta -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique; if(-not $ps){ 'NADA' } else { $r=@(); foreach($id in $ps){ $nm=(Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName; try{ Stop-Process -Id $id -Force -ErrorAction Stop; $r += \"$id ($nm)\" }catch{} }; 'OK ' + ($r -join ', ') }"
  const r = await runPwsh(script)
  const out = (r.stdout || '').trim()
  if (out.indexOf('NADA') === 0) return { fechado: false, msg: 'Nada usando a porta ' + p + '.' }
  if (out.indexOf('OK') === 0) return { fechado: true, msg: 'Porta ' + p + ' liberada. Encerrado: ' + out.slice(2).trim() }
  return { fechado: false, msg: out || (r.stderr || 'sem resposta (pode exigir permissao de admin)') }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
