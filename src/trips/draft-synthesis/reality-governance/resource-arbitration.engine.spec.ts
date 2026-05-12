import { arbitrateResourceClaims } from './resource-arbitration.engine';
import type { RealityResource } from './reality-resource.types';
import type { ResourceClaim } from './resource-claim.types';

describe('arbitrateResourceClaims', () => {
  it('picks higher priority when two claim same slot', () => {
    const claims: ResourceClaim[] = [
      {
        claimId: 'c1',
        tripId: 't_low',
        resourceId: 'rest:1',
        slotKey: '2026-06-01|18:00',
        priorityScore: 0.3,
        urgencyScore: 0.5,
      },
      {
        claimId: 'c2',
        tripId: 't_high',
        resourceId: 'rest:1',
        slotKey: '2026-06-01|18:00',
        priorityScore: 0.9,
        urgencyScore: 0.6,
      },
    ];
    const res = new Map<string, RealityResource>([
      [
        'rest:1',
        {
          id: 'rest:1',
          type: 'RESTAURANT_SEAT',
          capacity: 1,
          currentLoad: 0,
          allocationPolicy: 'vip-first',
        },
      ],
    ]);
    const out = arbitrateResourceClaims(claims, res, 'PRIORITY');
    expect(out).toHaveLength(1);
    expect(out[0].winnerTripId).toBe('t_high');
    expect(out[0].rejected.some((x) => x.tripId === 't_low')).toBe(true);
  });
});
