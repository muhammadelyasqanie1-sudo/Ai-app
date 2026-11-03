import { ProviderAdapterError } from '../providers/providerTypes.ts';

export type AssistantToolMode = 'chat' | 'coding' | 'writing' | 'translation' | 'research';

const templates = ['email', 'article', 'blog', 'proposal', 'cv', 'cover-letter', 'social', 'product-description', 'ad', 'story', 'script'] as const;
const tones = ['neutral', 'professional', 'friendly', 'formal', 'persuasive', 'creative', 'academic', 'concise'] as const;
const styles = ['clear', 'plain', 'technical', 'narrative', 'bullet-points', 'structured'] as const;
const lengths = ['short', 'medium', 'long', 'detailed'] as const;
const languages = ['english', 'dari', 'pashto', 'arabic'] as const;
const translationLanguages = ['en', 'fa', 'ps', 'ar'] as const;
const codingTasks = ['generate','explain','debug','refactor','optimize','document','test','sql','git','general'] as const;

function choose<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number]) ? value as T[number] : fallback;
}

export function buildToolModePrompt(body: Record<string, unknown>, uiLanguage: 'english' | 'dari'): { mode: AssistantToolMode; prompt: string } {
  const mode = choose(body.toolMode, ['chat', 'coding', 'writing', 'translation', 'research'] as const, 'chat');
  if (mode === 'coding') {
    const task = choose(body.codingTask, codingTasks, 'general');
    return { mode, prompt: [
      'You are AFG AI Coding Assistant, a senior software engineer and careful code reviewer.',
      'Requested coding task: ' + task + '. Detect the programming language and framework from the request and code.',
      'Support code generation, explanation, debugging, refactoring, optimization, documentation generation, test generation, SQL, Git and GitHub guidance.',
      'Preserve stated constraints and existing behavior. Explain assumptions and risks. Provide complete code snippets when appropriate.',
      'Never claim to execute, compile, test, or inspect code unless a real isolated execution tool or supplied result confirms it.',
      'Never execute user code on the application server. Any future execution must use a dedicated isolated runner behind an explicit feature flag.',
      'Explain in the selected response language; keep code identifiers and syntax unchanged.'
    ].join(' ') };
  }
  if (mode === 'writing') {
    const template = choose(body.writingTemplate, templates, 'article');
    const tone = choose(body.writingTone, tones, 'neutral');
    const style = choose(body.writingStyle, styles, 'clear');
    const language = choose(body.writingLanguage, languages, uiLanguage);
    const length = choose(body.writingLength, lengths, 'medium');
    return { mode, prompt: `You are AFG AI Writing Studio. Produce a ${template} using structured settings: tone=${tone}; style=${style}; output_language=${language}; length=${length}. Treat these settings as authoritative controls. Preserve factual accuracy. Never invent credentials, facts, quotations, or sources; ask for missing critical facts rather than fabricating them.` };
  }
  if (mode === 'translation') {
    const source = body.sourceLanguage === 'auto' || body.sourceLanguage === undefined ? 'auto-detect' : choose(body.sourceLanguage, translationLanguages, 'en');
    const target = choose(body.targetLanguage, translationLanguages, 'en');
    return { mode, prompt: `You are AFG AI Translation. Translate faithfully from ${source} to ${target}. If the source is auto-detect, identify it from the text. Preserve meaning, names, numbers, Markdown, code blocks, tables and markup wherever possible. Do not summarize or add commentary unless requested. For long text, translate coherent context-aware sections and maintain terminology consistently. Language codes: en, fa, ps, ar.` };
  }
  if (mode === 'research') return { mode, prompt: 'You are AFG AI Web Research analyst. Use only the verified source URLs and excerpts supplied in the user message. Clearly separate Verified sources from AI interpretation. Never invent URLs, titles, quotations, dates, or facts. Cite claims with the exact supplied URLs. If sources do not support a conclusion, state the limitation.' };
  return { mode, prompt: '' };
}
