import {
  deriveMonitoringReplanningSignals,
  monitoringSignalsToTriggerMetadata,
} from './monitoring-replanning-context.util';
import type { Rfc001DecisionRecord } from '../../trips/guardian-decision-core/contracts/decision-record.types';

const proposed = {
  decisionId: 'd1',
  recordStatus: 'PROPOSED',
} as Rfc001DecisionRecord;

describe('monitoring-replanning-context.util', () => {
  it('marks stale when PROPOSED decision exists', () => {
    const signals = deriveMonitoringReplanningSignals({
      pollKind: 'WEATHER_HAZARD',
      decisions: [proposed],
      hasEffectivePlanVersion: false,
      pollResult: { changed: true },
    });
    expect(signals.decisionRecordStale).toBe(true);
    expect(signals.eventSeverity).toBe('MEDIUM');
  });

  it('returns NO_OP-friendly signals for unchanged weather poll', () => {
    const signals = deriveMonitoringReplanningSignals({
      pollKind: 'WEATHER_HAZARD',
      decisions: [],
      hasEffectivePlanVersion: true,
      pollResult: { changed: false },
    });
    expect(signals.eventSeverity).toBe('LOW');
    expect(signals.affectsEffectivePlan).toBe(true);
    expect(monitoringSignalsToTriggerMetadata(signals).decisionRecordStale).toBe(false);
  });
});
