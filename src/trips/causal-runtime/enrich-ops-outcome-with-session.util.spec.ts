import { enrichOpsOutcomeWithSession } from './enrich-ops-outcome-with-session.util';
import type { CausalRuntimeSessionSnapshot } from './causal-runtime-session.types';
import type { TripWorldState } from '../decision/world-model';

describe('enrichOpsOutcomeWithSession', () => {
  const session: CausalRuntimeSessionSnapshot = {
    tripId: 'trip_1',
    capturedAt: new Date().toISOString(),
    lastDecisionCausalityId: 'dc_sess',
    opsRealitySnapshotId: 'snap_sess',
    state: {
      context: { tripId: 'trip_1' },
      candidatesByDate: {},
      signals: { lastDecisionCausalityId: 'dc_sess' },
      policies: {},
    } as TripWorldState,
  };

  it('fills missing state and causality_id from session', () => {
    const enriched = enrichOpsOutcomeWithSession({ tripId: 'trip_1' }, session);

    expect(enriched.causality_id).toBe('dc_sess');
    expect(enriched.state?.['context']).toEqual({ tripId: 'trip_1' });
    expect(enriched.snapshotId).toBe('snap_sess');
    expect(enriched.stateAutoFilled).toBe(true);
    expect(enriched.causalityAutoFilled).toBe(true);
  });

  it('prefers client-provided state over session', () => {
    const clientState = { context: { tripId: 'trip_1', source: 'client' } };
    const enriched = enrichOpsOutcomeWithSession(
      { tripId: 'trip_1', state: clientState, causality_id: 'dc_client' },
      session,
    );

    expect(enriched.causality_id).toBe('dc_client');
    expect(enriched.state).toEqual(clientState);
    expect(enriched.stateAutoFilled).toBeUndefined();
  });
});
