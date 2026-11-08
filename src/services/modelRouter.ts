import {
  getConfiguredFallbackModelIds,
  getVerifiedModelDescriptors,
} from './providerGateway.ts';
import type { CapabilityFlags, ModelDescriptor } from '../providers/providerTypes.ts';

export type RoutableCapability = keyof CapabilityFlags;
export interface ModelRoutingPolicy {
  capability: RoutableCapability;
  preferredModel?: string;
  preferredProvider?: string;
  providerOrder?: string[];
  preferOffline?: boolean;
  maxInputPerMillion?: number;
  maxOutputPerMillion?: number;
  limit?: number;
}

function healthy(model: ModelDescriptor): boolean {
  const checked = model.verifiedAt ? Date.parse(model.verifiedAt) : NaN;
  return model.enabled && Number.isFinite(checked) &&
    Date.now() - checked <= 5 * 60_000 && model.capabilities[modelRoutingCapability(model)];
}

function modelRoutingCapability(model: ModelDescriptor): RoutableCapability {
  // The caller performs the requested capability check; this helper is only
  // used by healthy() to ensure that descriptors have a meaningful capability.
  return Object.keys(model.capabilities).find(
    (key) => model.capabilities[key as RoutableCapability] === true,
  ) as RoutableCapability || 'text';
}

function localProvider(model: ModelDescriptor): boolean {
  return model.providerId === 'ollama';
}

function price(model: ModelDescriptor): number {
  const input = model.pricing?.inputPerMillion;
  const output = model.pricing?.outputPerMillion;
  return Number.isFinite(input) && Number.isFinite(output)
    ? Number(input) + Number(output)
    : Number.POSITIVE_INFINITY;
}

/**
 * Return only recently health-verified models that really advertise the requested
 * capability. Provider/model IDs are preserved exactly; manual selections are
 * never silently replaced. Auto routing may use this ordered candidate list.
 */
export async function routeVerifiedModels(
  policy: ModelRoutingPolicy,
): Promise<ModelDescriptor[]> {
  const [descriptors, fallbackIds] = await Promise.all([
    getVerifiedModelDescriptors(),
    getConfiguredFallbackModelIds(policy.capability),
  ]);
  const eligible = descriptors.filter((model) => {
    const checked = model.verifiedAt ? Date.parse(model.verifiedAt) : NaN;
    if (!model.enabled || !Number.isFinite(checked) ||
        Date.now() - checked > 5 * 60_000 ||
        model.capabilities[policy.capability] !== true) return false;
    const input = model.pricing?.inputPerMillion;
    const output = model.pricing?.outputPerMillion;
    if (policy.maxInputPerMillion !== undefined &&
        (!Number.isFinite(input) || Number(input) > policy.maxInputPerMillion)) return false;
    if (policy.maxOutputPerMillion !== undefined &&
        (!Number.isFinite(output) || Number(output) > policy.maxOutputPerMillion)) return false;
    return true;
  });
  const order = policy.providerOrder ??
    (process.env.AFG_AI_PROVIDER_ORDER || '').split(',').map((v) => v.trim()).filter(Boolean);
  const fallbackRank = new Map(fallbackIds.map((id, index) => [id, index]));
  return eligible.sort((a, b) => {
    const aId = a.providerId + '::' + a.id;
    const bId = b.providerId + '::' + b.id;
    if (policy.preferredModel) {
      if (aId === policy.preferredModel) return -1;
      if (bId === policy.preferredModel) return 1;
    }
    if (policy.preferOffline && localProvider(a) !== localProvider(b)) return localProvider(a) ? -1 : 1;
    if (policy.preferredProvider && (a.providerId === policy.preferredProvider) !== (b.providerId === policy.preferredProvider)) {
      return a.providerId === policy.preferredProvider ? -1 : 1;
    }
    const ar = fallbackRank.get(aId) ?? Number.MAX_SAFE_INTEGER;
    const br = fallbackRank.get(bId) ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    const ai = order.indexOf(a.providerId);
    const bi = order.indexOf(b.providerId);
    const ao = ai < 0 ? Number.MAX_SAFE_INTEGER : ai;
    const bo = bi < 0 ? Number.MAX_SAFE_INTEGER : bi;
    if (ao !== bo) return ao - bo;
    const ap = price(a), bp = price(b);
    if (ap !== bp) return ap - bp;
    return a.providerId.localeCompare(b.providerId) || a.id.localeCompare(b.id);
  }).slice(0, Math.max(1, Math.min(20, policy.limit ?? 10)));
}

export async function resolveVerifiedModel(
  policy: ModelRoutingPolicy,
): Promise<ModelDescriptor | null> {
  return (await routeVerifiedModels({ ...policy, limit: 1 }))[0] ?? null;
}
