import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AutomacaoProvider } from './context/AutomacaoContext.jsx'
import { PainelErrosProvider } from './context/PainelErrosContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AutomacaoProvider>
      <PainelErrosProvider>
        <App />
      </PainelErrosProvider>
    </AutomacaoProvider>
  </React.StrictMode>
)
