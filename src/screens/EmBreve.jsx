import React from 'react'

export default function EmBreve({ titulo }) {
  return (
    <div className="tela">
      <h1>{titulo}</h1>
      <div className="card">
        <p className="muted">
          Esta tela sera migrada em seguida. A base do app (janela, navegacao e a
          ponte para rodar o anypoint-cli) ja esta pronta, entao portar cada
          ferramenta a partir daqui e rapido.
        </p>
      </div>
    </div>
  )
}
