import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // относительная база, чтобы корректно работать на GitHub Pages
  base: './'
})
