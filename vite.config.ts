import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/electron/opc-da-bridge/**/bin/**',
        '**/electron/opc-da-bridge/**/obj/**',
        '**/electron/opc-da-bridge/**/*.tmp',
      ],
    },
  },
})
