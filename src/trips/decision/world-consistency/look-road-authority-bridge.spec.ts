/**
 * P0-1 Look → Authority → Decision-tick road bridge
 *
 * Acceptance:
 *   A Look suspected + Authority CLOSED → all CLOSED + shared sourceVersion
 *   B Look suspected + Authority OPEN → all OPEN (Look must not seal CLOSED)
 *   C Authority UNAVAILABLE → UNVERIFIED / NEED_CONFIRM / CGUS !treatAsOpenFact
 */

import {
  assertSharedRoadSourceVersion,
  bindPhysicalRoadStatesForTick,
  materializeLookRoadAuthorityForDecisionTick,
} from './look-road-authority-bridge';
import { buildLookRoadSuspectedClosedHint } from './look-road-authority-bridge.types';
import type { AuthorityRoadResolveOutcome } from './look-road-authority-bridge.types';

describe('look-road-authority-bridge (P0-1)', () => {
  const lookHint = buildLookRoadSuspectedClosedHint({
    lookObservationId: 'look_obs_1',
    roadId: 'F208',
    tripId: 'trip_is_1',
    segmentId: 'seg_f208',
    suspectedAt: '2026-07-17T10:00:00.000Z',
  });

  it('hard constraint: Look hint is never authoritative road.status', () => {
    expect(lookHint.authoritative).toBe(false);
    expect(lookHint.predicate).toBe('look.field_observation');
    expect(() =>
      materializeLookRoadAuthorityForDecisionTick({
        tickId: 'T1',
        lookHint: { ...lookHint, authoritative: true as false },
        authority: {
          kind: 'RESOLVED',
          status: 'CLOSED',
          observedAt: '2026-07-17T10:01:00.000Z',
          sourceProvider: 'vegagerdin_gagnaveita',
          authority: 'OFFICIAL',
          evidenceId: 'ev_1',
          version: 'v1',
        },
      }),
    ).toThrow(/authoritative must be false/);
  });

  it('A: Look suspected + Authority CLOSED → CLOSED everywhere + shared sourceVersion', () => {
    const authority: AuthorityRoadResolveOutcome = {
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: '2026-07-17T10:01:00.000Z',
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_road_f208_closed',
      version: 'resolver@1',
    };
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'T1A',
      lookHint,
      authority,
    });

    expect(m.roadStatus).toBe('CLOSED');
    expect(m.physicalRoadState.status).toBe('CLOSED');
    expect(m.constraintField.state).toBe('CLOSED');
    expect(m.gateDisposition).toBe('BLOCK_CLOSED');
    expect(m.abuSees.road).toBe('CLOSED');
    expect(m.cgusSees.road).toBe('CLOSED');
    expect(m.gateSees.road).toBe('CLOSED');
    expect(assertSharedRoadSourceVersion(m)).toBe(true);
    expect(m.lookHint.authoritative).toBe(false);
    expect(m.hardConstraintsHonored.lookNeverAuthoritativeRoadStatus).toBe(
      true,
    );

    const bound = bindPhysicalRoadStatesForTick(
      [{ roadId: 'F208', status: 'OPEN' }],
      m,
    );
    expect(bound).toHaveLength(1);
    expect(bound[0]?.status).toBe('CLOSED');
    expect(bound[0]?.metadata?.sourceVersion).toEqual(m.sourceVersion);
  });

  it('B: Look suspected + Authority OPEN → OPEN; Look must not seal CLOSED', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'T1B',
      lookHint,
      authority: {
        kind: 'RESOLVED',
        status: 'OPEN',
        observedAt: '2026-07-17T10:02:00.000Z',
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev_road_f208_open',
        version: 'resolver@1',
      },
    });

    expect(m.roadStatus).toBe('OPEN');
    expect(m.physicalRoadState.status).toBe('OPEN');
    expect(m.constraintField.state).toBe('OPEN');
    expect(m.gateDisposition).toBe('ALLOW_OPEN');
    expect(m.abuSees.road).toBe('OPEN');
    expect(m.cgusSees.road).toBe('OPEN');
    expect(m.cgusSees.treatAsOpenFact).toBe(true);
    expect(m.gateSees.road).toBe('OPEN');
    expect(assertSharedRoadSourceVersion(m)).toBe(true);
  });

  it('C: Authority UNAVAILABLE → UNVERIFIED / NEED_CONFIRM / CGUS !OPEN fact', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'T1C',
      lookHint,
      authority: {
        kind: 'UNAVAILABLE',
        attemptedAt: '2026-07-17T10:03:00.000Z',
        reason: 'road_status_api_timeout',
        evidenceId: 'ev_road_f208_unavail',
        version: 'resolver@unavailable',
      },
    });

    expect(m.roadStatus).toBe('UNVERIFIED');
    expect(m.gateDisposition).toBe('NEED_CONFIRM');
    expect(m.cgusSees.treatAsOpenFact).toBe(false);
    expect(m.abuSees.road).toBe('UNVERIFIED');
    expect(m.cgusSees.road).toBe('UNVERIFIED');
    expect(m.gateSees.road).toBe('UNVERIFIED');
    expect(m.physicalRoadState.status).not.toBe('OPEN');
    expect(m.physicalRoadState.status).not.toBe('CLOSED');
    expect(m.hardConstraintsHonored.noForgedStatusOnAuthorityFailure).toBe(
      true,
    );
    expect(assertSharedRoadSourceVersion(m)).toBe(true);
  });
});
