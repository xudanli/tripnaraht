/**
 * Unit: P0-3 POI authority bridge A/B/C + shared sourceVersion.
 */

import {
  assertSharedPoiSourceVersion,
  materializePoiAuthorityForDecisionTick,
} from './poi-authority-bridge';
import { buildPoiSuspectedClosedHint } from './poi-authority-bridge.types';
import { buildDecisionTickPoiGateAssertions } from './build-decision-tick-poi-gate-assertions.util';

describe('poi-authority-bridge (P0-3)', () => {
  const hint = buildPoiSuspectedClosedHint({
    tripId: 'trip_poi',
    poiId: 'is.skaftafell',
    observationId: 'obs_1',
  });

  it('A: authority CLOSED → CLOSED everywhere + shared sourceVersion + Gate BLOCK', () => {
    const m = materializePoiAuthorityForDecisionTick({
      tickId: 't_a',
      tripId: 'trip_poi',
      poiId: 'is.skaftafell',
      fieldHint: hint,
      authority: {
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: '2026-07-17T14:00:00.000Z',
        sourceProvider: 'vatnajokull_trail_status',
        authority: 'OFFICIAL',
        evidenceId: 'ev_a',
        version: 'vA',
        ruleType: 'CLOSED',
      },
    });

    expect(m.fieldHint?.authoritative).toBe(false);
    expect(m.poiStatus).toBe('CLOSED');
    expect(m.canonicalPoiState.open).toBe(false);
    expect(m.physicalPoiState.open).toBe(false);
    expect(m.gateDisposition).toBe('BLOCK_CLOSED');
    expect(assertSharedPoiSourceVersion(m)).toBe(true);

    const assertions = buildDecisionTickPoiGateAssertions(m);
    expect(assertions[0]?.status).toBe('BLOCK');
    expect(assertions[0]?.reasonCode).toBe('DECISION_TICK_POI_CLOSED');
  });

  it('B: field hint CLOSED + authority OPEN → OPEN (hint does not seal)', () => {
    const m = materializePoiAuthorityForDecisionTick({
      tickId: 't_b',
      tripId: 'trip_poi',
      poiId: 'is.skaftafell',
      fieldHint: hint,
      authority: {
        kind: 'RESOLVED',
        status: 'OPEN',
        observedAt: '2026-07-17T14:05:00.000Z',
        sourceProvider: 'vatnajokull_trail_status',
        authority: 'OFFICIAL',
        evidenceId: 'ev_b',
        version: 'vB',
      },
    });

    expect(m.poiStatus).toBe('OPEN');
    expect(m.canonicalPoiState.open).toBe(true);
    expect(m.gateDisposition).toBe('ALLOW_OPEN');
    expect(buildDecisionTickPoiGateAssertions(m)[0]?.status).toBe('PASS');
  });

  it('C: UNAVAILABLE → UNVERIFIED / NEED_CONFIRM (no forge)', () => {
    const m = materializePoiAuthorityForDecisionTick({
      tickId: 't_c',
      tripId: 'trip_poi',
      poiId: 'is.skaftafell',
      fieldHint: hint,
      authority: {
        kind: 'UNAVAILABLE',
        attemptedAt: '2026-07-17T14:10:00.000Z',
        reason: 'timeout',
        evidenceId: 'ev_c',
        version: 'vC',
      },
    });

    expect(m.poiStatus).toBe('UNVERIFIED');
    expect(m.canonicalPoiState.open).toBeUndefined();
    expect(m.physicalPoiState.open).toBeNull();
    expect(m.gateDisposition).toBe('NEED_CONFIRM');
    expect(m.hardConstraintsHonored.noForgedStatusOnAuthorityFailure).toBe(
      true,
    );
    expect(
      buildDecisionTickPoiGateAssertions(m)[0]?.status,
    ).toBe('REQUIRES_VERIFICATION');
  });
});
