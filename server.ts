import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest } from './src/api/http.ts';
import { installConsoleSecretRedaction } from './src/security/redaction.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
installConsoleSecretRedaction();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const production = process.env.NODE_ENV === 'production';
const canonicalOrigin = (process.env.APP_ORIGIN || '').split(',')[0].trim().replace(/\/+$/, '');
const connectSources = new Set([
  "'self'",
  'https://accounts.google.com',
  'https://huggingface.co',
  'https://cdn-lfs.huggingface.co',
  'https://cdn-lfs-us-1.huggingface.co',
  'https://cdn-lfs-eu-1.huggingface.co',
  'https://cas-bridge.xethub.hf.co',
  'https://cas-server.xethub.hf.co',
  'https://transfer.xethub.hf.co',
]);
for (const candidate of [process.env.VITE_API_BASE_URL || '']) {
  try { connectSources.add(new URL(candidate).origin); } catch { /* ignore invalid optional origins */ }
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  if (production && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  if (production && !req.secure) {
    if (!canonicalOrigin.startsWith('https://')) {
      res.status(400).send('HTTPS is required and APP_ORIGIN must be configured.');
      return;
    }
    res.redirect(308, canonicalOrigin + req.originalUrl);
    return;
  }
  if (production) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src " + [...connectSources].join(' '),
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join('; '));
  }
  next();
});

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
