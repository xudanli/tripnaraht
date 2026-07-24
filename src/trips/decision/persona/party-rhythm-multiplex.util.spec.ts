import { resolveDayPaceWithPartyRhythm, buildPartyRhythmDecisionLogs } from './party-rhythm-multiplex.util';
import type { WorldModelContext } from '../shared/world-model.types';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

describe('party-rhythm-multiplex', () => {
  const basePace = {
    maxDailyAscentM: 800,
    maxDailyDistanceKm: 22,
    maxMovingHours: 9,
    rollingAscent3DaysM: 2000,
  };

  it('tightens pace when party aggregation is empathy recovery', () => {
    const world: WorldModelContext = {
      physical: { demEvidence: [], roadStates: [], hazardZones: [], ferryStates: [], countryCode: 'IS', month: 10 },
      human: {
        profileId: 'x',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'NONE',
      },
      routeDirection: { id: 'r', countryCode: 'IS', name: 'r', nameCN: 'r', nameEN: 'r', tags: [] },
      partyAggregation: {
        effectiveCapability: {
          profileId: 'party',
          maxDailyAscentM: 250,
          rollingAscent3DaysM: 600,
          maxSlopePct: 12,
          preferredPace: 'SLOW',
          riskTolerance: 'LOW',
          highAltitudeExperience: 'NONE',
        },
        effectiveExperienceFlow: {
          schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
          tempo: 'EMPATHY_RECOVERY',
          heterogeneityIndex: 0.3,
          surpriseBuffer: 0.05,
          currentFrictionCapacity: 0.2,
          narrativeTone: 'empathetic_reassurance',
        },
        rhythmMultiplexPlan: [
          {
            date: '2026-10-15',
            slotHint: '09:00-18:00',
            dominantMemberId: 'elderly',
            tempo: 'EMPATHY_RECOVERY',
            rationale: 'daytime recovery',
          },
        ],
      },
    };
    const dayPace = resolveDayPaceWithPartyRhythm(world, basePace, { dayIndex: 1 });
    expect(dayPace.maxDailyDistanceKm).toBeLessThanOrEqual(16);
    expect(buildPartyRhythmDecisionLogs(world).length).toBeGreaterThan(0);
  });
});
