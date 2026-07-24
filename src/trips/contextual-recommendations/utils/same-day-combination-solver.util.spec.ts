import { mergeSameDayProblem } from './same-day-context-merge.util';
import { solveSameDayCombinations } from './same-day-combination-solver.util';
import {
  icelandArrivalDayCanonical,
  icelandArrivalDayContextDelta,
} from '../fixtures/iceland-arrival-day.fixture';

describe('solveSameDayCombinations', () => {
  function buildProblem(overrides?: {
    energy?: 'LOW' | 'MEDIUM' | 'HIGH';
    weatherHint?: string | null;
    tripPhase?: 'ARRIVAL_DAY' | 'IN_TRIP';
  }) {
    const canonical = {
      ...icelandArrivalDayCanonical,
      tripPhase: overrides?.tripPhase ?? icelandArrivalDayCanonical.tripPhase,
      weatherHint:
        overrides?.weatherHint === undefined
          ? icelandArrivalDayCanonical.weatherHint
          : overrides.weatherHint,
    };
    const delta = {
      ...icelandArrivalDayContextDelta,
      teamState: {
        ...icelandArrivalDayContextDelta.teamState,
        energy: overrides?.energy ?? 'LOW',
      },
    };
    return mergeSameDayProblem({
      canonical,
      intent: '落地后轻松安排',
      contextDelta: delta,
    });
  }

  it('enumerates candidates and picks a feasible primary + ≤2 alternatives with schedules', () => {
    const problem = {
      ...buildProblem({ energy: 'LOW', weatherHint: null }),
      localCandidates: [
        { placeId: 1, name: 'Fish Market', kind: 'DINING' as const, distanceKm: 0.4 },
        {
          placeId: 2,
          name: '太阳航海者',
          kind: 'LIGHT_ACTIVITY' as const,
          productId: 'poi_sun_voyager',
          distanceKm: 0.8,
        },
      ],
      travelEta: {
        driveMinutes: 50,
        pickupBufferMinutes: 50,
        totalMinutesUntilHotel: 100,
        method: 'iceland_heuristic',
      },
    };

    const view = solveSameDayCombinations(problem);
    expect(view).not.toBeNull();
    expect(view!.context.solverMethod).toBe('enumeration_v1');
    expect(view!.context.candidatesEvaluated).toBeGreaterThanOrEqual(3);
    expect(view!.recommendation.reasonCodes).toContain('COMBINATION_SOLVER');
    expect(view!.recommendation.schedule.length).toBeGreaterThanOrEqual(2);
    expect(view!.alternatives.length).toBeLessThanOrEqual(2);
    expect(view!.alternatives.every((a) => Array.isArray(a.schedule))).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/Kirkjufell|教会山|蓝湖/i);
  });

  it('prefers relaxed combinations under low energy + adverse weather', () => {
    const problem = {
      ...buildProblem({ energy: 'LOW', weatherHint: '大风约 40 km/h' }),
      travelEta: {
        driveMinutes: 50,
        pickupBufferMinutes: 50,
        totalMinutesUntilHotel: 100,
        method: 'iceland_heuristic',
      },
    };
    const view = solveSameDayCombinations(problem)!;
    const hasOutdoor = view.recommendation.schedule.some(
      (s) => s.type === 'LIGHT_ACTIVITY',
    );
    // Either outdoor stripped / not chosen, or need confirm — never blind ALLOW with outdoor
    if (hasOutdoor) {
      expect(view.recommendation.gate).not.toBe('ALLOW');
    } else {
      expect(
        view.recommendation.reasonCodes.some((c) =>
          /MOST_RELAXED|WEATHER|FEASIBILITY|COMBINATION_SOLVER/.test(c),
        ),
      ).toBe(true);
    }
  });

  it('solves IN_TRIP remaining-window combinations', () => {
    const problem = {
      ...buildProblem({ tripPhase: 'IN_TRIP', energy: 'MEDIUM', weatherHint: null }),
      currentTimeIso: '2026-07-17T17:00:00+00:00',
      availableUntil: '21:00',
      desiredReturnTime: '21:00',
      localCandidates: [
        { placeId: 3, name: 'Local Bistro', kind: 'DINING' as const, distanceKm: 0.3 },
      ],
    };
    const view = solveSameDayCombinations(problem)!;
    expect(view.recommendation.reasonCodes).toContain('COMBINATION_SOLVER');
    expect(view.context.candidatesEvaluated).toBeGreaterThanOrEqual(2);
    expect(view.recommendation.schedule.some((s) => s.type === 'DINING' || s.type === 'REST')).toBe(
      true,
    );
  });
});
