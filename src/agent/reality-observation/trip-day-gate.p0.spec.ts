/**
 * TripDay ROR loader + Gate Canonical 约束单测。
 */

import { loadTripDaySeedForRor } from './trip-day-ror-loader.util';
import {
  assertNoLatentForGate,
  ensureGateCanonicalReality,
} from './gate-canonical-reality.util';
import { freezeRealitySnapshot } from './reality-snapshot.freeze';
import { buildObservationPlan } from './observation-plan.builder';
import { runObservationLoop } from './observation-executor';

describe('trip-day-ror-loader + gate-canonical', () => {
  it('loadTripDaySeedForRor 映射活动与行驶提示', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            date: new Date('2026-08-10'),
            ItineraryItem: [
              {
                id: 'i1',
                type: 'ACTIVITY',
                note: '冰川徒步',
                travelFromPreviousDuration: 120,
                Place: { name: '冰川' },
              },
              {
                id: 'i2',
                type: 'HOTEL',
                note: '住宿',
                bookingStatus: 'confirmed',
                Place: { name: 'Vik Hotel' },
              },
            ],
          },
        ]),
      },
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          travelMode: 'SELF_DRIVE',
          destination: 'Vik, Iceland',
        }),
      },
    };

    const seed = await loadTripDaySeedForRor(prisma as any, 't1', 1);
    expect(seed?.dayIndex).toBe(1);
    expect(seed?.activities?.[0]?.title).toContain('冰川');
    expect(seed?.accommodation).toBeTruthy();
    expect(seed?.travelMode).toBe('SELF_DRIVE');
    expect(seed?.travelMinutesHint).toBe(120);
    expect(seed?.weatherCityHint).toBe('Vik');
    expect(seed?.destinationHint).toContain('Vik');
    expect(seed?.accommodation).toEqual(
      expect.objectContaining({ id: 'i2' }),
    );
  });

  it('ensureGateCanonicalReality 写入 ROR Snapshot 且 latent 不可激活', async () => {
    const plan = buildObservationPlan({
      message: '第 3 天太赶了',
      scope: { tripId: 't1', dayIndex: 3 },
    });
    const state = await runObservationLoop(plan!, {
      byKey: {
        'targetDay.date': 3,
        'targetDay.activities': [{ durationMinutes: 200 }],
        'route.travelTimeMatrix': { totalMinutes: 280 },
        'booking.fixedCommitments': [],
        'participants': [],
        'team.memberCapability': {},
        'environment.daylightWindow': { daylightMinutes: 400 },
      },
    });
    const snap = freezeRealitySnapshot({
      plan: plan!,
      state,
      message: '第 3 天太赶了',
      includeLatent: true,
    });
    expect(assertNoLatentForGate(snap).ok).toBe(true);

    const dso = {
      requestId: 'r1',
      cognition: {},
      systemState: { lastUpdatedAt: new Date().toISOString() },
    } as any;
    const { decisionState, gateRealityPolicy } = ensureGateCanonicalReality(dso, snap);
    expect(gateRealityPolicy.mode).toBe('CANONICAL_ONLY');
    expect(gateRealityPolicy.latentInjected).toBe(false);
    expect(decisionState?.cognition?.realitySnapshot?.snapshotId).toBe(
      snap.decisionSnapshot.snapshotId,
    );
  });
});
