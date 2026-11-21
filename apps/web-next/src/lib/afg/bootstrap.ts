import { db } from "@/lib/db";

/**
 * First-run platform bootstrap: default feature flags and the built-in
 * AFG Cloud model catalog. Idempotent and safe to call on every request.
 */

let flagsSeeded = false;
let modelsSeeded = false;

export const DEFAULT_FLAGS: Record<string, { enabled: boolean; description: string }> = {
  web_search: { enabled: true, description: "Live web search grounding in chat" },
  voice_assistant: { enabled: true, description: "Voice input and spoken replies" },
  image_generation: { enabled: true, description: "Generate images from text prompts" },
  file_analysis: { enabled: true, description: "Upload and analyze documents and data files" },
  vision: { enabled: true, description: "Image understanding via vision-capable models" },
  share_links: { enabled: true, description: "Shareable read-only conversation links" },
  guest_mode: { enabled: true, description: "Allow guest sessions without registration" },
  offline_hub: { enabled: true, description: "Offline hub with cached conversations" },
};

export async function ensurePlatformSeeded(): Promise<void> {
  if (!flagsSeeded) {
    for (const [key, def] of Object.entries(DEFAULT_FLAGS)) {
      await db.featureFlag.upsert({
        where: { key },
        create: { key, enabled: def.enabled, description: def.description },
        update: { description: def.description },
      });
    }
    flagsSeeded = true;
  }
}

const AFG_CLOUD_MODELS = [
  { modelId: "afg-cloud-chat", displayName: "AFG Cloud — Chat", capabilities: ["chat", "coding", "tools"] },
  { modelId: "afg-cloud-vision", displayName: "AFG Cloud — Vision", capabilities: ["chat", "vision", "coding"] },
  { modelId: "afg-cloud-reasoning", displayName: "AFG Cloud — Reasoning", capabilities: ["chat", "reasoning", "coding"] },
];

export async function ensureAfgCloudModels(): Promise<void> {
  if (modelsSeeded) return;
  const provider = await db.provider.findUnique({ where: { slug: "afg-cloud" } });
  if (!provider) return;
  for (const m of AFG_CLOUD_MODELS) {
    const slug = `afg-cloud:${m.modelId}`;
    await db.model.upsert({
      where: { slug },
      create: {
        providerId: provider.id,
        modelId: m.modelId,
        slug,
        displayName: m.displayName,
        capabilities: JSON.stringify(m.capabilities),
        contextWindow: 32768,
        enabled: true,
        lastVerifiedAt: new Date(),
      },
      update: { lastVerifiedAt: new Date() },
    });
  }
  modelsSeeded = true;
}
