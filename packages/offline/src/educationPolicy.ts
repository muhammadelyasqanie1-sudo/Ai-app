export const OFFLINE_SCOPE_REFUSAL = "I'm your offline study tutor. I can help with English, science, math, and school subjects. Please switch to online AFG AI for general questions.";
export const OFFLINE_HIGH_STAKES_REFUSAL = "I can’t provide medical, legal, financial, or safety-critical advice. Please ask a qualified professional or trusted adult.";

const HIGH_STAKES = /\b(medical|medicine|diagnos(?:e|is)|symptom|treatment|dose|prescription|lawyer|legal advice|lawsuit|invest(?:ment|ing)|stock|crypto|loan|tax advice|weapon|explosive|suicide|self[- ]harm|emergency|fire|electrical repair)\b/i;
const EDUCATIONAL = /\b(english|grammar|vocabulary|pronunciation|reading|writing|essay|algebra|geometry|calculus|arithmetic|math(?:ematics)?|equation|fraction|physics|chemistry|biology|science|history|geography|school|homework|lesson|quiz|exam|study|photosynthesis|atom|molecule|force|energy|cell|periodic table|computer science|programming basics)\b/i;

export type EducationDecision = { allowed:true } | { allowed:false; reason:'high_stakes'|'out_of_scope'; message:string };

/**
 * Conservative first-pass policy gate for an offline educational tutor.
 * This is not a semantic classifier and must be combined with a pack-specific
 * tutor prompt and response validation before any model runtime is enabled.
 */
export function evaluateOfflineEducationRequest(input: string): EducationDecision {
  const text = input.trim();
  if (!text) return { allowed:false, reason:'out_of_scope', message:OFFLINE_SCOPE_REFUSAL };
  if (HIGH_STAKES.test(text)) return { allowed:false, reason:'high_stakes', message:OFFLINE_HIGH_STAKES_REFUSAL };
  if (!EDUCATIONAL.test(text)) return { allowed:false, reason:'out_of_scope', message:OFFLINE_SCOPE_REFUSAL };
  return { allowed:true };
}
