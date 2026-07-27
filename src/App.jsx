import React, { useEffect, useState } from 'react'
import Aplicacoes from './screens/Aplicacoes.jsx'
import Automacao from './screens/Automacao.jsx'
import MonitorarLogs from './screens/MonitorarLogs.jsx'
import MonitorarCorrelation from './screens/MonitorarCorrelation.jsx'
import PainelErros from './screens/PainelErros.jsx'
import LogLocal from './screens/LogLocal.jsx'
import Rede from './screens/Rede.jsx'
import Configuracoes from './screens/Configuracoes.jsx'

const NAV = [
  { grupo: 'MuleSoft (local)', itens: [
    { id: 'loglocal', nome: 'Log local' },
  ]},
  { grupo: 'CloudHub', itens: [
    { id: 'apps', nome: 'Aplicacoes' },
    { id: 'monitor', nome: 'Monitorar logs' },
    { id: 'correlacao', nome: 'Monitorar por Correlation ID' },
  ]},
  { grupo: 'Requisicoes', itens: [
    { id: 'automacao', nome: 'Automacao de POST' },
  ]},
  { grupo: 'Rede', itens: [
    { id: 'rede', nome: 'Portas em uso' },
  ]},
  { grupo: 'Monitoramento de Erros', itens: [
    { id: 'painel3s', nome: 'Painel de erros' },
  ]},
  { grupo: 'Geral', itens: [
    { id: 'config', nome: 'Configuracoes' },
  ]},
]

function grupoDoItem(id) {
  const g = NAV.find((x) => x.itens.some((i) => i.id === id))
  return g ? g.grupo : NAV[0].grupo
}

export default function App() {
  const [tela, setTela] = useState('apps')
  const [aberto, setAberto] = useState({ [grupoDoItem('apps')]: true })
  const [cfg, setCfg] = useState({ environment: 'Dev', client_id: '', client_secret: '' })
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    (async () => {
      if (window.api && window.api.config) {
        const c = await window.api.config.load()
        setCfg((prev) => ({ ...prev, ...c }))
      }
      setCarregado(true)
    })()
  }, [])

  async function salvarCfg(novo) {
    setCfg(novo)
    if (window.api && window.api.config) await window.api.config.save(novo)
  }

  function toggleGrupo(grupo) {
    setAberto((a) => ({ ...a, [grupo]: !a[grupo] }))
  }
  function abrirTela(id) {
    setTela(id)
    setAberto((a) => ({ ...a, [grupoDoItem(id)]: true }))
  }

  function renderTela() {
    switch (tela) {
      case 'apps': return <Aplicacoes cfg={cfg} />
      case 'monitor': return <MonitorarLogs cfg={cfg} />
      case 'correlacao': return <MonitorarCorrelation cfg={cfg} />
      case 'loglocal': return <LogLocal />
      case 'rede': return <Rede />
      case 'automacao': return <Automacao />
      case 'painel3s': return <PainelErros cfg={cfg} />
      case 'config': return <Configuracoes cfg={cfg} onSalvar={salvarCfg} />
      default: return null
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" /> SLCLI <span className="brand-sub">Desktop</span>
        </div>
        <nav>
          {NAV.map((g) => {
            const isAberto = !!aberto[g.grupo]
            return (
              <div key={g.grupo} className="nav-grupo">
                <button className={'nav-grupo-btn' + (isAberto ? ' aberto' : '')} onClick={() => toggleGrupo(g.grupo)}>
                  <span className="chevron">{isAberto ? '▼' : '▶'}</span>
                  {g.grupo}
                </button>
                {isAberto && (
                  <div className="nav-itens">
                    {g.itens.map((it) => (
                      <button
                        key={it.id}
                        className={'nav-item' + (tela === it.id ? ' ativo' : '')}
                        onClick={() => abrirTela(it.id)}
                      >
                        {it.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-rodape">
          {carregado ? ('Ambiente: ' + (cfg.environment || '-')) : 'carregando...'}
        </div>
      </aside>
      <main className="conteudo">
        {renderTela()}
      </main>
    </div>
  )
}
