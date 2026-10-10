import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { catalogueAssets } from './server/data/catalogue-assets.ts';

export default defineConfig({
  plugins: [react(), catalogueAssets()],
  server: { proxy: { '/api': 'http://127.0.0.1:8788' } },
});
