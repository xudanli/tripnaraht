/**
 * P4 — Per-scenario constraint rollout promotion readiness.
 */

import { snapshotConstraintOnRolloutCatalog } from '../p2-phase/constraint-on-rollout.catalog';
import type { ConstraintOnRolloutEntry } from '../p2-phase/constraint-on-rollout.catalog';

export const CONSTRAINT_ROLLOUT_PROMOTION_SCHEMA_ID =
  'tripnara.constraint_rollout_promotion@v1';

/** Scenarios promoted by engineering evidence without HTTP shadow artifact */
const ENGINEERING_PROMOTED: Record<string, string> = {
  'iceland-road-closed': 'P2 ON_FOR_SELECTED staging probes PASS',
  'weather-outdoor-storm': 'P2 ON_FOR_SELECTED staging probes PASS',
  'daily-load-excessive': 'P2 ON_FOR_SELECTED staging probes PASS',
  'in-trip-replan': 'P3 in-trip policy gate + bounded LNS wired',
  'full-plan-selection': 'P1 FULL_PLAN_SELECTION trigger wired via Gateway',
  'guide-plan-selection': 'P1 guide-canonical-selection + accept via Gateway',
  'opening-hours-conflict': 'P4 constraint-shadow staging probe PASS',
};

export interface ConstraintScenarioPromotion {
  scenarioId: string;
  currentPhase: ConstraintOnRolloutEntry['currentPhase'];
  readyForOn: boolean;
  blockers: string[];
  evidence?: string;
}

export function evaluateConstraintRolloutPromotion(): {
  schemaId: typeof CONSTRAINT_ROLLOUT_PROMOTION_SCHEMA_ID;
  evaluatedAt: string;
  onForSelectedCount: number;
  shadowCompareCount: number;
  scenarios: ConstraintScenarioPromotion[];
} {
  const catalog = snapshotConstraintOnRolloutCatalog();

  const scenarios = catalog.entries.map((entry) => {
    const blockers: string[] = [];
    const engineering = ENGINEERING_PROMOTED[entry.scenarioId];

    if (entry.currentPhase === 'ON_FOR_SELECTED') {
      return {
        scenarioId: entry.scenarioId,
        currentPhase: entry.currentPhase,
        readyForOn: true,
        blockers: [],
        evidence: engineering ?? entry.notes,
      };
    }

    if (!engineering) {
      blockers.push('awaiting constraint-shadow staging probes');
    }
    if (entry.currentPhase === 'SHADOW_COMPARE' && engineering) {
      return {
        scenarioId: entry.scenarioId,
        currentPhase: entry.currentPhase,
        readyForOn: true,
        blockers: [],
        evidence: engineering,
      };
    }

    return {
      scenarioId: entry.scenarioId,
      currentPhase: entry.currentPhase,
      readyForOn: blockers.length === 0,
      blockers,
      evidence: entry.notes,
    };
  });

  return {
    schemaId: CONSTRAINT_ROLLOUT_PROMOTION_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    onForSelectedCount: catalog.onForSelectedCount,
    shadowCompareCount: catalog.shadowCompareCount,
    scenarios,
  };
}
