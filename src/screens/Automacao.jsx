import React, { useState } from 'react'
import { useAutomacao } from '../context/AutomacaoContext.jsx'
import { fmtDur } from '../util/logs.js'

export default function Automacao() {
  const { form, setForm, notas, setNotas, rodando, prog, resultado, erro, iniciar, parar, limpar } = useAutomacao()
  const [verRel, setVerRel] = useState(false)
  const [verNotas, setVerNotas] = useState(true)
  const [msg, setMsg] = useState('')

  function setCampo(campo, v) { setForm((f) => ({ ...f, [campo]: v })); setMsg('') }
  function setHeader(i, campo, v) { setForm((f) => ({ ...f, headers: f.headers.map((h, idx) => idx === i ? { ...h, [campo]: v } : h) })) }
  function addHeader() { setForm((f) => ({ ...f, headers: [...f.headers, { nome: '', valor: '' }] })) }
  function delHeader(i) { setForm((f) => ({ ...f, headers: f.headers.filter((_, idx) => idx !== i) })) }
  async function escolher(campo) { if (!window.api) return; const p = await window.api.dialog.openFolder(); if (p) setCampo(campo, p) }

  async function limparPasta() {
    if (!form.saida) { setMsg('Defina a pasta de saida primeiro.'); return }
    if (!window.confirm('Apagar TODO o conteudo de:\n' + form.saida + ' ?')) return
    const r = await window.api.fs.cleanFolder(form.saida)
    setMsg(r.error ? ('Erro: ' + r.error) : ('Pasta limpa. Itens removidos: ' + r.removidos))
    limpar(); setVerRel(false)
  }
  async function apagarRelatorio() {
    if (!resultado || !resultado.caminhoSaida) return
    if (!window.confirm('Apagar o relatorio:\n' + resultado.caminhoSaida + ' ?')) return
    const r = await window.api.fs.deleteFile(resultado.caminhoSaida)
    setMsg(r.ok ? 'Relatorio apagado.' : ('Erro: ' + (r.error || '')))
  }

  const pct = prog.total ? Math.round((prog.concluidos / prog.total) * 100) : 0

  return (
    <div className="tela">
      <h1>Requisicoes · Automacao de POST</h1>

      <div className="card notas-card">
        <button className="notas-head" onClick={() => setVerNotas((v) => !v)}>
          <span className="col-exp">{verNotas ? '▼' : '▶'}</span>
          Bloco de notas <span className="muted">(guarde URLs, credenciais, paths... salvo automaticamente)</span>
        </button>
        {verNotas && (
          <textarea
            className="notas-area"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            spellCheck={false}
            placeholder="Cole aqui suas infos para alternar quando quiser..."
          />
        )}
      </div>

      <div className="card">
        <div className="form">
          <label>Pasta com os arquivos .json
            <div className="linha-input">
              <input value={form.pasta} onChange={(e) => setCampo('pasta', e.target.value)} placeholder="C:\...\arquivos" disabled={rodando} />
              <button className="btn" onClick={() => escolher('pasta')} disabled={rodando}>Escolher...</button>
            </div>
          </label>
          <label>URL da requisicao (POST)
            <input value={form.url} onChange={(e) => setCampo('url', e.target.value)} placeholder="https://api.exemplo.com/v1/recurso" disabled={rodando} />
          </label>
          <label>Pasta de saida do relatorio (.json)
            <div className="linha-input">
              <input value={form.saida} onChange={(e) => setCampo('saida', e.target.value)} placeholder="opcional - onde salvar o relatorio" disabled={rodando} />
              <button className="btn" onClick={() => escolher('saida')} disabled={rodando}>Escolher...</button>
            </div>
          </label>
        </div>

        <div className="headers-box">
          <div className="headers-titulo">Headers customizados (Content-Type e X-Correlation-ID sao automaticos)</div>
          {form.headers.map((h, i) => (
            <div key={i} className="header-linha">
              <input placeholder="nome (ex: client_id)" value={h.nome} onChange={(e) => setHeader(i, 'nome', e.target.value)} disabled={rodando} />
              <input placeholder="valor" value={h.valor} onChange={(e) => setHeader(i, 'valor', e.target.value)} disabled={rodando} />
              <button className="btn icone" onClick={() => delHeader(i)} disabled={rodando} title="remover">×</button>
            </div>
          ))}
          <button className="btn small" onClick={addHeader} disabled={rodando}>+ header</button>
        </div>

        <div className="form-inline">
          <label>Concorrencia
            <input type="number" value={form.conc} onChange={(e) => setCampo('conc', e.target.value)} style={{ width: 90 }} disabled={rodando} />
          </label>
          <label>Req/min (max)
            <input type="number" value={form.rpm} onChange={(e) => setCampo('rpm', e.target.value)} style={{ width: 90 }} disabled={rodando} />
          </label>
          <label title="Só re-tenta falhas de REDE (sem resposta). Respostas HTTP 4xx/5xx nunca são repetidas.">Retentativas (rede)
            <input type="number" min="0" max="5" value={form.retentativas} onChange={(e) => setCampo('retentativas', e.target.value)} style={{ width: 90 }} disabled={rodando} />
          </label>
          <label title="Quantas conexões TCP/TLS ficam abertas ao mesmo tempo (keep-alive). Valores baixos evitam rajada de handshakes.">Conexões (pool)
            <input type="number" min="1" max="64" value={form.pool} onChange={(e) => setCampo('pool', e.target.value)} style={{ width: 90 }} disabled={rodando} />
          </label>
          <label title="Tempo máximo para ABRIR a conexão antes de falhar e re-tentar.">Timeout conexão (s)
            <input type="number" min="1" max="60" value={form.connectTimeout} onChange={(e) => setCampo('connectTimeout', e.target.value)} style={{ width: 90 }} disabled={rodando} />
          </label>
        </div>

        <div className="acoes">
          {!rodando && <button className="btn primary" onClick={iniciar}>Iniciar envio</button>}
          {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
          <button className="btn" onClick={limparPasta} disabled={rodando}>Limpar pasta de saida</button>
          <button className="btn" onClick={() => form.saida ? window.api.shell.openPath(form.saida) : setMsg('Defina a pasta de saida primeiro.')}>Abrir pasta</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>

      {erro && <pre className="erro">{erro}</pre>}

      {(rodando || prog.total > 0) && (
        <div className="card">
          <div className="prog-topo">
            <span>
              {prog.concluidos} de {prog.total} concluidas ({pct}%)  ·  enviadas: {prog.enviados}
              {prog.retentativas > 0 ? '  ·  retentativas: ' + prog.retentativas : ''}
              {prog.recuperadas > 0 ? '  ·  recuperadas: ' + prog.recuperadas : ''}
              {rodando ? '  · rodando em background (pode trocar de aba)' : ''}
            </span>
          </div>
          <div className="barra"><div className="barra-fill" style={{ width: pct + '%' }} /></div>
        </div>
      )}

      {resultado && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Relatorio {resultado.interrompido ? '(interrompido)' : ''}</h3>
          <p>Total de arquivos processados: <b>{resultado.processados}</b> de {resultado.total}</p>
          <table className="tabela compacta">
            <thead><tr><th>Status</th><th>Quantidade</th><th>Req/s enviados</th><th>Tempo total das chamadas</th><th>Média de duração das chamadas</th><th>Tempo real (concorrência)</th></tr></thead>
            <tbody>
              {resultado.resumo.map((r, i) => (
                <tr key={r.status}>
                  <td><span className={'badge ' + (r.status >= 200 && r.status < 300 ? 'ok' : 'warn')}>{r.status === 0 ? 'sem resposta' : r.status}</span></td>
                  <td>{r.quantidade}</td>
                  {i === 0 && <td rowSpan={resultado.resumo.length}>{formatarTaxa(resultado.reqPorSegundoEnviados)}</td>}
                  {i === 0 && <td rowSpan={resultado.resumo.length}>{formatarTempo(resultado.tempoTotalChamadasMs)}</td>}
                  {i === 0 && <td rowSpan={resultado.resumo.length}>{formatarTempo(resultado.mediaDuracaoChamadasMs)}</td>}
                  {i === 0 && <td rowSpan={resultado.resumo.length}>{formatarTempo(resultado.tempoRealExecucaoMs)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {(resultado.totalRetentativas > 0 || resultado.recuperadasNoRetry > 0) && (
            <p className="muted" style={{ fontSize: 13.5 }}>
              Retentativas de rede: <b>{resultado.totalRetentativas}</b> ·
              recuperadas apos retry: <b style={{ color: '#4ade80' }}>{resultado.recuperadasNoRetry}</b> ·
              limite configurado: {resultado.retentativasConfig} por requisicao
            </p>
          )}

          {resultado.diagnosticoSemResposta && resultado.diagnosticoSemResposta.length > 0 && (
            <div className="diag-box">
              <div className="diag-titulo">Por que veio "sem resposta"?</div>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                "Sem resposta" = a requisicao falhou na REDE, antes de o servidor devolver qualquer status HTTP.
                Nao e erro retornado pela API.
              </p>
              <table className="tabela compacta">
                <thead><tr><th>Motivo</th><th>Qtd</th><th>O que significa</th></tr></thead>
                <tbody>
                  {resultado.diagnosticoSemResposta.map((d) => (
                    <tr key={d.codigo}>
                      <td className="mono"><span className="badge warn">{d.codigo}</span></td>
                      <td>{d.quantidade}</td>
                      <td>{d.explicacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
                Dica: erros como ECONNRESET, UND_ERR_CONNECT_TIMEOUT ou EADDRNOTAVAIL costumam indicar
                concorrencia alta demais para o servidor/rede. Tente reduzir a Concorrencia (ex.: 100 → 25)
                e/ou o Req/min.
              </p>
            </div>
          )}
          <div className="acoes">
            <button className="btn primary" onClick={() => setVerRel((v) => !v)}>{verRel ? 'Ocultar relatorio' : 'Ver relatorio na tela'}</button>
            {resultado.caminhoSaida && <button className="btn" onClick={() => window.api.shell.openPath(resultado.caminhoSaida.replace(/[^\\\/]+$/, ''))}>Abrir pasta</button>}
            {resultado.caminhoSaida && <button className="btn danger" onClick={apagarRelatorio}>Apagar este relatorio</button>}
          </div>
          {resultado.caminhoSaida && <div className="muted mono" style={{ marginTop: 8, fontSize: 12 }}>{resultado.caminhoSaida}</div>}
        </div>
      )}

      {verRel && resultado && resultado.relatorio && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Relatorio detalhado</h3>
          {resultado.relatorio.resultados.map((g) => <GrupoStatus key={g.status} g={g} />)}
        </div>
      )}
    </div>
  )
}

function formatarTaxa(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatarTempo(ms) {
  const totalMs = Math.max(0, Number(ms) || 0)
  if (totalMs < 1000) return Math.round(totalMs) + ' ms'
  if (totalMs < 60000) return (totalMs / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' s'
  return fmtDur(totalMs / 1000)
}

function GrupoStatus({ g }) {
  const [aberto, setAberto] = useState(false)
  const ok = g.status >= 200 && g.status < 300
  return (
    <div className="grupo-status">
      <button className="grupo-head" onClick={() => setAberto((o) => !o)}>
        <span className="col-exp">{aberto ? '▼' : '▶'}</span>
        <span className={'badge ' + (ok ? 'ok' : 'warn')}>{g.status === 0 ? 'sem resposta' : g.status}</span>
        <span className="muted">{g.quantidade} arquivo(s)</span>
      </button>
      {aberto && (
        <div className="grupo-corpo">
          {g.respostas.map((r, i) => (
            <div key={i} className="resp-item">
              <div className="resp-cab"><b>{r.arquivo}</b> · <span className="muted mono">{r.correlationId}</span></div>
              <pre className="resp-payload">{r.payload || '(vazio)'}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
