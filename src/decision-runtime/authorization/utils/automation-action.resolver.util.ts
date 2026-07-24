/**
 * Resolve effective automation permission tier for a semantic action.
 */

import type { AutomationPolicy } from '../../../trips/trip-constraint-solver/types/travel-decision-contract.types';
import {
  type AutomationActionDefinition,
  type AutomationPermissionTier,
  pickMostRestrictiveTier,
  resolveMatchingAutomationActions,
} from '../automation-action.catalog';

export interface EffectiveAutomationResolution {
  tier: AutomationPermissionTier;
  matchedActions: AutomationActionDefinition[];
  reasonCodes: string[];
}

function applyFloorTier(
  tier: AutomationPermissionTier,
  actions: AutomationActionDefinition[],
): AutomationPermissionTier {
  const floors = actions
    .map((a) => a.floorTier)
    .filter((f): f is 'ASK' | 'DENY' => f != null);

  if (floors.includes('DENY') && tier === 'AUTO') return 'DENY';
  if (floors.includes('ASK') && tier === 'AUTO') return 'ASK';
  return tier;
}

function tierFromLegacyLists(
  blob: string,
  automation: AutomationPolicy,
): AutomationPermissionTier | undefined {
  const confirmKeys = automation.confirmationRequired ?? [];
  if (confirmKeys.some((key) => blob.includes(key.toLowerCase().replace(/_/g, ' ')))) {
    return 'ASK';
  }

  const autoKeys = automation.autoAllowed ?? [];
  if (autoKeys.some((key) => blob.includes(key.toLowerCase().replace(/_/g, ' ')))) {
    return 'AUTO';
  }

  return undefined;
}

function tierFromUserOverride(
  actions: AutomationActionDefinition[],
  overrides?: Partial<Record<string, AutomationPermissionTier>>,
): AutomationPermissionTier | undefined {
  if (!overrides || actions.length === 0) return undefined;

  const tiers = actions
    .map((a) => overrides[a.key])
    .filter((t): t is AutomationPermissionTier => t != null);

  if (tiers.length === 0) return undefined;
  return pickMostRestrictiveTier(tiers);
}

export function resolveEffectiveAutomationTier(input: {
  automation: AutomationPolicy;
  semanticKey?: string;
  semanticCapability?: string;
  enforcement?: string;
}): EffectiveAutomationResolution {
  const blob = `${input.semanticKey ?? ''} ${input.semanticCapability ?? ''}`.toLowerCase();
  const matchedActions = resolveMatchingAutomationActions({
    semanticKey: input.semanticKey,
    semanticCapability: input.semanticCapability,
  });

  const reasonCodes: string[] = [];

  if (matchedActions.length > 0) {
    reasonCodes.push('CATALOG_MATCH');
  }

  const overrideTier = tierFromUserOverride(matchedActions, input.automation.actionOverrides);
  if (overrideTier) {
    reasonCodes.push('USER_ACTION_OVERRIDE');
  }

  const catalogDefaultTier =
    matchedActions.length > 0
      ? pickMostRestrictiveTier(matchedActions.map((a) => a.defaultTier))
      : undefined;

  const legacyTier = tierFromLegacyLists(blob, input.automation);

  let tier: AutomationPermissionTier =
    overrideTier ?? catalogDefaultTier ?? legacyTier ?? 'ASK';

  if (legacyTier && !overrideTier && catalogDefaultTier == null) {
    reasonCodes.push('LEGACY_LIST_MATCH');
  } else if (catalogDefaultTier != null && !overrideTier) {
    reasonCodes.push('CATALOG_DEFAULT');
  }

  tier = applyFloorTier(tier, matchedActions);

  // Road closure with BLOCK enforcement stays ASK even if monitoring tier is AUTO
  if (
    input.enforcement === 'BLOCK' &&
    /road_segment|road\.status|ROAD_SEGMENT_UNAVAILABLE/.test(blob)
  ) {
    tier = pickMostRestrictiveTier([tier, 'ASK']);
    reasonCodes.push('BLOCK_ENFORCEMENT_REQUIRES_CONFIRM');
  }

  if (tier === 'DENY') {
    reasonCodes.push('ACTION_TIER_DENY');
  } else if (tier === 'ASK') {
    reasonCodes.push('ACTION_TIER_ASK');
  } else {
    reasonCodes.push('ACTION_TIER_AUTO');
  }

  return { tier, matchedActions, reasonCodes };
}
