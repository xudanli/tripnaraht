/**
 * Project automation catalog + user policy into consumer-facing authorization summary.
 */

import {
  AUTOMATION_ACTION_CATALOG,
  AUTOMATION_ACTION_GROUP_LABELS,
  AUTOMATION_PERMISSION_TIER_LABELS,
  type AutomationActionGroup,
  type AutomationPermissionTier,
} from '../../../decision-runtime/authorization/automation-action.catalog';
import type { AutomationPolicy } from '../../trip-constraint-solver/types/travel-decision-contract.types';

export interface AutomationActionSummaryItem {
  key: string;
  label: string;
  effectiveTier: AutomationPermissionTier;
  effectiveTierLabel: string;
  defaultTier: AutomationPermissionTier;
  coldStart: boolean;
  userOverride?: AutomationPermissionTier;
}

export interface AutomationGroupSummary {
  group: AutomationActionGroup;
  label: string;
  actions: AutomationActionSummaryItem[];
  autoCount: number;
  askCount: number;
  denyCount: number;
}

export interface AutomationCatalogSummary {
  schemaId: 'tripnara.automation_authorization_summary@v1';
  groups: AutomationGroupSummary[];
  coldStartActionKeys: string[];
}

export interface AutomationTierCounts {
  auto: number;
  ask: number;
  deny: number;
}

export function aggregateAutomationTierCounts(
  catalog: AutomationCatalogSummary,
): AutomationTierCounts {
  return catalog.groups.reduce(
    (acc, group) => ({
      auto: acc.auto + group.autoCount,
      ask: acc.ask + group.askCount,
      deny: acc.deny + group.denyCount,
    }),
    { auto: 0, ask: 0, deny: 0 },
  );
}

function resolveEffectiveTierForAction(
  actionKey: string,
  defaultTier: AutomationPermissionTier,
  floorTier: 'ASK' | 'DENY' | undefined,
  overrides?: Partial<Record<string, AutomationPermissionTier>>,
): AutomationPermissionTier {
  let tier = overrides?.[actionKey] ?? defaultTier;
  if (floorTier === 'DENY' && tier === 'AUTO') return 'DENY';
  if (floorTier === 'ASK' && tier === 'AUTO') return 'ASK';
  return tier;
}

export function projectAutomationCatalogSummary(
  automation: AutomationPolicy,
): AutomationCatalogSummary {
  const groups = new Map<AutomationActionGroup, AutomationGroupSummary>();

  for (const action of AUTOMATION_ACTION_CATALOG) {
    const effectiveTier = resolveEffectiveTierForAction(
      action.key,
      action.defaultTier,
      action.floorTier,
      automation.actionOverrides,
    );

    const item: AutomationActionSummaryItem = {
      key: action.key,
      label: action.label,
      effectiveTier,
      effectiveTierLabel: AUTOMATION_PERMISSION_TIER_LABELS[effectiveTier],
      defaultTier: action.defaultTier,
      coldStart: action.coldStart ?? false,
      userOverride: automation.actionOverrides?.[action.key],
    };

    const existing = groups.get(action.group);
    if (existing) {
      existing.actions.push(item);
      if (effectiveTier === 'AUTO') existing.autoCount += 1;
      else if (effectiveTier === 'ASK') existing.askCount += 1;
      else existing.denyCount += 1;
    } else {
      groups.set(action.group, {
        group: action.group,
        label: AUTOMATION_ACTION_GROUP_LABELS[action.group],
        actions: [item],
        autoCount: effectiveTier === 'AUTO' ? 1 : 0,
        askCount: effectiveTier === 'ASK' ? 1 : 0,
        denyCount: effectiveTier === 'DENY' ? 1 : 0,
      });
    }
  }

  const orderedGroups = (
    Object.keys(AUTOMATION_ACTION_GROUP_LABELS) as AutomationActionGroup[]
  ).map(
    (group) =>
      groups.get(group) ?? {
        group,
        label: AUTOMATION_ACTION_GROUP_LABELS[group],
        actions: [],
        autoCount: 0,
        askCount: 0,
        denyCount: 0,
      },
  );

  return {
    schemaId: 'tripnara.automation_authorization_summary@v1',
    groups: orderedGroups,
    coldStartActionKeys: AUTOMATION_ACTION_CATALOG.filter((a) => a.coldStart).map((a) => a.key),
  };
}
