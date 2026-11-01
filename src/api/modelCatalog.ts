import { getVerifiedProviderCatalog } from '../services/providerGateway.ts';

export interface VerifiedModelCatalog {
  status: number;
  body: {
    error?: string;
    models: string[];
    source?: string;
    verified: boolean;
    checkedAt?: string;
  };
}

export async function getProviderModelCatalog(): Promise<VerifiedModelCatalog> {
  const catalog = await getVerifiedProviderCatalog();
  return {
    status: catalog.status,
    body: {
      ...(catalog.error ? { error: catalog.error } : {}),
      models: catalog.models.map((model) => model.providerId + '::' + model.id),
      ...(catalog.verified ? { source: 'provider-registry-live-catalog', checkedAt: catalog.checkedAt } : {}),
      verified: catalog.verified,
    },
  };
}
