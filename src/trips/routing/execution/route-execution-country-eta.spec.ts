import { projectRouteExecutionHazards } from './project-route-execution-hazards';
import { buildCountryEtaPolicyInput } from '../../../countries/utils/country-eta-policy-for-route.util';

const nzCompliance = {
  drivingRules: {
    drivingSide: 'LEFT',
    leftHandDrivingEtaBuffer: 0.15,
    speedLimits: {
      algorithmEtaPenaltyCoefficients: {
        gravelRoad: 1.6,
        mountainPassRoad: 1.5,
        fRoad: 1.0,
      },
    },
  },
};

describe('route execution × CountryProfile V2 ETA', () => {
  const baseInput = {
    legId: 'leg-nz',
    geometry: { coordinates: [] },
    elevationProfile: { samples: [] },
    weatherGrid: { samples: [{ alongRatio: 0.5, crosswindRisk: 0.1 }] },
    vehicleProfile: { vehicleClass: 'SEDAN' as const },
    timeWindow: { startIso: '2026-01-02T08:00:00Z', endIso: '2026-01-02T18:00:00Z' },
    baselineDurationMin: 100,
    countryCode: 'NZ',
  };

  it('increases expected minutes for NZ gravel + left-hand habit vs bare baseline', () => {
    const bare = projectRouteExecutionHazards({
      ...baseInput,
      roadCondition: { fRoad: false, gravelRoad: false },
    });
    const policy = buildCountryEtaPolicyInput(
      nzCompliance,
      { gravelRoad: true },
      { countryCode: 'NZ', userHabitDrivingSide: 'RIGHT' },
    );
    const withCountry = projectRouteExecutionHazards({
      ...baseInput,
      roadCondition: { gravelRoad: true },
      countryEtaPolicy: policy,
    });
    expect(policy.baselineEtaModifier).toBeGreaterThan(1.5);
    expect(withCountry.eta.expectedMinutes).toBeGreaterThan(bare.eta.expectedMinutes);
    expect(withCountry.assessment.countryBaselineEtaModifier).toBe(policy.baselineEtaModifier);
  });

  it('IS F-road policy raises ETA vs sedan-blocked corridor weather penalty only', () => {
    const isCompliance = {
      drivingRules: {
        drivingSide: 'RIGHT',
        speedLimits: {
          algorithmEtaPenaltyCoefficients: { gravelRoad: 1.4, fRoad: 2.0 },
        },
      },
    };
    const policy = buildCountryEtaPolicyInput(
      isCompliance,
      { fRoad: true, gravelRoad: true },
      { countryCode: 'IS', userHabitDrivingSide: 'RIGHT' },
    );
    const r = projectRouteExecutionHazards({
      ...baseInput,
      legId: 'leg-is',
      countryCode: 'IS',
      roadCondition: { fRoad: true, gravelRoad: true },
      countryEtaPolicy: policy,
    });
    expect(r.eta.expectedMinutes).toBeGreaterThanOrEqual(200);
    expect(r.assessment.executionState).toBe('BLOCKED');
  });
});
