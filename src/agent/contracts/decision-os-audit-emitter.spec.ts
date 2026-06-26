import { Logger } from '@nestjs/common';
import {
  buildDecisionOsAuditReport,
  computeBridgeSessionConsistencyScore,
  emitDecisionOsAuditReport,
} from './decision-os-audit-emitter';

describe('decision-os-audit-emitter', () => {
  it('buildDecisionOsAuditReport provides contract-required fields', () => {
    const report = buildDecisionOsAuditReport({
      request_id: 'req-1',
      phase: 'GATE_EVAL',
      dominant_cid: 'FATIGUE',
      session_consistency_score: 97,
    });
    expect(report.dominant_cid).toBe('FATIGUE');
    expect(report.session_consistency_score).toBe(97);
    expect(
      (report.predictive_feedback_then_repair as { drift_vector: { delta_reason: string } })
        .drift_vector.delta_reason,
    ).toBe('aligned');
  });

  it('emitDecisionOsAuditReport logs structured event', () => {
    const logger = new Logger('test');
    const spy = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    const out = emitDecisionOsAuditReport(logger, {
      request_id: 'pwb-1',
      phase: 'PLANNING_WORKBENCH_COMPARE',
      dominant_cid: 'KERNEL_LLM_COMPARE_MISMATCH',
      session_consistency_score: 80,
      delta_reason: 'kernel_gate_override_llm',
      delta_utility: -0.12,
      terminal: true,
    });
    expect(out.dominant_cid).toBe('KERNEL_LLM_COMPARE_MISMATCH');
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0][0]));
    expect(payload.event).toBe('decision_os_audit_report');
    expect(payload.phase).toBe('PLANNING_WORKBENCH_COMPARE');
    spy.mockRestore();
  });

  it('computeBridgeSessionConsistencyScore returns 95 when aligned', () => {
    expect(computeBridgeSessionConsistencyScore({ diverged: false })).toBe(95);
    expect(computeBridgeSessionConsistencyScore({ diverged: true, severityGap: 2 })).toBeLessThan(95);
  });
});
