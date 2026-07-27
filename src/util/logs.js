// Utilitarios para interpretar os logs baixados do CloudHub (download-logs).
// Formato de cada entrada no .txt:
//   2026-07-08T00:38:14.57Z INFO [replica] Logger Thread - mensagem
// Mensagens multilinha (JSON) continuam nas linhas seguintes sem timestamp.

const RX_TS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/

// Reagrupa as linhas em entradas (uma por evento de log).
// A partir de startIndex (para so processar linhas novas).
export function parseEntries(lines, startIndex = 0) {
  const entries = []
  let atual = null
  for (let i = startIndex; i < lines.length; i++) {
    const l = String(lines[i] == null ? '' : lines[i])
    const m = RX_TS.exec(l)
    if (m) {
      if (atual) entries.push(atual)
      let ts = new Date(m[1])
      if (isNaN(ts.getTime())) ts = new Date()
      atual = { ts, texto: l }
    } else if (atual) {
      atual.texto += '\n' + l
    }
  }
  if (atual) entries.push(atual)
  return entries
}

// Extrai o primeiro objeto JSON de um texto, ignorando chaves dentro de strings.
export function extractJson(texto) {
  const ini = texto.indexOf('{')
  if (ini < 0) return null
  let nivel = 0, inStr = false, esc = false
  for (let i = ini; i < texto.length; i++) {
    const ch = texto[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') nivel++
    else if (ch === '}') { nivel--; if (nivel === 0) return texto.substring(ini, i + 1) }
  }
  return null
}

// Formata uma duracao em segundos como "18m19s" / "1h02m" / "45s".
export function fmtDur(sec) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  if (h > 0) return h + 'h' + String(m).padStart(2, '0') + 'm'
  if (m > 0) return m + 'm' + String(ss).padStart(2, '0') + 's'
  return ss + 's'
}
