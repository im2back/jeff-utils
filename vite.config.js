import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para o Electron conseguir carregar os assets a partir de file://
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  }
})
