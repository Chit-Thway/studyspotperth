import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { readCatalogueFiles } from './catalogue-files.ts';

/** Emit colocated source images as static Pages assets; never bundle library JSON into the browser. */
export function catalogueAssets(): Plugin {
  return {
    name: 'library-catalogue-assets',
    async configureServer(server) {
      const { assets } = await readCatalogueFiles();
      server.middlewares.use((request, response, next) => {
        const path = assets.get((request.url ?? '').split('?')[0]);
        if (!path || !['GET', 'HEAD'].includes(request.method ?? '')) return next();
        void readFile(path).then((buffer) => {
          response.setHeader('Content-Type', 'image/webp');
          response.setHeader('Content-Length', buffer.length);
          response.end(request.method === 'HEAD' ? undefined : buffer);
        }).catch(next);
      });
    },
    async generateBundle() {
      const { assets } = await readCatalogueFiles();
      for (const [url, path] of assets) this.emitFile({ type: 'asset', fileName: url.slice(1), source: await readFile(path) });
    },
  };
}
