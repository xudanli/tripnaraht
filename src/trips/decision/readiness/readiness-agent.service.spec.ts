import { ReadinessAgentService } from './readiness-agent.service';
import { buildTripExecutionSemanticViewSnapshot } from '../execution/trip-execution-semantic-view.builder';
import type { TripPlan } from '../plan-model';
import type { WorldModelContext } from '../shared/world-model.types';

describe('ReadinessAgentService — Layer A (executionSemanticView)', () => {
  const svc = new ReadinessAgentService();

  const minimalPlan = (): TripPlan => ({
    version: '1',
    createdAt: new Date().toISOString(),
    days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
  });

  const baseWorld = (
    executionSemanticView?: WorldModelContext['executionSemanticView'],
  ): WorldModelContext =>
    ({
      physical: {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 6,
      },
      human: {
        profileId: 'u',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 15,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'BASIC',
      },
      routeDirection: { uuid: 'rd', tags: [] },
      executionSemanticView,
    }) as WorldModelContext;

  it('derives MUST readiness from HARD tier (not from physical.weatherEvidence)', () => {
    const view = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: {
        '2026-06-01': {
          violation: 'HARD',
          executionState: 'BLOCKED',
          explanation: 'blocked layer a',
        },
      },
      planDates: ['2026-06-01'],
    });

    const physicalWithLegacyEvidence = {
      ...baseWorld(view).physical,
      weatherEvidence: [
        {
          segmentId: 'legacy',
          violation: 'NONE',
          windSpeedMs: 5,
          precipitationMm: 0,
          explanation: 'legacy must not drive readiness weather rows',
        },
      ],
    };

    const r = svc.run(
      {
        ...baseWorld(view),
        physical: physicalWithLegacyEvidence,
      } as WorldModelContext,
      minimalPlan(),
    );

    const hardItem = r.items.find(i => i.id === 'exec-semantic-weather-hard-2026-06-01');
    expect(hardItem).toBeDefined();
    expect(hardItem?.severity).toBe('MUST');
    expect(hardItem?.description).toContain('blocked layer a');
  });

  it('derives SHOULD readiness from SOFT / outdoor stress', () => {
    const view = buildTripExecutionSemanticViewSnapshot({
      weatherByDate: {
        '2026-06-01': {
          executionState: 'HIGH_RISK',
          violation: 'NONE',
          explanation: 'elevated risk',
        },
      },
      planDates: ['2026-06-01'],
    });

    const r = svc.run(baseWorld(view), minimalPlan());
    const soft = r.items.find(i => i.id === 'exec-semantic-weather-soft-2026-06-01');
    expect(soft).toBeDefined();
    expect(soft?.severity).toBe('SHOULD');
  });
});
