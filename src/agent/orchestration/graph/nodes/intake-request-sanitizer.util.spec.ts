import {
  INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION,
  consumeIntakeFitnessMaterial,
  peekIntakeFitnessMaterial,
  readFitnessProfileLinesForLightweightQa,
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
});
