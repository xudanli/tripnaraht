import { evaluatePhysicalFitnessHardGate, resolveRoutePhysicalProfile } from './physical-fitness-hard-gate.engine';
import type { TrekkingFitnessBaseline } from '../types/physical-fitness-gate.types';

const CITY_NOVICE: TrekkingFitnessBaseline = {
  maxDailyAscentM: 350,
  maxAltitudeM: 500,
  maxPackWeightKg: 5,
  heavyPackCampingVerified: false,
  recentAerobicSessions30d: 1,
  source: 'default',
  evidenceLabel: '香积寺-十里琅珰速攀（城市休闲）',
};

const HEAVY_TREK_VETERAN: TrekkingFitnessBaseline = {
  maxDailyAscentM: 1600,
  maxAltitudeM: 4800,
  maxPackWeightKg: 22,
  heavyPackCampingVerified: true,
  recentAerobicSessions30d: 12,
  source: 'trip_history',
  evidenceLabel: '2026-04 川西长毕穿 3 日重装',
};

describe('physical-fitness-hard-gate.engine', () => {
  it('does not block non-trekking posts', () => {
    const gate = evaluatePhysicalFitnessHardGate({
      scriptId: 'dopamine_escape',
      applicant: CITY_NOVICE,
    });
    expect(gate.active).toBe(false);
    expect(gate.blocked).toBe(false);
  });

  it('hard intercepts city novice on Iceland Laugavegur Level 4', () => {
    const gate = evaluatePhysicalFitnessHardGate({
      scriptId: 'iceland_laugavegur_heavy_trek',
      applicant: CITY_NOVICE,
    });
    expect(gate.active).toBe(true);
    expect(gate.blocked).toBe(true);
    expect(gate.blockReason).toContain('物理强度');
    expect(gate.hardGateSummaryLine).toContain('Level 4');
  });

  it('passes veteran with fit report for captain lens', () => {
    const gate = evaluatePhysicalFitnessHardGate({
      scriptId: 'chuanxi_heavy_trek',
      applicant: HEAVY_TREK_VETERAN,
    });
    expect(gate.blocked).toBe(false);
    expect(gate.report?.fitPercent).toBeGreaterThanOrEqual(100);
    expect(gate.report?.evidenceLabel).toContain('长毕穿');
  });

  it('resolves route profile for premium scripts', () => {
    const route = resolveRoutePhysicalProfile('iceland_laugavegur_heavy_trek');
    expect(route?.tier).toBe(4);
    expect(route?.requiresHeavyPackCamping).toBe(true);
  });
});
