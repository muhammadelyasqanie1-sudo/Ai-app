import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { handleChatApi } from './src/api/chatHandler.ts';
import { checkDatabase } from './src/api/database.ts';
import { getCloudflareModelCatalog } from './src/api/modelCatalog.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use('/api', (req, res, next) => {
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  const origin = req.headers.origin;
  const configuredOrigins = (process.env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = new Set([...configuredOrigins, 'capacitor://localhost', 'https://localhost', 'http://localhost', 'http://localhost:3000', 'http://localhost:5173']);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.status(204).end();
    return;
  }
  res.on('finish', () => {
    console.info('API_REQUEST', JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
    }));
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', service: 'afg-ai-api', timestamp: new Date().toISOString() });
});

app.get('/api/ready', async (_req, res) => {
  const database = await checkDatabase();
  const ready = database.configured && database.connected;
  res.setHeader('Cache-Control', 'no-store');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', database });
});

app.all('/api/chat', (req, res) => {
  handleChatApi(req, res);
});

app.get('/api/models', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const catalog = await getCloudflareModelCatalog();
  res.status(catalog.status).json(catalog.body);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
