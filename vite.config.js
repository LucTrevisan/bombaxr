import { defineConfig } from 'vite'

export default defineConfig(({command}) => ({
  // base vazio para dev local, /bomba-vr/ para build (GitHub Pages)
  base: command === 'build' ? '/bomba-vr/' : '/',
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core','@babylonjs/loaders','@babylonjs/gui']
        }
      }
    }
  }
}))
