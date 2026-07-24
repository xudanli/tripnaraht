import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import { projectExplainForHumanFromEnvelope } from './project-explain-for-human-from-envelope.util';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/iceland-decision-closure-logs.fixture';

describe('projectExplainForHumanFromEnvelope', () => {
  it('uses reasonCodes for tradeOff why (not hardcoded templates)', () => {
    const envelope = buildUnifiedExplainabilityEnvelope({
      requestId: 'proj-1',
      decisionLogs: ICELAND_F208_DECISION_CLOSURE_LOGS,
      physicalEvidenceGate: 'warn',
    });
    const out = projectExplainForHumanFromEnvelope(envelope);
    const replaceTrade = out.tradeOffs.find((t) => t.what.includes('F208'));
    expect(replaceTrade).toBeDefined();
    expect(replaceTrade?.why).toContain('空间修复');
    expect(replaceTrade?.why).not.toBe('原路段不可用或存在风险');
    expect(replaceTrade?.reason_codes).toContain('SPATIAL_REPAIR');
  });
});
