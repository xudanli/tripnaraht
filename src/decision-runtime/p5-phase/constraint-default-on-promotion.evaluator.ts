/**
 * P5 — Evaluate per-scenario DEFAULT_ON promotion readiness.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { DecisionRuntimeCapabilitiesInput } from '../execution/decision-runtime-capabilities.util';
import { snapshotConstraintOnRolloutCatalog } from '../p2-phase/constraint-on-rollout.catalog';
import { runDecisionRuntimeArchitectureLint } from '../architecture/decision-runtime-architecture-lint.util';
import {
  CONSTRAINT_DEFAULT_ON_PROMOTION_GATES,
  snapshotConstraintDefaultOnPromotionCatalog,
} from './constraint-default-on-promotion.catalog';

export const CONSTRAINT_DEFAULT_ON_PROMOTION_EVAL_SCHEMA_ID =
  'tripnara.constraint_default_on_promotion_evaluation@v1';

function readArtifact<T>(relPath: string): T | null {
  try {
    const p = nodePath.join(process.cwd(), relPath);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function evaluateConstraintDefaultOnPromotion(
  caps: DecisionRuntimeCapabilitiesInput,
): {
  schemaId: typeof CONSTRAINT_DEFAULT_ON_PROMOTION_EVAL_SCHEMA_ID;
  evaluatedAt: string;
  ready: boolean;
  gates: Array<{ gateId: string; pass: boolean; detail: string }>;
  blockers: string[];
  scenarios: Array<{
    scenarioId: string;
    currentPhase: string;
    readyForDefaultOn: boolean;
    blockers: string[];
  }>;
  catalog: ReturnType<typeof snapshotConstraintDefaultOnPromotionCatalog>;
} {
  const rollout = snapshotConstraintOnRolloutCatalog();
  const canonicalClosure = readArtifact<{ overall?: string }>(
    'artifacts/p4-canonical-default-status/closure.json',
  );
  const shadowReport = readArtifact<{ probes?: Array<{ pass?: boolean }> }>(
    'artifacts/constraint-shadow-staging/report.json',
  );
  const archLint =
    readArtifact<{ pass?: boolean }>('artifacts/p5-architecture-lint/report.json') ??
    runDecisionRuntimeArchitectureLint();

  const shadowPass =
    shadowReport?.probes?.length &&
    shadowReport.probes.every((p) => p.pass !== false);
  const allOnForSelected =
    rollout.onForSelectedCount === rollout.entryCount && rollout.entryCount > 0;

  const gateResults = CONSTRAINT_DEFAULT_ON_PROMOTION_GATES.map((gate) => {
    switch (gate.gateId) {
      case 'canonical-default-staging':
        return {
          gateId: gate.gateId,
          pass: canonicalClosure?.overall === 'CANONICAL_DEFAULT_STAGING_READY',
          detail: canonicalClosure?.overall ?? 'missing',
        };
      case 'constraint-gateway-on':
        return {
          gateId: gate.gateId,
          pass: caps.constraintGatewayMode === 'ON',
          detail: caps.constraintGatewayMode,
        };
      case 'all-on-for-selected':
        return {
          gateId: gate.gateId,
          pass: allOnForSelected,
          detail: `${rollout.onForSelectedCount}/${rollout.entryCount}`,
        };
      case 'shadow-staging-clean':
        return {
          gateId: gate.gateId,
          pass: shadowPass === true,
          detail: shadowPass ? 'all probes pass' : 'run constraint-shadow:staging',
        };
      case 'architecture-lint':
        return {
          gateId: gate.gateId,
          pass: archLint.pass === true,
          detail: String(archLint.pass),
        };
      default:
        return { gateId: gate.gateId, pass: false, detail: 'unknown' };
    }
  });

  const globalBlockers = gateResults
    .filter((g) => {
      const def = CONSTRAINT_DEFAULT_ON_PROMOTION_GATES.find((x) => x.gateId === g.gateId);
      return def?.required && !g.pass;
    })
    .map((g) => g.gateId);

  const globalReady = globalBlockers.length === 0;

  const scenarios = rollout.entries.map((entry) => {
    const blockers: string[] = [];
    if (entry.currentPhase !== 'ON_FOR_SELECTED') {
      blockers.push(`phase=${entry.currentPhase}`);
    }
    if (!globalReady) {
      blockers.push(...globalBlockers.map((b) => `global:${b}`));
    }
    return {
      scenarioId: entry.scenarioId,
      currentPhase: entry.currentPhase,
      readyForDefaultOn: blockers.length === 0,
      blockers,
    };
  });

  return {
    schemaId: CONSTRAINT_DEFAULT_ON_PROMOTION_EVAL_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    ready: globalReady && scenarios.every((s) => s.readyForDefaultOn),
    gates: gateResults,
    blockers: globalBlockers,
    scenarios,
    catalog: snapshotConstraintDefaultOnPromotionCatalog(),
  };
}
