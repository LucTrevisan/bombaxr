import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare'
  const base = command === 'build'
    ? (isCloudflare ? './' : '/bomba-vr/')
        : '/'

  return {
    base,
    plugins: [],
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
            'babylon-core':      ['@babylonjs/core'],
            'babylon-loaders':   ['@babylonjs/loaders'],
            'babylon-gui':       ['@babylonjs/gui'],
            'babylon-materials': ['@babylonjs/materials'],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['@babylonjs/havok'],
    },
  }
})
