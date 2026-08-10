import {
  computeTravelTimeDistribution,
  runIcelandSelfDriveCausalAnalysis,
  slackToMissProbability,
  windToSpeedFactor,
} from './iceland-self-drive-causal.engine';
import { formatIcelandSelfDriveAssessment } from './iceland-self-drive-narrative.util';
import { analyzeIcelandWithShift, mergeIcelandCausalIntoProjection } from './iceland-causal-bridge';

describe('iceland-self-drive-causal', () => {
  it('wind increases P90 travel time', () => {
    const calm = computeTravelTimeDistribution({
      baseDurationMinutes: 130,
      distanceKm: 180,
      windMps: 6,
      windExposure: 'high',
    });
    const windy = computeTravelTimeDistribution({
      baseDurationMinutes: 130,
      distanceKm: 180,
      windMps: 18,
      windExposure: 'high',
    });
    expect(windy.p90Minutes).toBeGreaterThan(calm.p90Minutes);
    expect(windToSpeedFactor(18, 'high')).toBeLessThan(windToSpeedFactor(6, 'high'));
  });

  it('high-roof + gust further reduces safe speed vs sedan-equivalent', () => {
    const sedan = windToSpeedFactor(18, 'high');
    const camper = windToSpeedFactor(18, 'high', undefined, {
      highRoof: true,
      windGustMps: 22,
    });
    expect(camper).toBeLessThan(sedan);

    const sedanTravel = computeTravelTimeDistribution({
      baseDurationMinutes: 170,
      distanceKm: 95,
      windMps: 18,
      windExposure: 'high',
    });
    const camperTravel = computeTravelTimeDistribution({
      baseDurationMinutes: 170,
      distanceKm: 95,
      windMps: 18,
      windGustMps: 22,
      highRoof: true,
      windExposure: 'high',
    });
    expect(camperTravel.p90Minutes).toBeGreaterThan(sedanTravel.p90Minutes);
  });

  it('produces user-facing assessment with miss probability and shift recommendation', () => {
    const out = runIcelandSelfDriveCausalAnalysis({
      routeLabel: 'Vík → 冰川徒步集合点',
      distanceKm: 190,
      baseDurationMinutes: 130,
      windMps: 16,
      windExposure: 'high',
      appointmentSlackMinutes: 25,
      region: 'vik',
      vehicleClass: '4WD',
    });

    expect(out.missProbability).toBeGreaterThan(0.25);
    expect(out.userFacingAssessment).toContain('Vík');
    expect(out.userFacingAssessment).toContain('P90');
    expect(out.recommendedIntervention?.shiftMinutes).toBeGreaterThan(0);
    expect(out.causalChain).toContain('environment:wind_mps');
  });

  it('shift intervention reduces miss probability', () => {
    const base = {
      routeLabel: 'Vík → 冰川集合点',
      distanceKm: 190,
      baseDurationMinutes: 130,
      windMps: 16,
      windExposure: 'high' as const,
      appointmentSlackMinutes: 20,
    };
    const before = runIcelandSelfDriveCausalAnalysis(base);
    const after = analyzeIcelandWithShift(base, 50);
    expect(after.missProbabilityAfterShift!).toBeLessThan(before.missProbability);
    expect(mergeIcelandCausalIntoProjection(after).bindings.length).toBeGreaterThan(2);
  });

  it('formats narrative sentence', () => {
    const text = formatIcelandSelfDriveAssessment({
      routeLabel: 'Vík → 冰川徒步集合点',
      windMps: 16,
      windWindowLabel: '明天 10:00—13:00 南岸',
      baseDurationMinutes: 130,
      p90Minutes: 185,
      missProbability: 0.42,
      shiftMinutes: 50,
      missProbabilityAfterShift: 0.16,
    });
    expect(text).toContain('42%');
    expect(text).toContain('50 分钟');
  });
});

describe('slackToMissProbability', () => {
  it('is monotonic — more slack lowers miss prob', () => {
    const tight = slackToMissProbability(10, 150, 130);
    const loose = slackToMissProbability(60, 150, 130);
    expect(loose).toBeLessThan(tight);
  });
});
