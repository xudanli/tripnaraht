/**
 * P5 — Evaluate LEGACY_DEPRECATED readiness from artifacts + catalogs.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { DecisionRuntimeCapabilitiesInput } from '../execution/decision-runtime-capabilities.util';
import { snapshotConstraintOnRolloutCatalog } from '../p2-phase/constraint-on-rollout.catalog';
import { evaluateLegacyFallbackDrill } from '../p4-phase/legacy-fallback-drill.evaluator';
import { runDecisionRuntimeArchitectureLint } from '../architecture/decision-runtime-architecture-lint.util';
import {
  LEGACY_DEPRECATED_READINESS_GATES,
  snapshotLegacyDeprecatedReadinessCatalog,
} from './legacy-deprecated-readiness.catalog';

export const LEGACY_DEPRECATED_READINESS_EVAL_SCHEMA_ID =
  'tripnara.legacy_deprecated_readiness_evaluation@v1';

export interface LegacyDeprecatedGateResult {
  gateId: string;
  pass: boolean;
  detail: string;
}

export interface LegacyDeprecatedReadinessEvaluation {
  schemaId: typeof LEGACY_DEPRECATED_READINESS_EVAL_SCHEMA_ID;
  evaluatedAt: string;
  ready: boolean;
  gates: LegacyDeprecatedGateResult[];
  blockers: string[];
  catalog: ReturnType<typeof snapshotLegacyDeprecatedReadinessCatalog>;
}

function readArtifact<T>(relPath: string): T | null {
  try {
    const p = nodePath.join(process.cwd(), relPath);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function evaluateLegacyDeprecatedReadiness(
  caps: DecisionRuntimeCapabilitiesInput,
): LegacyDeprecatedReadinessEvaluation {
  const rollout = snapshotConstraintOnRolloutCatalog();
  const fallbackDrill = readArtifact<{ drill?: { drillPass?: boolean } }>(
    'artifacts/p4-legacy-fallback-drill/report.json',
  );
  const flipAdvisory = readArtifact<{
    readyForProductionFlip?: boolean;
    devDrill?: boolean;
  }>('artifacts/p4-production-flip/advisory.json');
  const canonicalClosure = readArtifact<{ overall?: string }>(
    'artifacts/p4-canonical-default-status/closure.json',
  );

  const allDeprecated = rollout.entries.every((e) => e.currentPhase === 'LEGACY_DEPRECATED');
  const allDefaultOn = rollout.entries.every(
    (e) => e.currentPhase === 'DEFAULT_ON' || e.currentPhase === 'LEGACY_DEPRECATED',
  );
  const productionFlipReady =
    flipAdvisory?.readyForProductionFlip === true && flipAdvisory?.devDrill !== true;

  const gateResults: LegacyDeprecatedGateResult[] = LEGACY_DEPRECATED_READINESS_GATES.map(
    (gate) => {
      switch (gate.gateId) {
        case 'canonical-default-production':
          return {
            gateId: gate.gateId,
            pass:
              caps.mode === 'CANONICAL' &&
              caps.constraintGatewayMode === 'ON' &&
              (productionFlipReady ||
                canonicalClosure?.overall === 'CANONICAL_DEFAULT_STAGING_READY'),
            detail: productionFlipReady
              ? 'production flip advisory ready'
              : `staging=${canonicalClosure?.overall ?? 'missing'} mode=${caps.mode}`,
          };
        case 'constraint-all-default-on':
          return {
            gateId: gate.gateId,
            pass: allDeprecated || allDefaultOn,
            detail: `${rollout.onForSelectedCount}/${rollout.entryCount} ON_FOR_SELECTED`,
          };
        case 'legacy-boolean-callers-zero': {
          const lint = readArtifact<{
            pass?: boolean;
            legacyBooleanCallerCount?: number;
          }>('artifacts/p5-architecture-lint/report.json');
          const offlineLint = lint ?? runDecisionRuntimeArchitectureLint();
          const count = offlineLint.legacyBooleanCallerCount ?? 0;
          return {
            gateId: gate.gateId,
            pass: count === 0,
            detail: `legacyBooleanCallerCount=${count}`,
          };
        }
        case 'optimization-sign-off':
          return {
            gateId: gate.gateId,
            pass: caps.optimizationStrategyMode !== 'CPSAT_LEX',
            detail: caps.optimizationStrategyMode,
          };
        case 'rollback-runbook-drill':
          return {
            gateId: gate.gateId,
            pass:
              fallbackDrill?.drill?.drillPass === true ||
              evaluateLegacyFallbackDrill(caps).drillPass,
            detail: String(fallbackDrill?.drill?.drillPass ?? 'offline'),
          };
        case 'architecture-lint-90d': {
          const lint =
            readArtifact<{
              pass?: boolean;
              executorBypassCount?: number;
            }>('artifacts/p5-architecture-lint/report.json') ??
            runDecisionRuntimeArchitectureLint();
          return {
            gateId: gate.gateId,
            pass:
              lint.pass === true &&
              lint.executorBypassCount === 0 &&
              (caps.effectivePlanWriteGuard === true || caps.mode === 'CANONICAL'),
            detail: `lintPass=${lint.pass} executorBypass=${lint.executorBypassCount}`,
          };
        }
        default:
          return { gateId: gate.gateId, pass: false, detail: 'unknown gate' };
      }
    },
  );

  const blockers = gateResults
    .filter((g) => {
      const def = LEGACY_DEPRECATED_READINESS_GATES.find((x) => x.gateId === g.gateId);
      return def?.required && !g.pass;
    })
    .map((g) => g.gateId);

  return {
    schemaId: LEGACY_DEPRECATED_READINESS_EVAL_SCHEMA_ID,
    evaluatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    gates: gateResults,
    blockers,
    catalog: snapshotLegacyDeprecatedReadinessCatalog(),
  };
}
