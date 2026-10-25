/**
 * Unit + Gate assertion contract for P0-1 road tick.
 */

import { buildDecisionTickRoadGateAssertions } from './build-decision-tick-road-gate-assertions.util';
import { materializeLookRoadAuthorityForDecisionTick } from './look-road-authority-bridge';
import { buildLookRoadSuspectedClosedHint } from './look-road-authority-bridge.types';

describe('build-decision-tick-road-gate-assertions', () => {
  const lookHint = buildLookRoadSuspectedClosedHint({
    lookObservationId: 'obs',
    roadId: 'F208',
    tripId: 'trip_g',
  });

  it('BLOCK_CLOSED → status BLOCK + CRITICAL', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'tg_a',
      lookHint,
      authority: {
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: '2026-07-17T12:00:00.000Z',
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev',
        version: 'v',
      },
    });
    const a = buildDecisionTickRoadGateAssertions(m);
    expect(a[0]?.status).toBe('BLOCK');
    expect(a[0]?.reasonCode).toBe('DECISION_TICK_ROAD_CLOSED');
    expect(a[0]?.overridable).toBe(false);
    expect(a[0]?.evidenceRefs.some((r) => r.includes('ev'))).toBe(true);
  });

  it('ALLOW_OPEN → PASS (Look misreport must not BLOCK)', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'tg_b',
      lookHint,
      authority: {
        kind: 'RESOLVED',
        status: 'OPEN',
        observedAt: '2026-07-17T12:00:00.000Z',
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev',
        version: 'v',
      },
    });
    const a = buildDecisionTickRoadGateAssertions(m);
    expect(a[0]?.status).toBe('PASS');
    expect(a[0]?.reasonCode).toBe('DECISION_TICK_ROAD_OPEN');
  });

  it('UNAVAILABLE → REQUIRES_VERIFICATION', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'tg_c',
      lookHint,
      authority: {
        kind: 'UNAVAILABLE',
        attemptedAt: '2026-07-17T12:00:00.000Z',
        reason: 'timeout',
        evidenceId: 'ev',
        version: 'v',
      },
    });
    const a = buildDecisionTickRoadGateAssertions(m);
    expect(a[0]?.status).toBe('REQUIRES_VERIFICATION');
    expect(a[0]?.reasonCode).toBe('DECISION_TICK_ROAD_UNVERIFIED');
  });
});
