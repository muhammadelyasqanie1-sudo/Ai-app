import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['src', 'plugins'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const files: string[] = [];

function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') walk(path);
    } else if (extensions.has(path.slice(path.lastIndexOf('.')))) {
      files.push(path);
    }
  }
}

for (const directory of sourceRoots) walk(join(root, directory));
const uses: Array<{ path: string; lines: number[] }> = [];
for (const path of files) {
  const content = readFileSync(path, 'utf8');
  if (!content.includes('@afg-ai/capacitor-jarvis') && !content.includes('AFGJarvis.')) continue;
  const lines = content.split(/\r?\n/);
  const matched = lines.flatMap((line, index) =>
    line.includes('@afg-ai/capacitor-jarvis') || line.includes('AFGJarvis.')
      ? [index + 1]
      : [],
  );
  uses.push({ path: relative(root, path), lines: matched });
}

const callsites = uses.filter(item =>
  item.lines.some(line => {
    const content = readFileSync(join(root, item.path), 'utf8').split(/\r?\n/)[line - 1];
    return content.includes('AFGJarvis.');
  }),
);
const allowedCallers = [
  'src/components/afg/AfgJarvisView.tsx',
  'src/lib/offlineLlamaRuntime.ts',
  'src/lib/offlineModelDownloads.ts',
];
assert.deepEqual(
  callsites.map(item => item.path).sort(),
  [...allowedCallers].sort(),
  'Native phone/device actions must remain in the guarded screen; only the two model-service adapters may call their dedicated model APIs.',
);
const serviceMethods: Record<string, string[]> = {
  'src/lib/offlineLlamaRuntime.ts': ['generateLocalResponse', 'getLocalModelRuntimeInfo', 'loadLocalModel', 'unloadLocalModel'],
  'src/lib/offlineModelDownloads.ts': ['addListener', 'downloadLocalModel', 'listLocalModels'],
};
for (const [path, allowed] of Object.entries(serviceMethods)) {
  const content = readFileSync(join(root, path), 'utf8');
  const methods = [...content.matchAll(/AFGJarvis\.([A-Za-z0-9_]+)\(/g)].map(match => match[1]);
  assert.deepEqual([...new Set(methods)].sort(), [...allowed].sort(), path + ' may call only its explicitly scoped local-model service APIs.');
}
assert.ok(
  uses.some(item => item.path === 'src/components/afg/AfgJarvisView.tsx'),
  'The guarded AfgJarvisView must remain the native phone/device action caller.',
);

console.log('JARVIS plugin callsite audit: phone controls remain behind the guarded screen; local model adapters use only their dedicated model APIs.');
