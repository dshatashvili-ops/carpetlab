import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Single-bundle build of the clickable demo (mock API in the browser). Output: dist-demo/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist-demo', emptyOutDir: true, cssCodeSplit: false, assetsInlineLimit: 100_000_000, rollupOptions: { input: 'demo.html', output: { inlineDynamicImports: true } } },
});
