import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleChatApi } from './src/api/chatHandler.ts';
import { checkDatabase } from './src/api/database.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  res.setHeader('Cache-Control', 'no-store');
  if (!accountId || !apiToken) {
    res.status(503).json({ error: 'AI model catalog is unavailable: Cloudflare credentials are not configured.', models: [], verified: false });
    return;
  }

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=100&hide_experimental=true`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    const payload = await response.json() as {
      success?: boolean;
      result?: Array<{ name?: string; id?: string; model?: string; task?: { name?: string } | string }>;
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || payload.success !== true) {
      console.error('AI_MODEL_CATALOG_FAILED', JSON.stringify({ status: response.status, errors: payload.errors || [] }));
      res.status(502).json({ error: 'The AI provider could not verify its model catalog. Try again later.', models: [], verified: false });
      return;
    }

    const models = (payload.result || [])
      .filter((item) => {
        const taskName = typeof item.task === 'string' ? item.task : item.task?.name;
        return Boolean(taskName && /text generation|text-generation|chat/i.test(taskName));
      })
      .map((item) => item.name || item.id || item.model || '')
      .filter((name): name is string => typeof name === 'string' && /^@cf\\/[a-zA-Z0-9._-]+\\/[a-zA-Z0-9._-]+$/.test(name))
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));

    res.json({ models, source: 'cloudflare-live-catalog', verified: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error('AI_MODEL_CATALOG_ERROR', error instanceof Error ? error.message : 'Unknown error');
    res.status(502).json({ error: 'Could not contact the AI provider to verify models.', models: [], verified: false });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
