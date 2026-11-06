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

export type JarvisNeedleConfig = { systemPrompt: string; toolsJson: string };

export function buildJarvisNeedleCommandConfig(language: string): JarvisNeedleConfig {
  const languageName = language === 'pashto' ? 'Afghan Pashto' : language === 'dari' || language === 'persian' ? 'Afghan Dari/Persian' : 'English, Dari and Pashto';
  const systemPrompt = [
    'You are JARVIS, a cautious offline Android command-intent classifier.',
    'Understand short user requests in English, Afghan Dari/Persian, and Pashto (' + languageName + ').',
    'Use the jarvis_command function only when one exact supported command clearly matches the request.',
    'Never execute anything. You only propose one command for the app to validate and ask the user to confirm.',
    'For unclear, unsupported, conversational, or multi-step requests, do not call a function.',
    'Never invent app names, package names, phone numbers, message contents, arguments, or permissions.',
    'Choose exactly one enum value from the tool schema. No other action is permitted.',
  ].join(' ');
  const toolsJson = JSON.stringify([{
    name: 'jarvis_command',
    description: 'Propose one safe, allowlisted Android command. This function is never executed by the model.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: [...JARVIS_ALLOWED_COMMANDS], description: 'One exact command copied from the allowed values.' },
      },
      required: ['command'],
    },
  }]);
  return { systemPrompt, toolsJson };
}

/** Extract one high-confidence proposal from Needle's structured function-call response. */
export function extractJarvisNeedleCommand(raw: string, minimumConfidence = 0.65): string | null {
  if (typeof raw !== 'string' || raw.length > 16000) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      confidence?: unknown;
      function_calls?: unknown;
    };
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < minimumConfidence || confidence > 1) return null;
    if (!Array.isArray(parsed.function_calls) || parsed.function_calls.length !== 1) return null;
    const call = parsed.function_calls[0] as { name?: unknown; arguments?: unknown; args?: unknown };
    if (!call || call.name !== 'jarvis_command') return null;
    let args: unknown = call.arguments ?? call.args;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { return null; }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
    const command = (args as { command?: unknown }).command;
    if (typeof command !== 'string' || command.length > 120) return null;
    const candidate = command.trim();
    return (JARVIS_ALLOWED_COMMANDS as readonly string[]).includes(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
