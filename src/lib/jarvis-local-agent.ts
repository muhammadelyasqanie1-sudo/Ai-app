const JARVIS_ALLOWED_COMMANDS = [
  'open Android Settings',
  'open YouTube',
  'open Telegram',
  'open WhatsApp',
  'back',
  'home',
  'notifications',
  'quick settings',
  'scroll down',
  'scroll up',
  'battery status',
  'network status',
  'list sensors',
  'vibrate',
  'turn on flashlight',
  'turn off flashlight',
  'get my location',
  'show contacts',
  'read recent sms',
  'open camera',
] as const;

/** Build a constrained multilingual intent prompt; the model is not allowed to invoke tools. */
export function buildJarvisLocalCommandPrompt(language: string): string {
  const languageName = language === 'pashto' ? 'Pashto' : language === 'dari' || language === 'persian' ? 'Dari/Persian' : 'the user’s language';
  return [
    'You are JARVIS, an offline command-intent translator for an Android phone.',
    'Understand the user in English, Afghan Dari/Persian, or Pashto (' + languageName + ').',
    'Return exactly one JSON object and nothing else: {"command":"EXACT_COMMAND"}',
    'The command value must be copied exactly from this allowlist:',
    ...JARVIS_ALLOWED_COMMANDS,
    'If the request is ambiguous, unsupported, asks for an arbitrary action, or is not a device command, return {"command":""}.',
    'Never invent commands, arguments, package names, phone numbers, message text, or permissions.',
    'Never claim an action has been performed. The application will validate the command and ask the user to confirm it.',
    'Do not include Markdown, explanations, or extra JSON properties.',
  ].join('\n');
}

/** Accept only a bounded JSON command envelope; the deterministic parser validates the command next. */
export function extractJarvisLocalCommand(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 4000) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { command?: unknown };
    if (typeof parsed.command !== 'string') return null;
    const command = parsed.command.trim();
    return command.length > 0 && command.length <= 120 ? command : null;
  } catch {
    return null;
  }
}
