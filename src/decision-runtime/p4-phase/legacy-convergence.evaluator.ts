/**
 * P4 — Infer current convergence stage from env + rollout catalogs.
 */

import type { DecisionRuntimeCapabilitiesInput } from '../execution/decision-runtime-capabilities.util';
import { snapshotConstraintOnRolloutCatalog } from '../p2-phase/constraint-on-rollout.catalog';
import { evaluateCanaryAdmissionGates } from '../p2-phase/canary-admission-gate.evaluator';
import {
  type LegacyConvergenceStage,
  LEGACY_CONVERGENCE_LADDER,
  stageOrder,
  snapshotLegacyConvergenceLadder,
} from './legacy-convergence-ladder.catalog';

export const LEGACY_CONVERGENCE_EVAL_SCHEMA_ID =
  'tripnara.legacy_convergence_evaluation@v1';

export interface LegacyConvergenceEvaluation {
  schemaId: typeof LEGACY_CONVERGENCE_EVAL_SCHEMA_ID;
  evaluatedAt: string;
  currentStage: LegacyConvergenceStage;
  targetStage: LegacyConvergenceStage;
  canPromote: boolean;
  blockers: string[];
  ladder: ReturnType<typeof snapshotLegacyConvergenceLadder>;
  signals: {
    effectiveRuntimeMode: string;
    constraintGatewayMode: string;
    onForSelectedScenarios: number;
    canonicalFullPlanSelection: boolean;
    canonicalExecute: boolean;
    canaryReady: boolean;
    optimizationStrategyMode: string;
  };
}

export function resolveLegacyConvergenceTargetStage(): LegacyConvergenceStage {
  const raw = process.env.LEGACY_CONVERGENCE_TARGET?.trim().toUpperCase();
  const allowed: LegacyConvergenceStage[] = [
    'LEGACY_DEFAULT',
    'CANONICAL_SELECTIVE',
    'CANONICAL_DEFAULT',
    'LEGACY_FALLBACK',
    'LEGACY_DEPRECATED',
  ];
  if (raw && allowed.includes(raw as LegacyConvergenceStage)) {
    return raw as LegacyConvergenceStage;
  }
  return 'CANONICAL_SELECTIVE';
}

export function inferLegacyConvergenceStage(
  caps: DecisionRuntimeCapabilitiesInput,
): LegacyConvergenceStage {
  const rollout = snapshotConstraintOnRolloutCatalog();
  const allDeprecated =
    rollout.entryCount > 0 &&
    rollout.entries.every((e) => e.currentPhase === 'LEGACY_DEPRECATED');

  if (allDeprecated) {
    return 'LEGACY_DEPRECATED';
  }

  if (caps.mode === 'CANONICAL' && caps.canonicalExecute) {
    if (caps.optimizationStrategyMode === 'LEGACY') {
      return 'LEGACY_FALLBACK';
    }
    return 'CANONICAL_DEFAULT';
  }

  const selectiveActive =
    caps.constraintGatewayOnForSelected ||
    (caps.replanningTriggerPolicy && caps.decisionTriggerGateway);

  if (selectiveActive && caps.mode !== 'CANONICAL') {
    return 'CANONICAL_SELECTIVE';
  }

  return 'LEGACY_DEFAULT';
}

export function evaluateLegacyConvergence(
  caps: DecisionRuntimeCapabilitiesInput,
): LegacyConvergenceEvaluation {
  const targetStage = resolveLegacyConvergenceTargetStage();
  const currentStage = inferLegacyConvergenceStage(caps);
  const canary = evaluateCanaryAdmissionGates();
  const rollout = snapshotConstraintOnRolloutCatalog();
  const blockers: string[] = [];

  if (!canary.canaryReady) {
    blockers.push('canary admission gates not ready');
  }

  if (stageOrder(currentStage) < stageOrder(targetStage)) {
    if (targetStage === 'CANONICAL_SELECTIVE') {
      if (!caps.constraintGatewayOnForSelected) {
        blockers.push('CONSTRAINT_GATEWAY_MODE must be ON_FOR_SELECTED');
      }
      if (rollout.onForSelectedCount < 3) {
        blockers.push(
          `constraint catalog ON_FOR_SELECTED scenarios=${rollout.onForSelectedCount} (need ≥3)`,
        );
      }
      if (!caps.decisionTriggerGateway) {
        blockers.push('DECISION_TRIGGER_GATEWAY_ENABLED=0');
      }
      if (!caps.replanningTriggerPolicy) {
        blockers.push('REPLANNING_TRIGGER_POLICY_ENABLED=0');
      }
    }
    if (targetStage === 'CANONICAL_DEFAULT') {
      if (currentStage !== 'CANONICAL_SELECTIVE') {
        blockers.push('must complete CANONICAL_SELECTIVE first');
      }
      if (!caps.fullPlanSelection) {
        blockers.push('CANONICAL_FULL_PLAN_SELECTION not enabled');
      }
      if (caps.mode !== 'CANONICAL') {
        blockers.push('DECISION_RUNTIME_MODE must be CANONICAL');
      }
      if (caps.constraintGatewayMode !== 'ON') {
        blockers.push('CONSTRAINT_GATEWAY_MODE must be ON');
      }
    }
  }

  const canPromote =
    stageOrder(currentStage) >= stageOrder(targetStage) && blockers.length === 0;

  return {
    schemaId: LEGACY_CONVERGENCE_EVAL_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    currentStage,
    targetStage,
    canPromote,
    blockers,
    ladder: snapshotLegacyConvergenceLadder(),
    signals: {
      effectiveRuntimeMode: caps.mode,
      constraintGatewayMode: caps.constraintGatewayMode,
      onForSelectedScenarios: rollout.onForSelectedCount,
      canonicalFullPlanSelection: caps.fullPlanSelection,
      canonicalExecute: caps.canonicalExecute,
      canaryReady: canary.canaryReady,
      optimizationStrategyMode: caps.optimizationStrategyMode,
    },
  };
}

/** P4 selective staging posture satisfied */
export function isCanonicalSelectiveStagingReady(
  caps: DecisionRuntimeCapabilitiesInput,
): boolean {
  const eval_ = evaluateLegacyConvergence(caps);
  return (
    eval_.currentStage === 'CANONICAL_SELECTIVE' ||
    (eval_.targetStage === 'CANONICAL_SELECTIVE' && eval_.canPromote)
  );
}
