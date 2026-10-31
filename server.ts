import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleChatApi } from './src/api/chatHandler.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.all('/api/chat', (req, res) => {
  handleChatApi(req, res);
});

app.get('/api/models', async (_req, res) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) {
    res.status(503).json({ error: 'Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Render Environment.' });
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
    if (!response.ok || payload.success === false) {
      console.error('Cloudflare model list failed:', response.status, JSON.stringify(payload.errors || []).slice(0, 800));
      res.status(response.status || 502).json({ error: 'Could not load Cloudflare Workers AI models.' });
      return;
    }

    const models = (payload.result || [])
      .filter((item) => {
        const taskName = typeof item.task === 'string' ? item.task : item.task?.name;
        return !taskName || /text generation|text-generation|chat/i.test(taskName);
      })
      .map((item) => item.name || item.id || item.model || '')
      .filter((name): name is string => typeof name === 'string' && name.startsWith('@cf/'))
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      res.status(502).json({ error: 'Cloudflare returned no compatible text-generation models. Check Workers AI permissions.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ models });
  } catch (error) {
    console.error('Cloudflare model list failed:', error);
    res.status(502).json({ error: 'Could not load Cloudflare Workers AI models.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
