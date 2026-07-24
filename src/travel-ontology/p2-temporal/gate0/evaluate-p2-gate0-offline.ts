/**
 * ONT-P2-00 Gate 0 — offline validation evaluator (no production pilot)
 */

import { runWeatherOfflineAccuracyHarness } from '../accuracy/weather-accuracy-harness';
import type { AccuracyHarnessReport } from '../accuracy/weather-accuracy-harness';
import {
  INTERVENTION_DEADLINE_SCHEMA_ID,
  OUTCOME_RECONCILIATION_SCHEMA_ID,
  PREDICTION_RECORD_SCHEMA_ID,
  TEMPORAL_IMPACT_SCHEMA_ID,
} from '../contracts';

export const P2_GATE0_SCHEMA_ID = 'tripnara.ontology_p2_gate0_offline@v1' as const;

export type Gate0Check = {
  id: string;
  ok: boolean;
  detail: string;
};

export interface P2Gate0Report {
  schemaId: typeof P2_GATE0_SCHEMA_ID;
  generatedAt: string;
  phase: 'CHARTER_CONTRACTS_OFFLINE_ONLY';
  verdict: 'PASS' | 'FAIL';
  checks: Gate0Check[];
  accuracy: AccuracyHarnessReport;
  nextAllowed: 'APPLY_FOR_PRODUCTION_SHADOW_PILOT';
  nextForbidden: Array<
    | 'PRODUCTION_SHADOW_PILOT_WITHOUT_APPROVAL'
    | 'MUTATE_P0_P1_CANONICAL_ASSESSMENT'
    | 'CONTROL_READY_CONFIRM_EXECUTE'
    | 'ADD_FOURTH_CONTINUOUS_SEMANTIC'
  >;
}

export function evaluateP2Gate0Offline(input?: {
  nowMs?: number;
}): P2Gate0Report {
  const accuracy = runWeatherOfflineAccuracyHarness({ nowMs: input?.nowMs });
  const checks: Gate0Check[] = [];

  checks.push({
    id: 'CONTRACT_SCHEMA_IDS',
    ok:
      TEMPORAL_IMPACT_SCHEMA_ID === 'tripnara.temporal_impact@v1' &&
      INTERVENTION_DEADLINE_SCHEMA_ID === 'tripnara.intervention_deadline@v1' &&
      PREDICTION_RECORD_SCHEMA_ID === 'tripnara.prediction_record@v1' &&
      OUTCOME_RECONCILIATION_SCHEMA_ID === 'tripnara.outcome_reconciliation@v1',
    detail: 'Four P2 contracts export stable schemaIds',
  });

  checks.push({
    id: 'HARNESS_RUNS',
    ok: accuracy.summary.caseCount >= 4 && accuracy.summary.predictionsIssued >= 3,
    detail: `cases=${accuracy.summary.caseCount} predictions=${accuracy.summary.predictionsIssued}`,
  });

  checks.push({
    id: 'METRICS_PRESENT',
    ok:
      accuracy.summary.falsePositiveCount >= 1 &&
      accuracy.summary.falseNegativeCount >= 1 &&
      accuracy.summary.meanAbsOnsetErrorMinutes != null,
    detail: `fp=${accuracy.summary.falsePositiveCount} fn=${accuracy.summary.falseNegativeCount} meanAbsOnsetErr=${accuracy.summary.meanAbsOnsetErrorMinutes}`,
  });

  checks.push({
    id: 'SHADOW_AUTHORITY',
    ok:
      accuracy.authorityMode === 'SHADOW' &&
      accuracy.cases.every(
        (c) => c.prediction == null || c.prediction.authorityMode === 'SHADOW',
      ),
    detail: 'All predictions authorityMode=SHADOW',
  });

  checks.push({
    id: 'NO_CANONICAL_CONTROL',
    ok:
      accuracy.gate0Assertions.mutatesCanonicalAssessment === false &&
      accuracy.gate0Assertions.mayCanonicalApply === false &&
      accuracy.gate0Assertions.controlsReady === false &&
      accuracy.gate0Assertions.controlsConfirm === false &&
      accuracy.gate0Assertions.controlsExecute === false,
    detail: 'Prediction seals block Assessment/Apply/READY/Confirm/Execute',
  });

  checks.push({
    id: 'NO_FOURTH_SEMANTIC',
    ok:
      accuracy.semanticScope === 'WEATHER_DETERIORATION' &&
      accuracy.gate0Assertions.fourthSemanticAdded === false &&
      accuracy.cases.every(
        (c) =>
          c.prediction == null ||
          c.prediction.semanticScope === 'WEATHER_DETERIORATION',
      ),
    detail: 'Reuse WEATHER_DETERIORATION only',
  });

  checks.push({
    id: 'REPLAY_STABLE',
    ok: (() => {
      const b = runWeatherOfflineAccuracyHarness({ nowMs: input?.nowMs });
      return b.replayFingerprint === accuracy.replayFingerprint;
    })(),
    detail: `fingerprint=${accuracy.replayFingerprint}`,
  });

  checks.push({
    id: 'SEAL_VIOLATIONS_ABSENT',
    ok: accuracy.cases.every((c) => c.notes.length === 0),
    detail: 'No per-case seal violation notes',
  });

  const verdict = checks.every((c) => c.ok) ? 'PASS' : 'FAIL';

  return {
    schemaId: P2_GATE0_SCHEMA_ID,
    generatedAt: new Date(input?.nowMs ?? Date.now()).toISOString(),
    phase: 'CHARTER_CONTRACTS_OFFLINE_ONLY',
    verdict,
    checks,
    accuracy,
    nextAllowed: 'APPLY_FOR_PRODUCTION_SHADOW_PILOT',
    nextForbidden: [
      'PRODUCTION_SHADOW_PILOT_WITHOUT_APPROVAL',
      'MUTATE_P0_P1_CANONICAL_ASSESSMENT',
      'CONTROL_READY_CONFIRM_EXECUTE',
      'ADD_FOURTH_CONTINUOUS_SEMANTIC',
    ],
  };
}
