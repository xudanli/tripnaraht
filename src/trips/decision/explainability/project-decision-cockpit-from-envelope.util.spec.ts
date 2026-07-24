import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import {
  DECISION_COCKPIT_CONTRACT_VERSION,
  projectDecisionCockpitFromEnvelope,
} from './project-decision-cockpit-from-envelope.util';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/iceland-decision-closure-logs.fixture';

describe('projectDecisionCockpitFromEnvelope (decision-cockpit@v1)', () => {
  const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
  const envelope = buildUnifiedExplainabilityEnvelope({
    requestId: 'req-cockpit',
    traceId: 'trace-cockpit',
    decisionLogs: ICELAND_F208_DECISION_CLOSURE_LOGS,
    optimizationHints: hints,
    physicalEvidenceGate: 'warn',
    generatedAt: '2026-01-16T12:00:00.000Z',
  });

  it('projects trace rows, risk factors, and counterfactuals for UI', () => {
    const cockpit = projectDecisionCockpitFromEnvelope({ envelope });
    expect(cockpit?.contract_version).toBe(DECISION_COCKPIT_CONTRACT_VERSION);
    expect(cockpit?.chosen_plan_id).toBe('repair-spatial-poi-v2');
    expect(cockpit?.decision_trace_rows.length).toBe(2);
    expect(cockpit?.risk_factors.length).toBeGreaterThan(0);
    expect(cockpit?.counterfactuals.some((c) => c.alt_plan_id === 'base')).toBe(true);
    expect(cockpit?.world_constraints?.road_ids).toContain('F208');
    expect(cockpit?.monte_carlo?.total_samples).toBe(2000);
    expect(cockpit?.apis.unified_ssot_field).toBe('explain.unified');
  });

  it('merges narrative drift badges when provided', () => {
    const cockpit = projectDecisionCockpitFromEnvelope({
      envelope,
      narrativeDrift: {
        schema: 'decision-os/narrative-drift/v1',
        monitor_version: 1,
        drift_detected: false,
        narrative_anchored: true,
        traceability_valid: true,
        physical_evidence_complete: true,
        narrative_drift_score: 1,
        violation_count: 0,
        reason_codes: [],
        drift_summary_zh: 'ok',
      },
    });
    expect(cockpit?.integrity_badges.narrative_drift_score).toBe(1);
  });

  it('returns undefined when trace rows have no meaningful content', () => {
    const sparse = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-sparse',
      traceId: 'trace-sparse',
      decisionLogs: [
        {
          persona: 'USER_ACTION',
          action: 'ALLOW',
          decisionSource: 'USER',
          decisionStage: '',
          explanation: '',
          reasonCodes: [],
          evidenceRefs: [],
        },
        {
          persona: 'NEPTUNE',
          action: 'ALLOW',
          decisionSource: 'RULE',
          decisionStage: '',
          explanation: '',
          reasonCodes: [],
          evidenceRefs: [],
        },
      ],
      generatedAt: '2026-01-16T12:00:00.000Z',
    });
    expect(projectDecisionCockpitFromEnvelope({ envelope: sparse })).toBeUndefined();
  });
});
