const SECRET_PATTERNS: Array<[RegExp,string]> = [
  [/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_API_KEY]'],
  [/((?:api[_-]?key|client[_-]?secret|secret|password|passwd|token|authorization|access[_-]?key|private[_-]?key)\s*[:=]\s*)(["']?)[^\s"',;}]+/gi, '$1[REDACTED]'],
  [/((?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|CLOUDFLARE|RESEND|TAVILY|AFG)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*)(["']?)[^\s"',;}]+/gi, '$1[REDACTED]'],
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /(?:api.?key|secret|password|token|authorization|credential|private.?key)/i.test(key) ? '[REDACTED]' : redactSecrets(item),
    ]));
  }
  return value;
}

export function installConsoleSecretRedaction(): void {
  for (const method of ['log','info','warn','error','debug'] as const) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => original(...args.map(redactSecrets))) as typeof console[typeof method];
  }
}
