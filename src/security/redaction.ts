const SECRET_PATTERNS: Array<[RegExp,string]> = [
  [/(\\bBearer\\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]'],
  [/(\\b)(sk-[A-Za-z0-9_-]{8,})/g, '$1[REDACTED_API_KEY]'],
  [/(\\b)(gh[pousr]_[A-Za-z0-9_]{20,})/g, '$1[REDACTED_GITHUB_TOKEN]'],
  [/(\\b)(github_pat_[A-Za-z0-9_]{20,})/g, '$1[REDACTED_GITHUB_TOKEN]'],
  [/(\\b)(xox[baprs]-[A-Za-z0-9-]{10,})/g, '$1[REDACTED_SLACK_TOKEN]'],
  [/((?:api[_-]?key|client[_-]?secret|secret|password|passwd|token|authorization|access[_-]?key|private[_-]?key|refresh[_-]?token|session[_-]?id)\\s*[:=]\\s*)(["']?)[^\\s"',;}]+/gi, '$1[REDACTED]'],
  [/((?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|CLOUDFLARE|RESEND|TAVILY|AFG|DATABASE)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|URL)\\s*=\\s*)(["']?)[^\\s"',;}]+/gi, '$1[REDACTED]'],
  [/(postgres(?:ql)?:\\/\\/[^:\s/@]+):([^@\\s/]+)(@)/gi, '$1:[REDACTED]$3'],
];

const SECRET_KEYS = /(?:api.?key|secret|password|passwd|token|authorization|credential|private.?key|cookie|session.?id|database.?url|connection.?string)/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 30) return '[REDACTED_NESTED_VALUE]';
  if (typeof value === 'string') return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEYS.test(key) ? '[REDACTED]' : redactSecrets(item, depth + 1),
    ]));
  }
  return value;
}

export function installConsoleSecretRedaction(): void {
  for (const method of ['log','info','warn','error','debug'] as const) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => original(...args.map((value) => redactSecrets(value)))) as typeof console[typeof method];
  }
}
