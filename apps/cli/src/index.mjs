#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const CONFIG_DIR = join(homedir(), '.afg');
const CONFIG_FILE = join(CONFIG_DIR, 'config.toml');
const HELP = `AFG AI CLI

Usage:
  afg login --url <https://your-afg-ai-host>
  afg logout
  afg whoami
  afg models list
  afg conv list
  afg files list
  afg term <command>       (disabled unless an isolated sandbox is deployed)
  afg --help
  afg version

Authentication:
  Run "afg login --url https://your-host" and paste a scoped CLI token.
  Tokens are stored in ~/.afg/config.toml with mode 0600.
`;

function parseToml(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+)\s*=\s*"((?:\\.|[^"])*)"/);
    if (match) result[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
  }
  return result;
}
async function loadConfig() {
  try { return parseToml(await readFile(CONFIG_FILE, 'utf8')); }
  catch { return { api_url: process.env.AFG_API_URL || '' }; }
}
async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const quote = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const content = `api_url = "${quote(config.api_url)}"\ntoken = "${quote(config.token)}"\n`;
  await writeFile(CONFIG_FILE, content, { mode: 0o600 });
  await chmod(CONFIG_FILE, 0o600);
  await chmod(CONFIG_DIR, 0o700);
}
function exit(code, message) { if (message) stdout.write(message + '\n'); process.exitCode = code; }
async function promptSecret(label) {
  stdout.write(label);
  if (!stdin.isTTY) throw Object.assign(new Error('Interactive terminal required.'), { code: 1 });
  stdin.setRawMode(true); stdin.resume();
  let value = '';
  try {
    for await (const chunk of stdin) {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') throw Object.assign(new Error('Cancelled.'), { code: 1 });
        if (char === '\r' || char === '\n') { stdout.write('\n'); return value; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && char <= '~') value += char;
      }
    }
  } finally { stdin.setRawMode(false); stdin.pause(); }
  return value;
}
async function request(config, path, options = {}) {
  if (!config.api_url || !/^https?:\/\//i.test(config.api_url)) throw Object.assign(new Error('Set API URL with afg login --url https://your-host'), { code: 1 });
  if (!config.token) throw Object.assign(new Error('Not logged in. Run afg login.'), { code: 2 });
  let response;
  try {
    response = await fetch(new URL(path, config.api_url), {
      ...options,
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch { throw Object.assign(new Error('Network request failed.'), { code: 3 }); }
  const requestId = response.headers.get('x-request-id') || '';
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const code = response.status === 401 ? 2 : response.status === 403 ? 4 : response.status >= 500 ? 3 : 1;
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { code, requestId });
  }
  return { data, requestId };
}
async function getSession(config) {
  const listed = await request(config, '/api/terminal/sessions');
  let session = listed.data.sessions?.find(item => !item.revoked_at);
  if (!session) {
    const created = await request(config, '/api/terminal/sessions', { method: 'POST', body: JSON.stringify({ surface: 'cli' }) });
    session = created.data.session;
  }
  if (!session?.id) throw Object.assign(new Error('Could not create a Terminal session.'), { code: 3 });
  return session.id;
}
async function nativeCommand(config, command) {
  const sessionId = await getSession(config);
  return request(config, `/api/terminal/sessions/${sessionId}/commands`, { method: 'POST', body: JSON.stringify({ command }) });
}

async function main() {
  const args = process.argv.slice(2);
  const [group, action] = args;
  if (!args.length || group === '--help' || group === '-h' || action === '--help') return stdout.write(HELP);
  if (group === 'version' || group === '--version') return stdout.write('AFG AI CLI 0.1.0 (API client)\n');
  const config = await loadConfig();

  if (group === 'login') {
    const urlIndex = args.indexOf('--url');
    const apiUrl = urlIndex >= 0 ? args[urlIndex + 1] : config.api_url;
    if (!apiUrl || !/^https:\/\//i.test(apiUrl)) return exit(1, 'Provide a valid HTTPS URL: afg login --url https://your-host');
    const token = await promptSecret('Paste scoped AFG CLI token (input hidden): ');
    if (!token.startsWith('afg_cli_') || token.length < 30) return exit(2, 'Invalid token format.');
    const candidate = { api_url: apiUrl.replace(/\/$/, ''), token };
    const { data } = await request(candidate, '/api/terminal/whoami');
    await saveConfig(candidate);
    return stdout.write(`Authenticated as ${data.user?.id || 'AFG AI user'}. Token saved securely.\n`);
  }
  if (group === 'logout') {
    try { await unlink(CONFIG_FILE); } catch {}
    return stdout.write('Local CLI credentials removed. Server-side token remains active; revoke it in AFG AI Settings.\n');
  }
  if (group === 'whoami') {
    const { data } = await request(config, '/api/terminal/whoami');
    return stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
  if (group === 'models' && action === 'list') {
    const { data, requestId } = await nativeCommand(config, 'afg models list');
    stdout.write((data.output || '') + `\nRequest ID: ${data.requestId || requestId}\n`); return;
  }
  if (group === 'conv' && action === 'list') {
    const { data, requestId } = await nativeCommand(config, 'afg conv list');
    stdout.write((data.output || '') + `\nRequest ID: ${data.requestId || requestId}\n`); return;
  }
  if (group === 'files' && action === 'list') {
    const { data, requestId } = await nativeCommand(config, 'afg files list');
    stdout.write((data.output || '') + `\nRequest ID: ${data.requestId || requestId}\n`); return;
  }
  if (group === 'term') return exit(4, 'Terminal shell execution is disabled. No shell is available on the application server.');
  if (group === 'chat' || group === 'image' || group === 'admin' || group === 'offline' || group === 'token') {
    return exit(1, `This command is not implemented in this CLI release: afg ${args.join(' ')}. Run afg --help for supported commands.`);
  }
  return exit(1, `Unknown command: afg ${args.join(' ')}. Run afg --help.`);
}

main().catch(error => {
  const code = Number.isInteger(error?.code) ? error.code : 3;
  const suffix = error?.requestId ? ` (Request ID: ${error.requestId})` : '';
  exit(code, `AFG CLI: ${error?.message || 'Unexpected error'}${suffix}`);
});
