import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const Ctx = createContext(null)
export function useAutomacao() { return useContext(Ctx) }

const FORM_PADRAO = { pasta: '', saida: '', url: '', headers: [{ nome: '', valor: '' }], conc: 100, rpm: 1000, retentativas: 2, pool: 6, connectTimeout: 5 }
const NOTAS_PADRAO = `#PROCESS-API-3S-SALES
//https://process-api-3s-sales-g6joro.n5phad.bra-s1.cloudhub.io/api/companies/BurgerKing/sales
//client_id a07ef5c3-b0b7-4f5b-81c1-da9c03bf2d73
//client_secret nie8Q~L7F-sVtZXRTKJ1nMtmOhXs~YKYny15ZbF-
//C:\\Users\\Sobrevivente\\Downloads\\Ultima Remessa\\all
`

function carregarLS(chave, padrao) {
  try { const s = localStorage.getItem(chave); if (s != null) return JSON.parse(s) } catch (e) {}
  return padrao
}

// Provider fica no topo do app (nunca desmonta), entao o job e o estado
// sobrevivem a troca de telas. Form e notas persistem no localStorage (entre reinicios).
export function AutomacaoProvider({ children }) {
  const [form, setForm] = useState(() => carregarLS('automacao_form', FORM_PADRAO))
  const [notas, setNotas] = useState(() => {
    try { const s = localStorage.getItem('automacao_notas'); if (s != null) return s } catch (e) {}
    return NOTAS_PADRAO
  })

  useEffect(() => { try { localStorage.setItem('automacao_form', JSON.stringify(form)) } catch (e) {} }, [form])
  useEffect(() => { try { localStorage.setItem('automacao_notas', notas) } catch (e) {} }, [notas])
  const [rodando, setRodando] = useState(false)
  const [prog, setProg] = useState({ enviados: 0, concluidos: 0, total: 0 })
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')
  const unsub = useRef(null)

  async function iniciar() {
    setErro('')
    setResultado(null)
    if (!window.api) { setErro('Bridge indisponivel (rode via Electron).'); return }
    if (!form.pasta) { setErro('Escolha a pasta com os arquivos .json.'); return }
    if (!form.url) { setErro('Informe a URL.'); return }
    const headersObj = {}
    form.headers.forEach((h) => { if (h.nome && h.nome.trim()) headersObj[h.nome.trim()] = h.valor })

    setRodando(true)
    setProg({ enviados: 0, concluidos: 0, total: 0 })
    if (unsub.current) unsub.current()
    unsub.current = window.api.automacao.onProgress((d) => setProg(d))
    try {
      const r = await window.api.automacao.run({
        pasta: form.pasta, url: form.url, headers: headersObj,
        concorrencia: Number(form.conc) || 100,
        maxPorMinuto: Number(form.rpm) || 1000,
        retentativas: form.retentativas == null ? 2 : Number(form.retentativas),
        poolConexoes: Number(form.pool) || 6,
        connectTimeoutSeg: Number(form.connectTimeout) || 5,
        saida: form.saida || null
      })
      if (r && r.error) setErro(r.error)
      else setResultado(r)
    } catch (e) {
      setErro(String(e && e.message || e))
    } finally {
      setRodando(false)
      if (unsub.current) { unsub.current(); unsub.current = null }
    }
  }

  function parar() { if (window.api) window.api.automacao.cancel() }
  function limpar() { setResultado(null); setErro(''); setProg({ enviados: 0, concluidos: 0, total: 0 }) }

  const value = { form, setForm, notas, setNotas, rodando, prog, resultado, setResultado, erro, iniciar, parar, limpar }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
