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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: 'OpenAI API is not configured' });
    return;
  }
  try {
    const configuredBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const baseUrl = configuredBaseUrl.endsWith('/') ? configuredBaseUrl.slice(0, -1) : configuredBaseUrl;
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      const details = await response.text();
      console.error('OpenAI model list failed:', response.status, details.slice(0, 800));
      res.status(response.status).json({ error: 'Could not load OpenAI models' });
      return;
    }
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const models = (payload.data || [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ models });
  } catch (error) {
    console.error('OpenAI model list failed:', error);
    res.status(502).json({ error: 'Could not load OpenAI models' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
