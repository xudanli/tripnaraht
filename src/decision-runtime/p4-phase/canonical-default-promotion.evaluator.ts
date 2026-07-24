/**
 * P4 — Evaluate CANONICAL_DEFAULT promotion readiness.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { DecisionRuntimeCapabilitiesInput } from '../execution/decision-runtime-capabilities.util';
import { evaluateCanaryAdmissionGates } from '../p2-phase/canary-admission-gate.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../p2-phase/constraint-on-rollout.catalog';
import {
  CANONICAL_DEFAULT_PROMOTION_GATES,
  snapshotCanonicalDefaultPromotionCatalog,
} from './canonical-default-promotion.catalog';

export const CANONICAL_DEFAULT_PROMOTION_EVAL_SCHEMA_ID =
  'tripnara.canonical_default_promotion_evaluation@v1';

export interface PromotionGateResult {
  gateId: string;
  pass: boolean;
  detail: string;
}

export interface CanonicalDefaultPromotionEvaluation {
  schemaId: typeof CANONICAL_DEFAULT_PROMOTION_EVAL_SCHEMA_ID;
  evaluatedAt: string;
  ready: boolean;
  gates: PromotionGateResult[];
  blockers: string[];
  catalog: ReturnType<typeof snapshotCanonicalDefaultPromotionCatalog>;
}

function readP4Closure(): { overall?: string; generatedAt?: string } | null {
  try {
    const p = nodePath.join(process.cwd(), 'artifacts/p4-phase-status/closure.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) as { overall?: string; generatedAt?: string };
  } catch {
    return null;
  }
}

function observationDaysMet(): { pass: boolean; detail: string } {
  const minDays = Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS ?? '30');
  const closure = readP4Closure();
  if (closure?.overall !== 'CANONICAL_SELECTIVE_READY' || !closure.generatedAt) {
    return { pass: false, detail: 'selective closure not recorded' };
  }
  const elapsedMs = Date.now() - Date.parse(closure.generatedAt);
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  const pass = elapsedDays >= minDays;
  return {
    pass,
    detail: `${elapsedDays.toFixed(1)}/${minDays} days since selective closure`,
  };
}

export function evaluateCanonicalDefaultPromotion(
  caps: DecisionRuntimeCapabilitiesInput,
): CanonicalDefaultPromotionEvaluation {
  const canary = evaluateCanaryAdmissionGates();
  const rollout = snapshotConstraintOnRolloutCatalog();
  const p4Closure = readP4Closure();
  const obs = observationDaysMet();

  const gateResults: PromotionGateResult[] = CANONICAL_DEFAULT_PROMOTION_GATES.map(
    (gate) => {
      switch (gate.gateId) {
        case 'selective-closure':
          return {
            gateId: gate.gateId,
            pass: p4Closure?.overall === 'CANONICAL_SELECTIVE_READY',
            detail: p4Closure?.overall ?? 'missing',
          };
        case 'constraint-majority-on':
          return {
            gateId: gate.gateId,
            pass: rollout.onForSelectedCount >= 7,
            detail: `${rollout.onForSelectedCount}/7 ON_FOR_SELECTED`,
          };
        case 'runtime-canonical-mode':
          return {
            gateId: gate.gateId,
            pass: caps.mode === 'CANONICAL',
            detail: caps.mode,
          };
        case 'constraint-default-on':
          return {
            gateId: gate.gateId,
            pass: caps.constraintGatewayMode === 'ON',
            detail: caps.constraintGatewayMode,
          };
        case 'canonical-full-plan':
          return {
            gateId: gate.gateId,
            pass: caps.fullPlanSelection,
            detail: String(caps.fullPlanSelection),
          };
        case 'canonical-execute':
          return {
            gateId: gate.gateId,
            pass: caps.canonicalExecute,
            detail: String(caps.canonicalExecute),
          };
        case 'authorization-gateway':
          return {
            gateId: gate.gateId,
            pass: caps.authorizationPolicyGateway,
            detail: String(caps.authorizationPolicyGateway),
          };
        case 'canary-gates':
          return {
            gateId: gate.gateId,
            pass: canary.canaryReady,
            detail: String(canary.canaryReady),
          };
        case 'legacy-optimization-unchanged':
          return {
            gateId: gate.gateId,
            pass: caps.optimizationStrategyMode === 'AUTO' || caps.optimizationStrategyMode === 'LEGACY',
            detail: caps.optimizationStrategyMode,
          };
        case 'observation-window':
          return { gateId: gate.gateId, pass: obs.pass, detail: obs.detail };
        default:
          return { gateId: gate.gateId, pass: false, detail: 'unknown gate' };
      }
    },
  );

  const blockers = gateResults
    .filter((g) => {
      const def = CANONICAL_DEFAULT_PROMOTION_GATES.find((x) => x.gateId === g.gateId);
      return def?.required && !g.pass;
    })
    .map((g) => g.gateId);

  return {
    schemaId: CANONICAL_DEFAULT_PROMOTION_EVAL_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    gates: gateResults,
    blockers,
    catalog: snapshotCanonicalDefaultPromotionCatalog(),
  };
}

/** Simulate caps after switching to CANONICAL_DEFAULT recommended env (dry-run only). */
export function buildCanonicalDefaultPreviewCapabilities(
  base: DecisionRuntimeCapabilitiesInput,
): DecisionRuntimeCapabilitiesInput {
  return {
    ...base,
    mode: 'CANONICAL',
    constraintGateway: true,
    constraintGatewayMode: 'ON',
    constraintGatewayShadowCompare: false,
    constraintGatewayOnForSelected: false,
    fullPlanSelection: true,
    guideCanonicalSelection: true,
    guideCanonicalAcceptExecute: true,
    canonicalExecute: true,
    authorizationPolicyGateway: true,
    decisionTriggerGateway: true,
    replanningTriggerPolicy: true,
  };
}

/** Staging closure — all gates with optional observation bypass (default 30d). */
export function isCanonicalDefaultStagingReady(
  caps: DecisionRuntimeCapabilitiesInput,
  options?: { observationBypass?: boolean },
): boolean {
  const saved = process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
  const bypass = options?.observationBypass ?? saved === '0';
  if (bypass) {
    process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = '0';
  }
  const ready = evaluateCanonicalDefaultPromotion(caps).ready;
  if (bypass) {
    if (saved === undefined) delete process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
    else process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = saved;
  }
  return ready;
}
