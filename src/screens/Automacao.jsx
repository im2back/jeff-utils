import React, { useState } from 'react'
import { useAutomacao } from '../context/AutomacaoContext.jsx'

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
            <span>{prog.concluidos} de {prog.total} concluidas ({pct}%)  ·  enviadas: {prog.enviados}{rodando ? '  · rodando em background (pode trocar de aba)' : ''}</span>
          </div>
          <div className="barra"><div className="barra-fill" style={{ width: pct + '%' }} /></div>
        </div>
      )}

      {resultado && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Relatorio {resultado.interrompido ? '(interrompido)' : ''}</h3>
          <p>Total de arquivos processados: <b>{resultado.processados}</b> de {resultado.total}</p>
          <table className="tabela compacta">
            <thead><tr><th>Status</th><th>Quantidade</th></tr></thead>
            <tbody>
              {resultado.resumo.map((r) => (
                <tr key={r.status}>
                  <td><span className={'badge ' + (r.status >= 200 && r.status < 300 ? 'ok' : 'warn')}>{r.status === 0 ? 'sem resposta' : r.status}</span></td>
                  <td>{r.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
