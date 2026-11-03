export const OFFLINE_MODEL_CATEGORIES = [
  'coding',
  'learning',
  'english',
  'robotics',
  'mathematics',
  'science',
  'creative',
  'general',
] as const;

export type OfflineModelCategory = typeof OFFLINE_MODEL_CATEGORIES[number];

const RULES: Array<{ category: OfflineModelCategory; pattern: RegExp }> = [
  { category: 'learning', pattern: /\\b(education|educational|learning|teaching|tutor)\\b/i },
  { category: 'coding', pattern: /\b(code|coding|programming|developer|software|repository|debug|javascript|typescript|python|java|rust|sql)\b/i },
  { category: 'english', pattern: /\b(english|grammar|vocabulary|translation|language learning|ielts|toefl|esl)\b/i },
  { category: 'robotics', pattern: /\b(robot|robotics|ros|autonomous|navigation|actuator|kinematics|slam)\b/i },
  { category: 'mathematics', pattern: /\b(math|mathematics|algebra|geometry|calculus|arithmetic|theorem|equation)\b/i },
  { category: 'science', pattern: /\b(science|physics|chemistry|biology|astronomy|geology|scientific|medical-science)\b/i },
  { category: 'creative', pattern: /\b(creative|writing|story|poetry|novel|screenplay|marketing|copywriting)\b/i },
];

export function classifyOfflineModel(tags: string[], pipeline: string | null, modelId = ''): OfflineModelCategory[] {
  const source = [modelId, pipeline || '', ...tags].join(' ').toLowerCase().replace(/[-_/.:]+/g, ' ');
  const found = RULES.filter(rule => rule.pattern.test(source)).map(rule => rule.category);
  if (found.includes('english') || found.includes('robotics') || found.includes('mathematics') || found.includes('science')) {
    found.push('learning');
  }
  return found.length ? Array.from(new Set(found)) : ['general'];
}

export function isOfflineModelCategory(value: string): value is OfflineModelCategory {
  return (OFFLINE_MODEL_CATEGORIES as readonly string[]).includes(value);
}
