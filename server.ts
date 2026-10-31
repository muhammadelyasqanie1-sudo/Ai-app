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
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: 'Claude API is not configured. Add ANTHROPIC_API_KEY in Render Environment.' });
    return;
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const details = await response.text();
      console.error('Claude model list failed:', response.status, details.slice(0, 800));
      res.status(response.status).json({ error: 'Could not load Claude models' });
      return;
    }
    const payload = await response.json() as { data?: Array<{ id?: string; display_name?: string }> };
    const models = (payload.data || [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ models });
  } catch (error) {
    console.error('Claude model list failed:', error);
    res.status(502).json({ error: 'Could not load Claude models' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
