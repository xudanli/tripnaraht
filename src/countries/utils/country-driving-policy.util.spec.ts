import {
  applyEtaPenaltyMinutes,
  computeRouteEtaModifier,
  getDrivingEtaPenaltyCoefficients,
} from './country-driving-policy.util';

const isCompliance = {
  drivingRules: {
    drivingSide: 'RIGHT' as const,
    speedLimits: {
      algorithmEtaPenaltyCoefficients: { gravelRoad: 1.4, fRoad: 2.0 },
    },
  },
};

const nzCompliance = {
  drivingRules: {
    drivingSide: 'LEFT' as const,
    leftHandDrivingEtaBuffer: 0.15,
    speedLimits: {
      algorithmEtaPenaltyCoefficients: {
        gravelRoad: 1.6,
        mountainPassRoad: 1.5,
        winterBlackIceRoad: 1.8,
        fRoad: 1.0,
      },
    },
  },
};

describe('country-driving-policy.util', () => {
  it('reads IS ETA coefficients', () => {
    const c = getDrivingEtaPenaltyCoefficients(isCompliance);
    expect(c.gravelRoad).toBe(1.4);
    expect(c.fRoad).toBe(2.0);
  });

  it('reads NZ mountain pass coefficient', () => {
    const c = getDrivingEtaPenaltyCoefficients(nzCompliance);
    expect(c.mountainPassRoad).toBe(1.5);
    expect(c.winterBlackIceRoad).toBe(1.8);
  });

  it('applies left-hand buffer for RIGHT-habit user in NZ', () => {
    const m = computeRouteEtaModifier({
      complianceInfo: nzCompliance,
      userHabitDrivingSide: 'RIGHT',
      roadSurfaces: ['MOUNTAIN_PASS'],
    });
    expect(m).toBeCloseTo(1.15 * 1.5, 5);
  });

  it('no left-hand buffer when user habit matches destination', () => {
    const m = computeRouteEtaModifier({
      complianceInfo: nzCompliance,
      userHabitDrivingSide: 'LEFT',
      roadSurfaces: ['MOUNTAIN_PASS'],
    });
    expect(m).toBe(1.5);
  });

  it('applyEtaPenaltyMinutes stacks gravel + fRoad (legacy opts)', () => {
    const c = getDrivingEtaPenaltyCoefficients(isCompliance);
    expect(applyEtaPenaltyMinutes(100, { gravelRoad: true, fRoad: true }, c)).toBe(280);
  });
});
