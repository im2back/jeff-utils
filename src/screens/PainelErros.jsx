import React, { useEffect, useState } from 'react'
import { fmtDur } from '../util/logs.js'
import { usePainel, INTERVALO_MS, JANELA_PARADO_S } from '../context/PainelErrosContext.jsx'

export default function PainelErros({ cfg }) {
  const {
    rodando, apps, appNome, setAppNome, inicioInput, setInicioInput, agoraLocalStr,
    statusTxt, erro, inicioTxt, progresso, estado, expandido, toggleExpandido,
    carregarApps, iniciar, parar
  } = usePainel()

  useEffect(() => { if (apps.length === 0) carregarApps(cfg) }, [])

  const todos = Object.values(estado)
  const criticos = todos.filter((e) => e.critico).sort((a, b) => b.count - a.count)
  const naoCrit = todos.filter((e) => !e.critico).sort((a, b) => b.count - a.count)
  const totC = criticos.reduce((s, e) => s + e.count, 0)
  const totN = naoCrit.reduce((s, e) => s + e.count, 0)
  const total = totC + totN
  const restanteS = Math.max(0, Math.ceil((INTERVALO_MS * (1 - progresso)) / 1000))

  return (
    <div className="tela painel">
      <h1>Monitoramento de Erros · {appNome}</h1>

      <div className="barra-acoes">
        <label className="filtro-inicio">Aplicacao:
          <select value={appNome} onChange={(e) => setAppNome(e.target.value)} disabled={rodando}>
            {apps.length === 0 && <option value={appNome}>{appNome}</option>}
            {apps.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </label>
        <button className="btn small" onClick={() => carregarApps(cfg)} disabled={rodando} title="recarregar lista de apps">recarregar</button>
        <label className="filtro-inicio">A partir de:
          <input type="datetime-local" value={inicioInput} onChange={(e) => setInicioInput(e.target.value)} disabled={rodando} />
        </label>
        <button className="btn small" onClick={() => setInicioInput(agoraLocalStr())} disabled={rodando} title="voltar para agora">agora</button>
        {!rodando && <button className="btn primary" onClick={() => iniciar(cfg)}>Iniciar</button>}
        {rodando && <button className="btn danger" onClick={parar}>Parar</button>}
        <span className="muted">{statusTxt}{inicioTxt ? ' · desde ' + inicioTxt : ''}</span>
      </div>

      {rodando && (
        <div className="load-atualiza">
          <div className="load-info">Proxima atualizacao em {restanteS}s</div>
          <div className="barra"><div className="barra-fill" style={{ width: Math.round(progresso * 100) + '%' }} /></div>
        </div>
      )}

      {erro && <pre className="erro">{erro}</pre>}

      <div className="painel-topo">
        <div className="card donut-card">
          <Donut critico={totC} nao={totN} />
          <div className="donut-legenda">
            <div><span className="ponto crit" /> Criticos <b>{pctTxt(totC, total)}</b></div>
            <div><span className="ponto nao" /> Nao criticos <b>{pctTxt(totN, total)}</b></div>
          </div>
        </div>
        <div className="stats">
          <StatBox label="Erros criticos" valor={totC} cor="crit" />
          <StatBox label="Erros nao criticos" valor={totN} cor="nao" />
          <StatBox label="Total de erros" valor={total} cor="tot" />
        </div>
      </div>

      <TabelaErros titulo="CRITICOS · impedem a integracao" cor="crit" itens={criticos} expandido={expandido} toggle={toggleExpandido} />
      <TabelaErros titulo="NAO CRITICOS · tratados" cor="nao" itens={naoCrit} expandido={expandido} toggle={toggleExpandido} />

      <p className="muted nota">● = erro no ultimo ciclo · "parado" = sem novos erros ha mais de {JANELA_PARADO_S / 60} min · atualiza a cada {INTERVALO_MS / 1000}s · clique numa etapa para ver os correlation IDs</p>
    </div>
  )
}

function pctTxt(v, total) { return total ? Math.round((v / total) * 100) + '%' : '0%' }

function StatBox({ label, valor, cor }) {
  return (
    <div className={'stat-box ' + cor}>
      <div className="stat-num">{valor}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  )
}

function Donut({ critico, nao }) {
  const total = critico + nao
  const r = 56
  const c = 2 * Math.PI * r
  const fc = total ? critico / total : 0
  const fn = total ? nao / total : 0
  const critPct = total ? Math.round(fc * 100) : 0
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" className="donut">
      <circle cx="75" cy="75" r={r} fill="none" stroke="#24334f" strokeWidth="18" />
      {total > 0 && <circle cx="75" cy="75" r={r} fill="none" stroke="#ef4444" strokeWidth="18" strokeDasharray={(fc * c) + ' ' + c} transform="rotate(-90 75 75)" />}
      {total > 0 && <circle cx="75" cy="75" r={r} fill="none" stroke="#f59e0b" strokeWidth="18" strokeDasharray={(fn * c) + ' ' + c} strokeDashoffset={(-fc * c)} transform="rotate(-90 75 75)" />}
      <text x="75" y="72" textAnchor="middle" className="donut-num">{critPct}%</text>
      <text x="75" y="94" textAnchor="middle" className="donut-lbl">criticos</text>
    </svg>
  )
}

function TabelaErros({ titulo, cor, itens, expandido, toggle }) {
  const agora = Date.now()
  return (
    <div className="card sem-padding tabela-erros">
      <div className={'tabela-titulo ' + cor}>{titulo}</div>
      <table className="tabela grande">
        <thead>
          <tr><th></th><th>Etapa</th><th>Ocorr.</th><th>1a vez</th><th>Ultima</th><th>Ativo ha</th></tr>
        </thead>
        <tbody>
          {itens.length === 0 && <tr><td colSpan="6" className="vazio">sem ocorrencias</td></tr>}
          {itens.map((e) => {
            const gap = (agora - e.last.getTime()) / 1000
            const parado = gap > JANELA_PARADO_S
            const ativo = parado ? 'parado' : fmtDur((agora - e.first.getTime()) / 1000)
            const chave = e.critico + '|' + e.etapa
            const aberto = !!expandido[chave]
            return (
              <React.Fragment key={chave}>
                <tr className={'clicavel' + (parado ? ' row-parado' : '')} onClick={() => toggle(chave)}>
                  <td className="col-exp">{aberto ? '▼' : '▶'}</td>
                  <td>{(!parado && e.novo) ? <span className="dot-ativo">●</span> : <span className="dot-off">•</span>} {e.etapa}</td>
                  <td><b>{e.count}</b></td>
                  <td className="muted">{e.first.toLocaleTimeString()}</td>
                  <td className="muted">{e.last.toLocaleTimeString()}</td>
                  <td>{ativo}</td>
                </tr>
                {aberto && (
                  <tr className="linha-ids">
                    <td></td>
                    <td colSpan="5">
                      <div className="ids-box">
                        <div className="ids-titulo">{e.ids.length} correlation ID(s):</div>
                        {e.ids.slice().reverse().map((x, i) => (
                          <div key={i} className="id-linha">
                            <span className="muted">{x.ts.toLocaleTimeString()}</span>
                            <span className="mono">{x.cid}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
