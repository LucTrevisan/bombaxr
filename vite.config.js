import { defineConfig } from 'vite'

export default defineConfig(({ command, mode }) => {
  // Detectar ambiente pelo NODE_ENV ou variável DEPLOY_TARGET
  // GitHub Pages: base = '/bomba-vr/'
  // Cloudflare Pages: base = '/'
  const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare'
  const base = command === 'build'
    ? (isCloudflare ? '/' : '/bomba-vr/')
    : '/'

  return {
    base,
    server: {
      host:  '0.0.0.0',
      port:  5173,
      headers: {
        'Cross-Origin-Opener-Policy':   'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    },
    build: {
      target:  'esnext',
      outDir:  'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            babylon: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/gui']
          }
        }
      }
    }
  }
})
