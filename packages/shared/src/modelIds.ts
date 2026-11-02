/** Canonical model ID contract shared by the browser and server. */
export const AUTO_MODEL_ID = 'auto' as const;
export function createModelId(providerId: string, modelId: string): string {
  if (!providerId.trim() || !modelId.trim() || providerId.includes('::') || modelId.includes('::')) {
    throw new TypeError('Provider and model IDs must be non-empty and cannot contain the separator.');
  }
  return `${providerId}::${modelId}`;
}
export function parseModelId(value: string): { providerId: string; modelId: string } | null {
  const separator = value.indexOf('::');
  if (separator <= 0 || separator !== value.lastIndexOf('::') || separator + 2 >= value.length) return null;
  return { providerId: value.slice(0, separator), modelId: value.slice(separator + 2) };
}
export function isModelId(value: string): boolean {
  return value === AUTO_MODEL_ID || /^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}(?:::[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299})?$/.test(value);
}
