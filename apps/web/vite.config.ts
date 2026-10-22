import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080', '/healthz': 'http://localhost:8080' },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2023',
    rolldownOptions: {
      output: {
        // separate long-lived caches: libraries, knowledge data, app code
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules/ },
            { name: 'knowledge', test: /packages[\\/]engine[\\/]knowledge/ },
          ],
        },
      },
    },
  },
});
