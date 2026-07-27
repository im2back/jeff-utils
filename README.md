# SLCLI Desktop (React + Electron)

Migracao das ferramentas do SLCLI (PowerShell) para um app de desktop com
interface grafica. Esta primeira versao traz a "casca" do app (janela,
navegacao lateral) e a primeira tela funcional: **CloudHub - Aplicacoes**,
que roda o `anypoint-cli-v4` e mostra as apps numa tabela.

## Pre-requisitos

Ja verificados na sua maquina:

- Node.js 20.x  (traz o npm)
- npm 10.x
- anypoint-cli-v4 instalado e no PATH

## Como rodar (desenvolvimento)

Na pasta do projeto, no PowerShell:

```powershell
npm install      # instala as dependencias (so na primeira vez)
npm run dev      # sobe o Vite + abre o app no Electron
```

O `npm run dev` inicia o servidor do React (porta 5173) e abre a janela do
Electron automaticamente quando ele estiver pronto.

Para fechar: feche a janela ou Ctrl+C no terminal.

## Estrutura

```
utils-migracao/
├─ package.json          # dependencias e scripts
├─ vite.config.js        # config do bundler (React)
├─ index.html            # ponto de entrada da interface
├─ electron/
│  ├─ main.js            # processo principal (backend: roda o CLI, le/grava config)
│  └─ preload.js         # ponte segura -> expoe window.api para a interface
└─ src/
   ├─ main.jsx           # bootstrap do React
   ├─ App.jsx            # casca + navegacao lateral
   ├─ styles.css         # tema escuro
   └─ screens/
      ├─ Aplicacoes.jsx     # tela funcional (lista apps do CloudHub)
      ├─ Configuracoes.jsx  # credenciais da Connected App (salvas localmente)
      └─ EmBreve.jsx        # placeholder das telas a migrar
```

## Como funciona a ponte

A interface (React) nao acessa o sistema diretamente. Ela chama
`window.api.cli.run([...])`, que o `preload.js` encaminha para o processo
principal (`main.js`), que executa o `anypoint-cli-v4` e devolve a saida.
Mesmo padrao vale para ler/gravar config. Assim a logica pesada fica no
backend do Electron e a tela so exibe.

## Proximos passos

- Configuracoes -> preencher Client ID / Client Secret / Ambiente (salva local).
- CloudHub -> Aplicacoes -> "Listar aplicacoes".
- Portar as demais telas: Monitorar logs, Automacao de POST, Painel de erros 3s.
