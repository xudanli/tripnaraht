import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import {
  hotelStabilityRiskBuffer,
  resolveHotelEnvironmentConfidence,
} from './research-member-hotel-env-confidence.util';

describe('research-member-hotel-env-confidence.util', () => {
  it('entropy01 低 → HIGH，risk_buffer MODERATE', () => {
    const dso = {
      uncertaintyProfile: { entropy01: 0.2 },
    } as DecisionState;
    const band = resolveHotelEnvironmentConfidence({ researchData: {}, dso });
    expect(band).toBe('HIGH');
    expect(hotelStabilityRiskBuffer(band)).toBe('MODERATE');
  });

  it('entropy01 高 → LOW', () => {
    const dso = {
      uncertaintyProfile: { entropy01: 0.8 },
    } as DecisionState;
    expect(resolveHotelEnvironmentConfidence({ researchData: {}, dso })).toBe('LOW');
  });

  it('无 DSO 时 weatherRisk 可推高置信', () => {
    const rd = { weather_risk: 0.2 };
    expect(resolveHotelEnvironmentConfidence({ researchData: rd })).toBe('HIGH');
  });

  it('无 DSO 时高 weatherRisk → LOW', () => {
    const rd = { weatherRisk: 0.7 };
    expect(resolveHotelEnvironmentConfidence({ researchData: rd })).toBe('LOW');
  });

  it('dso.riskLevel HIGH → LOW', () => {
    const dso = { riskLevel: 'HIGH' as const } as DecisionState;
    expect(resolveHotelEnvironmentConfidence({ researchData: {}, dso })).toBe('LOW');
  });
});
