/** Public provider package boundary; implementations stay server-side in src/providers during migration. */
export * from '../../../src/providers/providerTypes';
export { createOpenAICompatibleAdapter } from '../../../src/providers/openAiCompatible';
