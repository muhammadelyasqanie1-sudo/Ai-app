import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest } from './src/api/http.ts';
import { installConsoleSecretRedaction } from './src/security/redaction.ts';
import { pool } from './src/api/database.ts';
import { syncPublicApiCatalog } from './src/services/publicApiCatalog.ts';
import { getVerifiedModelDescriptors } from './src/services/providerGateway.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
installConsoleSecretRedaction();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const production = process.env.NODE_ENV === 'production';
const canonicalOrigin = (process.env.APP_ORIGIN || '').split(',')[0].trim().replace(/\/+$/, '');
const connectSources = new Set(["'self'", 'https://accounts.google.com', 'https://huggingface.co']);
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

// Lightweight liveness endpoint used by the client keepalive; does not trigger provider discovery.
app.head('/api/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.status(204).end(); });
app.get('/api/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ status: 'ok' }); });

// Keep one route table and one request boundary for Vite development and Express production.
app.use('/api', (req, res) => {
  void handleApiRequest(req, res);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

async function bootstrapProviderCatalog() {
  try {
    const models = await getVerifiedModelDescriptors();
    const chatModels = models.filter((model) =>
      model.enabled && model.verifiedAt !== null && model.capabilities.text && model.capabilities.streaming
    );
    const providerCounts = Object.fromEntries(
      [...new Set(models.map((model) => model.providerId))].map((providerId) => [
        providerId, models.filter((model) => model.providerId === providerId).length,
      ])
    );
    console.info('AFG_PROVIDER_CATALOG_BOOTSTRAP_COMPLETED', JSON.stringify({
      discovered: models.length,
      verifiedChatModels: chatModels.length,
      providerCounts,
    }));
  } catch (error) {
    console.warn('AFG_PROVIDER_CATALOG_BOOTSTRAP_FAILED', JSON.stringify({
      error: error instanceof Error ? error.message.slice(0, 240) : 'unknown_error',
    }));
  }
}

async function bootstrapPublicApiCatalog() {
  if (!pool) {
    console.warn('AFG_PUBLIC_API_CATALOG_BOOTSTRAP_SKIPPED', JSON.stringify({ reason: 'database_unavailable' }));
    return;
  }
  try {
    const existing = await pool.query('SELECT count(*)::int AS total FROM public_api_catalog WHERE is_active=true');
    const total = Number(existing.rows[0]?.total || 0);
    if (total > 0) {
      console.info('AFG_PUBLIC_API_CATALOG_BOOTSTRAP_SKIPPED', JSON.stringify({ reason: 'catalog_already_populated', total }));
      return;
    }
    const result = await syncPublicApiCatalog();
    console.info('AFG_PUBLIC_API_CATALOG_BOOTSTRAP_COMPLETED', JSON.stringify(result));
  } catch (error) {
    console.warn('AFG_PUBLIC_API_CATALOG_BOOTSTRAP_FAILED', JSON.stringify({
      error: error instanceof Error ? error.message.slice(0, 300) : 'unknown_error',
    }));
  }
}

app.listen(PORT, () => {
  console.info('SERVER_LISTENING', JSON.stringify({ port: PORT, service: 'afg-ai-api' }));
  void bootstrapPublicApiCatalog();
  void bootstrapProviderCatalog();
});
