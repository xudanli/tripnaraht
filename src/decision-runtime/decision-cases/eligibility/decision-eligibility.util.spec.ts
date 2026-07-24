import {
  evaluateExperienceEligibility,
  evaluateGlacierMergedEligibility,
  parseTripPartyCapabilities,
  scheduleMaterialityBoost,
} from './decision-eligibility.util';
import type { TripPartyCapabilities } from './decision-eligibility.types';

function party(overrides: Partial<TripPartyCapabilities> = {}): TripPartyCapabilities {
  return {
    members: [
      {
        memberId: 'a1',
        ageYears: 32,
        ageGroup: 'ADULT',
        fitnessLevel: 5,
        qualifications: [],
        exclusions: [],
      },
    ],
    teamFitnessFloor: 5,
    youngestAgeYears: 32,
    hasChildren: false,
    hasElderly: false,
    excludedActivityIds: [],
    teamQualifications: [],
    teamExclusions: [],
    evidenceRefs: ['test'],
    ...overrides,
  };
}

describe('decision-eligibility', () => {
  it('parses partyProfile members fitness/qualifications/exclusions', () => {
    const parsed = parseTripPartyCapabilities({
      partyProfile: {
        members: [
          {
            ageYears: 10,
            fitnessLevel: 4,
            qualifications: ['swimming'],
            exclusions: [],
          },
          {
            ageYears: 40,
            fitnessLevel: 7,
            qualifications: ['drivers_license'],
            exclusions: ['motion_sickness'],
          },
        ],
        excludeActivities: ['snowmobile'],
      },
    });
    expect(parsed.hasChildren).toBe(true);
    expect(parsed.teamFitnessFloor).toBe(4);
    expect(parsed.youngestAgeYears).toBe(10);
    expect(parsed.teamQualifications).toEqual(
      expect.arrayContaining(['swimming', 'drivers_license']),
    );
    expect(parsed.excludedActivityIds).toContain('snowmobile');
  });

  it('blocks silfra without swimming qualification', () => {
    const result = evaluateExperienceEligibility('silfra', party());
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/swimming/i);
  });

  it('allows silfra when swimming + age + fitness ok', () => {
    const result = evaluateExperienceEligibility(
      'silfra',
      party({
        teamQualifications: ['swimming'],
        members: [
          {
            memberId: 'a1',
            ageYears: 28,
            fitnessLevel: 6,
            qualifications: ['swimming'],
            exclusions: [],
          },
        ],
        teamFitnessFloor: 6,
        youngestAgeYears: 28,
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it('glacier merge keeps viewpoint when hike fitness fails', () => {
    const result = evaluateGlacierMergedEligibility(
      party({ teamFitnessFloor: 4, youngestAgeYears: 30 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.eligibleOptionIds).toContain('glacier_viewpoint');
    expect(result.eligibleOptionIds).toContain('glacier_short');
    expect(result.eligibleOptionIds).not.toContain('glacier_hike');
  });

  it('glacier fully banned via excludeActivities', () => {
    const result = evaluateGlacierMergedEligibility(
      party({ excludedActivityIds: ['glacier'] }),
    );
    expect(result.eligible).toBe(false);
  });

  it('hard exclusion pregnancy blocks ice cave', () => {
    const result = evaluateExperienceEligibility(
      'glacier_ice_cave',
      party({
        teamExclusions: ['pregnancy'],
        members: [
          {
            memberId: 'a1',
            ageYears: 30,
            fitnessLevel: 6,
            qualifications: [],
            exclusions: ['pregnancy'],
          },
        ],
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/pregnancy/);
  });

  it('schedule boost raises fitness/team for children', () => {
    const boost = scheduleMaterialityBoost(
      party({ hasChildren: true, teamFitnessFloor: 3 }),
    );
    expect(boost.team).toBeGreaterThan(0);
    expect(boost.fitness).toBeGreaterThan(0);
  });
});
