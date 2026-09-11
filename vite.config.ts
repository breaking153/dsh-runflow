import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'preview-dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep stable preview dependencies cacheable across application edits.
        // The DSH client uses its separate single-module tsdown build.
        manualChunks: {
          'editor-vendor': ['react', 'react-dom', '@xyflow/react'],
        },
      },
    },
  },
})
