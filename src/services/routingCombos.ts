import { pool } from '../api/database.ts';
import type { ModelDescriptor } from '../providers/providerTypes.ts';

export interface RoutingCombo {
  slug: string;
  displayName: string;
  strategy: 'fallback' | 'round_robin';
  modelIds: string[];
  fallbackOnError: boolean;
}

export async function resolveRoutingCombo(slug: string): Promise<RoutingCombo | null> {
  if (!pool || !/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) return null;
  try {
    const result = await pool.query(
      `UPDATE routing_combos
          SET next_index = CASE
            WHEN strategy='round_robin' AND cardinality(model_ids)>0
              THEN (next_index + 1) % cardinality(model_ids)
            ELSE next_index
          END
        WHERE slug=$1 AND enabled=true
        RETURNING slug,display_name,strategy,model_ids,fallback_on_error,
          CASE WHEN strategy='round_robin' AND cardinality(model_ids)>0
            THEN (next_index + cardinality(model_ids) - 1) % cardinality(model_ids)
            ELSE 0 END AS selected_index`,
      [slug],
    );
    const row = result.rows[0];
    if (!row || !Array.isArray(row.model_ids)) return null;
    const ids = row.model_ids.filter((id: unknown): id is string =>
      typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,47}::[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/.test(id),
    );
    if (!ids.length) return null;
    const selectedIndex = Math.max(0, Math.min(ids.length - 1, Number(row.selected_index) || 0));
    const ordered = row.strategy === 'round_robin'
      ? [...ids.slice(selectedIndex), ...ids.slice(0, selectedIndex)]
      : ids;
    return {
      slug: String(row.slug),
      displayName: String(row.display_name),
      strategy: row.strategy === 'round_robin' ? 'round_robin' : 'fallback',
      modelIds: Boolean(row.fallback_on_error) ? ordered : ordered.slice(0, 1),
      fallbackOnError: Boolean(row.fallback_on_error),
    };
  } catch (error) {
    console.warn('AFG_ROUTING_COMBO_RESOLVE_FAILED', JSON.stringify({
      slug, error: error instanceof Error ? error.message : 'unknown_error',
    }));
    return null;
  }
}

export function matchComboModels(combo: RoutingCombo, descriptors: ModelDescriptor[]): ModelDescriptor[] {
  return combo.modelIds.map((id) => {
    const separator = id.indexOf('::');
    const providerId = id.slice(0, separator);
    const modelId = id.slice(separator + 2);
    return descriptors.find((model) => model.providerId === providerId && model.id === modelId &&
      model.enabled && model.verifiedAt && Date.now() - Date.parse(model.verifiedAt) <= 5 * 60 * 1000 &&
      model.capabilities.text && model.capabilities.streaming);
  }).filter((model): model is ModelDescriptor => Boolean(model));
}
