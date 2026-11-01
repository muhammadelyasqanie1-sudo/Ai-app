import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { handleChatApi } from './src/api/chatHandler.ts';
import { getCloudflareModelCatalog } from './src/api/modelCatalog.ts';
import { randomUUID } from 'crypto';

function apiPlugin() {
  return {
    name: 'api-chat-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (pathname === '/api/chat') {
          await handleChatApi(req, res);
          return;
        }
        if (pathname === '/api/models' && req.method === 'GET') {
          const requestId = randomUUID();
          const catalog = await getCloudflareModelCatalog();
          res.statusCode = catalog.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Request-Id', requestId);
          console.info('API_REQUEST', JSON.stringify({ requestId, method: 'GET', path: '/api/models', status: catalog.status }));
          res.end(JSON.stringify(catalog.body));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
