/**
 * Load Destination Pack rule bundles into TravelCausalRule registry entries.
 */

import { loadCountryPackRules } from '../../decision-runtime/packs/rules/pack-rule-bundle.loader';
import type { TravelCausalRule } from '../types/travel-causal-rule.types';
import { mapPackRulesToTravelCausalRules } from './map-pack-rule-to-travel-causal-rule';

const packCache = new Map<string, TravelCausalRule[]>();

export function loadPackTravelCausalRules(countryCode: string): TravelCausalRule[] {
  const cc = countryCode.trim().toUpperCase();
  const cached = packCache.get(cc);
  if (cached) return cached;

  try {
    const packRules = loadCountryPackRules(cc);
    const mapped = mapPackRulesToTravelCausalRules(packRules, { destinationPack: cc });
    packCache.set(cc, mapped);
    return mapped;
  } catch {
    packCache.set(cc, []);
    return [];
  }
}

/** Test helper — clear memoized pack loads. */
export function clearPackTravelCausalRuleCache(): void {
  packCache.clear();
}
