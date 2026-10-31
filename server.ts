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
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: 'NVIDIA API is not configured' });
    return;
  }
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: 'Could not load NVIDIA models' });
      return;
    }
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const models = (payload.data || []).map((item) => item.id).filter((id): id is string => Boolean(id));
    res.json({ models });
  } catch (error) {
    console.error('NVIDIA model list failed:', error);
    res.status(502).json({ error: 'Could not load NVIDIA models' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
