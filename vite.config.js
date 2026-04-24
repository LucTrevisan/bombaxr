import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare'

  const base = command === 'build'
    ? (isCloudflare ? './' : '/bombaxr/')
    : '/'

  return {
    base,

    server: {
      host: '0.0.0.0',
      port: 5173,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    },

    build: {
      target: 'esnext',
      outDir: 'dist',

      rollupOptions: {
        output: {
          manualChunks(id) {

            // 🔥 separa Babylon.js em chunks menores
            if (id.includes('@babylonjs/core')) return 'babylon-core'
            if (id.includes('@babylonjs/loaders')) return 'babylon-loaders'
            if (id.includes('@babylonjs/gui')) return 'babylon-gui'
            if (id.includes('@babylonjs/materials')) return 'babylon-materials'

            // 📦 resto das libs
            if (id.includes('node_modules')) return 'vendor'
          }
        }
      }
    },

    optimizeDeps: {
      exclude: ['@babylonjs/havok'],
    },
  }
})