import { aggregateTravelParty } from './party-aggregation.util';
import { projectPartyPersonasFromTripRequest } from './project-party-from-request.util';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

describe('party-aggregation', () => {
  it('uses barrel principle when elderly companion is present', () => {
    const personas = projectPartyPersonasFromTripRequest({
      party: { count: 2, has_elderly: true, fitness_level: 'medium' },
      party_profile: { risk_tolerance: 'MEDIUM' },
    });
    const agg = aggregateTravelParty(personas);
    expect(agg.effectiveCapability.maxDailyAscentM).toBeLessThanOrEqual(250);
    expect(agg.effectiveExperienceFlow.tempo).toBe('EMPATHY_RECOVERY');
    expect(agg.effectiveExperienceFlow.schemaVersion).toBe(EXPERIENCE_FLOW_SCHEMA_V1);
    expect(agg.hardGateTriggeredBy?.length).toBeGreaterThan(0);
  });

  it('builds rhythm multiplex plan from primary time slices', () => {
    const personas = projectPartyPersonasFromTripRequest({
      party: { count: 2, has_elderly: true },
    });
    const agg = aggregateTravelParty(personas, {
      date: '2026-10-15',
      defaultSlices: personas[0]?.timeSlices,
    });
    expect(agg.rhythmMultiplexPlan?.length).toBeGreaterThan(0);
  });
});
