import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// envDir '..': lê o .env da raiz do repositório
export default defineConfig({ envDir: '..', plugins: [react(), tailwindcss()] })
