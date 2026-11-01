import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest } from './src/api/http.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Keep one route table and one request boundary for Vite development and Express production.
app.use('/api', (req, res) => {
  void handleApiRequest(req, res);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.info('SERVER_LISTENING', JSON.stringify({ port: PORT, service: 'afg-ai-api' }));
});
