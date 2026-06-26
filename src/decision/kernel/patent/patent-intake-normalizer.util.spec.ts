import type { UserIntent } from '../decision-state.types';
import {
  applyPatentIntakeNormalizer,
  buildPatentIntakeConstraintSeeds,
  deriveDailyWalkLimitKm,
  deriveMaxDriveHoursPerDay,
  extractUserAgeFromText,
} from './patent-intake-normalizer.util';

describe('patent-intake-normalizer', () => {
  it('extracts age from Chinese text', () => {
    expect(extractUserAgeFromText('我今年 65 岁，预算 2 万元')).toBe(65);
  });

  it('derives walk and drive limits for seniors', () => {
    expect(deriveDailyWalkLimitKm(65)).toBe(5);
    expect(deriveMaxDriveHoursPerDay(65)).toBe(6);
  });

  it('builds constraint seeds with budget and age', () => {
    const seeds = buildPatentIntakeConstraintSeeds(
      { budget: 20000 } as UserIntent,
      { message: '我今年65岁' },
    );
    expect(seeds.userAge).toBe(65);
    expect(seeds.daily_walk?.max_per_day).toBe(5);
    expect(seeds.budget?.max).toBe(20000);
  });

  it('applyPatentIntakeNormalizer writes seeds when flag enabled', () => {
    const prev = process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER;
    process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER = '1';
    try {
      const out = applyPatentIntakeNormalizer({ budget: 20000 }, { message: '65岁' });
      expect((out.constraints as any)?.daily_walk?.max_per_day).toBe(5);
    } finally {
      if (prev === undefined) delete process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER;
      else process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER = prev;
    }
  });
});
