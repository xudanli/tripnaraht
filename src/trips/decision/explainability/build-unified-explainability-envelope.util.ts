/**
 * 构建 unified-explainability@v1 信封：决策 trace + grounded factors + 完整性自检。
 */

import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import { projectDecisionClosureExplain } from '../evaluation/decision-closure-assertions';
import { analyzeDecisionLogTraceability } from '../contracts/decision-log-traceability.contract';
import {
  getPhysicalEvidenceGateMode,
  hasPhysicalEvidenceRefs,
  requiresPhysicalEvidenceRefs,
  type PhysicalEvidenceGateMode,
} from '../contracts/physical-evidence-gate.util';
import { extractCausalChain } from '../narration/extract-causal-chain.util';
import type { CausalNodeKind } from '../narration/causal-chain.types';
import type {
  BuildUnifiedExplainabilityEnvelopeInput,
  DecisionLogEntryLike,
  GroundedFactorKind,
  GroundedFactorSeverity,
  UnifiedExplainabilityEnvelopeV1,
  UnifiedGroundedFactorV1,
  UnifiedNarrativeV1,
} from './unified-explainability.types';
import { UNIFIED_EXPLAINABILITY_CONTRACT_VERSION } from './unified-explainability.types';

const CAUSAL_KIND_TO_FACTOR: Record<CausalNodeKind, GroundedFactorKind> = {
  WEATHER_PERTURBATION: 'PHYSICAL',
  ROAD_CLOSURE: 'PHYSICAL',
  TIME_DRIFT: 'PHYSICAL',
  DEM_HARD_GATE: 'PHYSICAL',
  PERSONA_REPAIR: 'PHILOSOPHY',
  MONTE_CARLO_OUTCOME: 'UTILITY',
  SCHEDULE_ADJUSTMENT: 'HUMAN',
  SYSTEM_DEGRADATION: 'HEURISTIC',
};

const CAUSAL_KIND_SEVERITY: Record<CausalNodeKind, GroundedFactorSeverity> = {
  WEATHER_PERTURBATION: 'WARN',
  ROAD_CLOSURE: 'BLOCK',
  TIME_DRIFT: 'WARN',
  DEM_HARD_GATE: 'BLOCK',
  PERSONA_REPAIR: 'INFO',
  MONTE_CARLO_OUTCOME: 'INFO',
  SCHEDULE_ADJUSTMENT: 'INFO',
  SYSTEM_DEGRADATION: 'WARN',
};

function mapLogsToDecisionTrace(logs: DecisionLogEntryLike[]): UnifiedExplainabilityEnvelopeV1['decision_trace'] {
  return logs.map((log, log_index) => ({
    log_index,
    persona: log.persona,
    action: log.action,
    decision_source: log.decisionSource,
    decision_stage: log.decisionStage,
    reason_codes: log.reasonCodes ?? [],
    evidence_refs: log.evidenceRefs ?? [],
    explanation: log.explanation,
  }));
}

function buildGroundedFactorsFromCausal(
  logs: DecisionLogEntryLike[],
  hints?: OptimizationHints,
): UnifiedGroundedFactorV1[] {
  const chain = extractCausalChain({ decisionLogs: logs as any, optimizationHints: hints });
  const factors: UnifiedGroundedFactorV1[] = [];

  for (const node of chain?.nodes ?? []) {
    const kind = CAUSAL_KIND_TO_FACTOR[node.kind] ?? 'HEURISTIC';
    const severity = CAUSAL_KIND_SEVERITY[node.kind] ?? 'INFO';
    const anchor_log_indices = logs
      .map((log, i) => ({ log, i }))
      .filter(({ log }) => log.persona === node.persona || log.explanation?.slice(0, 80) === node.sourceRef?.slice(0, 80))
      .map(({ i }) => i);

    const anchor_evidence_refs = anchor_log_indices.flatMap((i) => logs[i]?.evidenceRefs ?? []);

    factors.push({
      factor_id: node.id,
      kind,
      severity,
      anchor_log_indices: anchor_log_indices.length > 0 ? anchor_log_indices : [],
      anchor_evidence_refs: Array.from(new Set(anchor_evidence_refs)),
      numeric_facts: Object.fromEntries(
        Object.entries(node.facts).filter(([, v]) => typeof v === 'number') as Array<[string, number]>,
      ),
      ...(node.sourceRef ? { rejection_reason: node.sourceRef } : {}),
    });
  }

  const verdict = hints?.decisionVerdict;
  for (const rejected of verdict?.rejected_plans ?? []) {
    for (const reason of rejected.rejection_reasons ?? []) {
      factors.push({
        factor_id: `rejected:${rejected.id}:${reason.slice(0, 48)}`,
        kind: /WORLD|ROAD|WEATHER|DEM/i.test(reason) ? 'PHYSICAL' : 'UTILITY',
        severity: rejected.status === 'infeasible' ? 'BLOCK' : 'WARN',
        anchor_log_indices: [],
        anchor_evidence_refs: [],
        rejection_reason: reason,
      });
    }
  }

  return factors;
}

function assessPhysicalEvidenceCompleteness(
  logs: DecisionLogEntryLike[],
  mode: PhysicalEvidenceGateMode,
): boolean {
  return logs.every((log, i) => {
    if (!requiresPhysicalEvidenceRefs(log, mode)) return true;
    return hasPhysicalEvidenceRefs(log);
  });
}

function assessNarrativeAnchoring(
  narrative: UnifiedNarrativeV1 | undefined,
  factorIds: Set<string>,
): { anchored: boolean; violations: string[] } {
  if (!narrative) return { anchored: true, violations: [] };
  if (narrative.mode === 'deterministic') return { anchored: true, violations: [] };

  const violations: string[] = [];
  for (const [si, section] of narrative.sections.entries()) {
    if (narrative.mode === 'llm_polished' && section.anchored_factor_ids.length === 0) {
      violations.push(`narrative.sections[${si}]: llm_polished section missing anchored_factor_ids`);
      continue;
    }
    for (const fid of section.anchored_factor_ids) {
      if (!factorIds.has(fid)) {
        violations.push(`narrative.sections[${si}]: orphan factor_id "${fid}"`);
      }
    }
  }
  return { anchored: violations.length === 0, violations };
}

export function buildUnifiedExplainabilityEnvelope(
  input: BuildUnifiedExplainabilityEnvelopeInput,
): UnifiedExplainabilityEnvelopeV1 {
  const logs = input.decisionLogs ?? [];
  const gateMode = input.physicalEvidenceGate ?? getPhysicalEvidenceGateMode();
  const traceability = analyzeDecisionLogTraceability(logs, { physicalEvidenceGate: gateMode });
  const decision_trace = mapLogsToDecisionTrace(logs);
  const grounded_factors = buildGroundedFactorsFromCausal(logs, input.optimizationHints);
  const factorIdSet = new Set(grounded_factors.map((f) => f.factor_id));
  const narrativeCheck = assessNarrativeAnchoring(input.narrative, factorIdSet);

  const drift_violations = [
    ...traceability.errors,
    ...traceability.warnings.filter((w) => w.includes('PHYSICAL decisionSource requires evidenceRefs')),
    ...narrativeCheck.violations,
  ];

  const physical_evidence_complete = assessPhysicalEvidenceCompleteness(logs, gateMode);

  return {
    contract_version: UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
    request_id: input.requestId,
    trace_id: input.traceId ?? input.requestId,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    decision_trace,
    grounded_factors,
    ...(input.narrative ? { narrative: input.narrative } : {}),
    ...(input.optimizationHints
      ? { optimization_projection: projectDecisionClosureExplain(input.optimizationHints) }
      : {}),
    integrity: {
      traceability_valid: traceability.valid,
      physical_evidence_complete,
      narrative_anchored: narrativeCheck.anchored,
      drift_violations,
    },
  };
}
