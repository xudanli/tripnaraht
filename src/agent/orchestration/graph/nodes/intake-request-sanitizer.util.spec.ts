import {
  INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION,
  consumeIntakeFitnessMaterial,
  peekIntakeFitnessMaterial,
  readFitnessProfileLinesForLightweightQa,
  readIcelandMarketPriorForLightweightQa,
  applyIntakeFitnessMaterialToTripPlanMessage,
} from './intake-request-sanitizer.util';
import {
  PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY,
  REQUEST_FITNESS_PROFILE_LINES_KEY,
} from '../../../memory/utils/fitness-travel-preference-prompt.util';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';

describe('intake-request-sanitizer', () => {
  it('strips legacy __* keys and options snapshot on consume', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'plan',
      options: {
        [INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION]: {
          request_fitness_overall_score: 72,
          request_fitness_level_enum: 'MEDIUM',
          request_fitness_recommended_daily_ascent_m: 800,
          request_fitness_recommended_daily_distance_km: 12,
        },
      },
    } as RouteAndRunRequestDto;
    (request as unknown as Record<string, unknown>)[REQUEST_FITNESS_PROFILE_LINES_KEY] = ['legacy line'];
    (request as unknown as Record<string, unknown>)[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY] = 'legacy phys';

    const material = consumeIntakeFitnessMaterial(request);
    expect(material.fitnessLinesZh).toEqual(['legacy line']);
    expect(material.physicalCapabilityHintEn).toBe('legacy phys');
    expect((request as unknown as Record<string, unknown>)[REQUEST_FITNESS_PROFILE_LINES_KEY]).toBeUndefined();
    expect((request as unknown as Record<string, unknown>)[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY]).toBeUndefined();
    expect(request.options?.[INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION as keyof typeof request.options]).toBeUndefined();
  });

  it('builds fitness lines from snapshot when legacy keys absent', () => {
    const request = {
      request_id: 'r2',
      user_id: 'u1',
      message: 'plan',
      options: {
        intake_travel_preference_snapshot: {
          request_fitness_overall_score: 80,
          request_fitness_level_enum: 'HIGH',
          request_fitness_recommended_daily_ascent_m: 1000,
          request_fitness_recommended_daily_distance_km: 15,
        },
      },
    } as RouteAndRunRequestDto;

    const peek = peekIntakeFitnessMaterial(request);
    expect(peek.fitnessLinesZh.some((l) => l.includes('体能画像'))).toBe(true);
    expect(peek.physicalCapabilityHintEn).toContain('PHYSICAL_CAPABILITY_CONSTRAINT');

    const lines = readFitnessProfileLinesForLightweightQa(request);
    expect(lines?.length).toBeGreaterThan(0);
  });

  it('injects iceland market prior into trip plan message from snapshot', () => {
    const request = {
      request_id: 'r3',
      user_id: 'u1',
      message: '冰岛7月',
      options: {
        intake_travel_preference_snapshot: {
          iceland_market_segment: {
            segmentId: 'IS_MARKET_US',
            confidence: 0.82,
            promptBlockZh: '[IS_MARKET_PRIOR | segment=IS_MARKET_US]',
            canonicalRouteId: 'IS-SOUTH-GOLDEN-5-7-LUX',
          },
        },
      },
    } as RouteAndRunRequestDto;

    const material = peekIntakeFitnessMaterial(request);
    expect(material.icelandMarketPriorZh).toContain('IS_MARKET_US');
    const trip = applyIntakeFitnessMaterialToTripPlanMessage(
      { message: '冰岛7月' },
      request,
      material,
    );
    expect(trip.message).toContain('[SYSTEM_MESSAGE][ICELAND_MARKET_PRIOR]');
    expect(readIcelandMarketPriorForLightweightQa(request)).toContain('IS_MARKET_US');
  });
});
