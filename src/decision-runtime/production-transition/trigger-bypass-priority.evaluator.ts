/**
 * Ranks Trigger Gateway bypass / lineage_only entries for wiring upgrades.
 */

import {
  listBypassCandidates,
  TRIGGER_BYPASS_PRIORITY_HINTS,
  type TriggerBypassRankedEntry,
} from './trigger-bypass-priority.catalog';
import { summarizeTriggerWiring } from '../trigger/decision-trigger-wiring.catalog';

export interface TriggerBypassProductionMetrics {
  schemaId?: string;
  generatedAt?: string;
  windowDays?: number;
  entries?: Array<{ entryId: string; requestCount30d?: number }>;
}

export interface TriggerBypassPriorityReport {
  schemaId: 'tripnara.trigger_bypass_priority_report@v1';
  generatedAt: string;
  wiringSummary: ReturnType<typeof summarizeTriggerWiring>;
  bypassCount: number;
  ranked: TriggerBypassRankedEntry[];
  topWireTargets: TriggerBypassRankedEntry[];
  metricsSource: 'none' | 'artifact' | 'inline';
  nextActions: string[];
}

function defaultHint(entryId: string) {
  return (
    TRIGGER_BYPASS_PRIORITY_HINTS.find((h) => h.entryId === entryId) ?? {
      entryId,
      estimatedTrafficTier: 'low' as const,
      formalDecisionImpact: 'indirect' as const,
      upgradePriority: 99,
      rationale: 'No static priority hint — add to trigger-bypass-priority.catalog.ts',
    }
  );
}

export function evaluateTriggerBypassPriority(
  metrics?: TriggerBypassProductionMetrics,
): TriggerBypassPriorityReport {
  const wiringSummary = summarizeTriggerWiring();
  const candidates = listBypassCandidates();
  const metricsMap = new Map(
    (metrics?.entries ?? []).map((e) => [e.entryId, e.requestCount30d ?? 0]),
  );
  const hasProductionMetrics = metricsMap.size > 0;

  const ranked: TriggerBypassRankedEntry[] = candidates
    .map((entry) => {
      const hint = defaultHint(entry.id);
      const requestCount30d = metricsMap.get(entry.id);
      return {
        entryId: entry.id,
        label: entry.label,
        mode: entry.mode,
        triggerKind: entry.triggerKind,
        source: entry.source,
        moduleHint: entry.moduleHint,
        estimatedTrafficTier: hint.estimatedTrafficTier,
        formalDecisionImpact: hint.formalDecisionImpact,
        upgradePriority: hint.upgradePriority,
        rationale: hint.rationale,
        ...(requestCount30d !== undefined ? { requestCount30d } : {}),
        rank: 0,
        rankSource:
          hasProductionMetrics && requestCount30d !== undefined
            ? ('production_metrics' as const)
            : ('static_estimate' as const),
      };
    })
    .sort((a, b) => {
      if (hasProductionMetrics) {
        const ac = a.requestCount30d ?? -1;
        const bc = b.requestCount30d ?? -1;
        if (ac !== bc) return bc - ac;
      }
      if (a.upgradePriority !== b.upgradePriority) {
        return a.upgradePriority - b.upgradePriority;
      }
      return a.entryId.localeCompare(b.entryId);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const topWireTargets = ranked
    .filter((e) => e.mode === 'lineage_only' && e.formalDecisionImpact !== 'advisory')
    .slice(0, 3);

  const nextActions: string[] = [];
  if (!hasProductionMetrics) {
    nextActions.push(
      'Export 30d request counts per entry → artifacts/trigger-bypass-priority/production-metrics.json',
    );
  }
  for (const target of topWireTargets) {
    nextActions.push(
      `Upgrade ${target.entryId} (${target.label}) from lineage_only → dispatch in ${target.moduleHint}`,
    );
  }
  if (ranked.some((e) => e.mode === 'not_wired')) {
    nextActions.push('Wire not_wired catalog entries before expanding Canonical flip traffic');
  }

  return {
    schemaId: 'tripnara.trigger_bypass_priority_report@v1',
    generatedAt: new Date().toISOString(),
    wiringSummary,
    bypassCount: ranked.length,
    ranked,
    topWireTargets,
    metricsSource: hasProductionMetrics ? 'artifact' : 'none',
    nextActions,
  };
}
