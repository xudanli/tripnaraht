import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from '../evaluation/e2e-cases/iceland-decision-closure-logs.fixture';
import {
  assessNarrativeExplainabilityDrift,
  buildNarrativeDriftObservabilitySlice,
  emitNarrativeDriftMetricEvent,
  parseNarrativeDriftMetricEvents,
  summarizeNarrativeDriftEvents,
} from './narrative-drift-monitor.util';
import { projectExplainForHumanFromEnvelope } from './project-explain-for-human-from-envelope.util';

describe('narrative-drift-monitor (decision-os/narrative-drift/v1)', () => {
  const envelope = buildUnifiedExplainabilityEnvelope({
    requestId: 'req-drift',
    decisionLogs: ICELAND_F208_DECISION_CLOSURE_LOGS,
    physicalEvidenceGate: 'warn',
    generatedAt: '2026-01-16T12:00:00.000Z',
  });

  it('passes when risk_highlights align with envelope projection', () => {
    const human = projectExplainForHumanFromEnvelope(envelope);
    const report = assessNarrativeExplainabilityDrift({
      envelope,
      riskHighlights: human.riskHighlights,
    });
    expect(report.drift_detected).toBe(false);
    expect(report.narrative_drift_score).toBe(1);
  });

  it('flags orphan reason_code in risk_highlights', () => {
    const report = assessNarrativeExplainabilityDrift({
      envelope,
      riskHighlights: [
        {
          risk: 'fake',
          severity: 'high',
          explanation: 'orphan',
          reason_codes: ['NOT_IN_TRACE'],
        },
      ],
    });
    expect(report.drift_detected).toBe(true);
    expect(report.violations.some((v) => v.code === 'orphan_reason_code')).toBe(true);
    expect(report.narrative_drift_score).toBeLessThan(1);
  });

  it('includes envelope integrity drift violations', () => {
    const bad = buildUnifiedExplainabilityEnvelope({
      requestId: 'req-bad',
      decisionLogs: [{ ...ICELAND_F208_DECISION_CLOSURE_LOGS[0], evidenceRefs: undefined }],
      physicalEvidenceGate: 'error_critical_stages',
    });
    const report = assessNarrativeExplainabilityDrift({ envelope: bad });
    expect(report.drift_detected).toBe(true);
    expect(report.violations.some((v) => v.code === 'envelope_integrity')).toBe(true);
    expect(report.physical_evidence_complete).toBe(false);
  });

  it('emits metric log when env enabled', () => {
    process.env.NARRATIVE_DRIFT_METRICS_LOG = '1';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const slice = buildNarrativeDriftObservabilitySlice(
      assessNarrativeExplainabilityDrift({ envelope }),
    );
    emitNarrativeDriftMetricEvent({ request_id: 'r1', trip_id: 't1', slice });
    expect(logSpy).toHaveBeenCalled();
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(line).toContain('narrative_drift');
    const events = parseNarrativeDriftMetricEvents(line);
    expect(events).toHaveLength(1);
    expect(summarizeNarrativeDriftEvents(events).totalEvents).toBe(1);
    logSpy.mockRestore();
    delete process.env.NARRATIVE_DRIFT_METRICS_LOG;
  });
});
