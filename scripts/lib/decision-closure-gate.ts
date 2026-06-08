/**
 * CLI helper: validate decision-closure golden cases (used by cgus replay / CI scripts).
 */
import type { E2ECase } from '../../src/trips/decision/evaluation/e2e-case.types';
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from '../../src/trips/decision/evaluation/decision-closure-assertions';
import { buildUnifiedExplainabilityEnvelope } from '../../src/trips/decision/explainability/build-unified-explainability-envelope.util';
import { buildDeterministicNarrativeFromEnvelope } from '../../src/trips/decision/explainability/project-explain-for-human-from-envelope.util';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from '../../src/trips/decision/explainability/unified-explainability.types';

export function runDecisionClosureGate(cases: readonly E2ECase[]): {
  passed: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; diff: string[] }>;
} {
  const results: Array<{ id: string; ok: boolean; diff: string[] }> = [];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const expected = c.expected.scientificExpected?.decisionClosure;
    if (!expected) {
      results.push({ id: c.id, ok: true, diff: [] });
      passed++;
      continue;
    }
    const hints = loadDecisionClosureGolden(c.metadata ?? {});
    if (!hints) {
      results.push({ id: c.id, ok: false, diff: ['missing metadata.decisionClosureGolden'] });
      failed++;
      continue;
    }
    const hintResult = assertDecisionClosureHints(hints, expected);
    const explain = projectDecisionClosureExplain(hints);
    const explainDiff: string[] = [];
    if (!explain?.decision_verdict?.chosen_plan_id) {
      explainDiff.push('explain projection missing decision_verdict.chosen_plan_id');
    }
    if (
      expected.worldMaterialization?.minAppliedEvents !== undefined &&
      explain?.world_constraint_materialization?.applied_events === undefined
    ) {
      explainDiff.push('explain projection missing world_constraint_materialization.applied_events');
    }

    const envelopeDiff: string[] = [];
    if (hints && expected.mustHaveDecisionVerdict) {
      const sampleLogs = c.metadata?.decisionClosureDecisionLogs ?? [];
      const baseEnvelope = buildUnifiedExplainabilityEnvelope({
        requestId: `closure-gate-${c.id}`,
        optimizationHints: hints,
        decisionLogs: sampleLogs,
        physicalEvidenceGate: sampleLogs.length > 0 ? 'error_critical_stages' : 'warn',
      });
      const envelope =
        sampleLogs.length > 0
          ? buildUnifiedExplainabilityEnvelope({
              requestId: `closure-gate-${c.id}`,
              optimizationHints: hints,
              decisionLogs: sampleLogs,
              narrative: buildDeterministicNarrativeFromEnvelope(baseEnvelope),
              physicalEvidenceGate: 'error_critical_stages',
              generatedAt: baseEnvelope.generated_at,
            })
          : baseEnvelope;
      if (envelope.contract_version !== UNIFIED_EXPLAINABILITY_CONTRACT_VERSION) {
        envelopeDiff.push(`unified envelope contract_version mismatch: ${envelope.contract_version}`);
      }
      if (!envelope.optimization_projection?.decision_verdict?.chosen_plan_id) {
        envelopeDiff.push('unified envelope missing optimization_projection.decision_verdict');
      }
      if (!envelope.integrity.traceability_valid) {
        envelopeDiff.push('unified envelope traceability_valid=false');
      }
      if (sampleLogs.length > 0 && !envelope.integrity.physical_evidence_complete) {
        envelopeDiff.push('unified envelope physical_evidence_complete=false (error_critical_stages)');
      }
      if (sampleLogs.length > 0 && !envelope.narrative) {
        envelopeDiff.push('unified envelope missing narrative when decisionClosureDecisionLogs present');
      }
    }

    const diff = [...hintResult.diff, ...explainDiff, ...envelopeDiff];
    const ok = hintResult.passed && explainDiff.length === 0 && envelopeDiff.length === 0;
    results.push({ id: c.id, ok, diff });
    if (ok) passed++;
    else failed++;
  }

  return { passed, failed, results };
}
