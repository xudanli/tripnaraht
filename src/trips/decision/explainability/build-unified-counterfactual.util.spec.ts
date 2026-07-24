import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import {
  buildUnifiedCounterfactualExplain,
  UNIFIED_COUNTERFACTUAL_CONTRACT_VERSION,
} from './build-unified-counterfactual.util';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import { icelandDecisionClosureStormF208Case } from '../evaluation/e2e-cases/iceland-decision-closure-storm-f208.example';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/iceland-decision-closure-logs.fixture';

describe('buildUnifiedCounterfactualExplain', () => {
  const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
  const envelope = buildUnifiedExplainabilityEnvelope({
    requestId: 'req-cf',
    traceId: 'trace-cf',
    decisionLogs: ICELAND_F208_DECISION_CLOSURE_LOGS,
    optimizationHints: hints,
    physicalEvidenceGate: 'warn',
    generatedAt: '2026-01-16T12:00:00.000Z',
  });

  it('builds counterfactuals for all rejected plans', () => {
    const out = buildUnifiedCounterfactualExplain({ envelope });
    expect(out?.contract_version).toBe(UNIFIED_COUNTERFACTUAL_CONTRACT_VERSION);
    expect(out?.chosen_plan_id).toBe('repair-spatial-poi-v2');
    expect(out?.counterfactuals.length).toBeGreaterThanOrEqual(2);
    const base = out?.counterfactuals.find((c) => c.alt_plan_id === 'base');
    expect(base?.status).toBe('infeasible');
    expect(base?.question_zh).toContain('base');
    expect(base?.rejection_reasons.some((r) => r.includes('F208'))).toBe(true);
    expect(out?.integrity.anchored_to_envelope).toBe(true);
  });

  it('filters by alt_plan_id', () => {
    const out = buildUnifiedCounterfactualExplain({ envelope, altPlanId: 'base' });
    expect(out?.counterfactuals).toHaveLength(1);
    expect(out?.counterfactuals[0].alt_plan_id).toBe('base');
  });

  it('returns undefined for unknown alt_plan_id', () => {
    const out = buildUnifiedCounterfactualExplain({ envelope, altPlanId: 'missing-plan' });
    expect(out).toBeUndefined();
  });

  it('includes monte_carlo summary when present', () => {
    const out = buildUnifiedCounterfactualExplain({ envelope });
    const base = out?.counterfactuals.find((c) => c.alt_plan_id === 'base');
    expect(base?.monte_carlo?.used).toBe(true);
    expect(base?.monte_carlo?.total_samples).toBe(2000);
  });
});
