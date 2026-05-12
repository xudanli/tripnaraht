import { computeFuelReachability, computeEffectiveRangeKm } from './compute-fuel-reachability';
import type { VehicleFuelProfile } from './fuel-reachability.types';

describe('fuel reachability (P-FUEL-1)', () => {
  const vehicle: VehicleFuelProfile = {
    nominalRangeKm: 400,
    safetyMarginPct: 0.1,
    worstCaseMultiplier: 1.2,
  };

  it('computeEffectiveRangeKm applies margin and worst-case multiplier', () => {
    const eff = computeEffectiveRangeKm(vehicle);
    expect(eff).toBeCloseTo((400 * 0.9) / 1.2, 5);
  });

  it('flags CRITICAL when remaining range cannot reach next fuel along arc', () => {
    const summaries = computeFuelReachability({
      polyline: {
        legs: [
          {
            id: 's1',
            date: '2026-06-01',
            cumulativeKmToLegEnd: 350,
            kmToNextFuel: 0,
            distanceKm: 350,
          },
        ],
      },
      poiIndex: [
        {
          id: 'f1',
          category: 'FUEL',
          lat: 64,
          lng: -22,
          arcKmAlongRoute: 400,
        },
      ],
      vehicleProfile: vehicle,
    });

    expect(summaries[0]?.kmToNextFuel).toBeCloseTo(50, 5);
    expect(summaries[0]?.safeBeforeNextFuel).toBe(false);
    expect(summaries[0]?.severity).toBe('CRITICAL');
  });

  it('LOW when ahead fuel is within remaining envelope', () => {
    const summaries = computeFuelReachability({
      polyline: {
        legs: [
          {
            id: 's1',
            date: '2026-06-01',
            cumulativeKmToLegEnd: 100,
            kmToNextFuel: 0,
            distanceKm: 100,
          },
        ],
      },
      poiIndex: [
        {
          id: 'f1',
          category: 'FUEL',
          lat: 64,
          lng: -22,
          arcKmAlongRoute: 150,
        },
      ],
      vehicleProfile: vehicle,
    });

    expect(summaries[0]?.safeBeforeNextFuel).toBe(true);
    expect(summaries[0]?.severity).toBe('LOW');
  });
});
