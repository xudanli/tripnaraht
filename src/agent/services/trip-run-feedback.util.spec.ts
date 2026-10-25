import {
  deriveFlagsFromOutcomeEvent,
  mergeTripRunFeedbackIntoMetadata,
  overlayFeedbackOntoObservability,
  trustSignalFromOutcomeEvent,
} from './trip-run-feedback.util';
import { TRIP_RUN_OBSERVABILITY_SCHEMA_ID } from './trip-run-observability.util';

describe('trip-run-feedback.util outcome loop', () => {
  it('maps outcome events to trust signals', () => {
    expect(trustSignalFromOutcomeEvent('accept')).toBe('HIGH_TRUST');
    expect(trustSignalFromOutcomeEvent('edit')).toBe('PARTIAL_CORRECT');
    expect(trustSignalFromOutcomeEvent('regenerate')).toBe('LOW_SATISFACTION');
    expect(trustSignalFromOutcomeEvent('delete_day')).toBe('SEVERE_FAILURE');
    expect(trustSignalFromOutcomeEvent('bypass_ai')).toBe('TRUST_DECLINE');
  });

  it('merges outcomeEvent edit into feedback/behavior/outcome', () => {
    const { metadata, outcome, feedback, behavior } = mergeTripRunFeedbackIntoMetadata(
      {},
      { outcomeEvent: { event: 'edit', detail: '改了第3天', dayIndex: 2 } },
    );
    expect(outcome).toMatchObject({
      latestEvent: 'edit',
      trustSignal: 'PARTIAL_CORRECT',
      verified: true,
      eventCount: 1,
    });
    expect(feedback.modified).toBe(true);
    expect(feedback.accepted).toBe(false);
    expect(behavior.editedRoute).toBe(true);
    expect(metadata.outcome_events).toHaveLength(1);
    expect(metadata.observability_v1.schemaId).toBe(TRIP_RUN_OBSERVABILITY_SCHEMA_ID);
  });

  it('deriveFlagsFromOutcomeEvent accept', () => {
    expect(deriveFlagsFromOutcomeEvent('accept').feedback.accepted).toBe(true);
  });

  it('overlays outcome_v1 onto observability', () => {
    const obs = overlayFeedbackOntoObservability(null, {
      outcome_v1: {
        latestEvent: 'delete_day',
        trustSignal: 'SEVERE_FAILURE',
        verified: true,
        eventCount: 1,
      },
    });
    expect(obs?.outcome?.trustSignal).toBe('SEVERE_FAILURE');
  });
});
