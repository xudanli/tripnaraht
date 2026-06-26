import { assignBucket, toLedgerCategory } from '../utils/bucket-assignment.util';
import { convertToCny } from '../utils/exchange-rate.util';
import { mapMoneyDnaToCoolingOffMultiplier } from '../utils/money-dna-threshold.util';
import type { MoneyDnaCard } from '../../decision-profiling/types/decision-profiling.types';

describe('bucket-assignment.util', () => {
  it('maps dining to food bucket', () => {
    expect(assignBucket('dining')).toBe('food');
    expect(toLedgerCategory('dining')).toBe('FOOD');
  });

  it('maps activities to experience', () => {
    expect(assignBucket('activities')).toBe('experience');
    expect(toLedgerCategory('activities')).toBe('ACTIVITIES');
  });
});

describe('exchange-rate.util', () => {
  it('converts ISK to CNY', () => {
    const { amountCny, exchangeRate } = convertToCny(28000, 'ISK');
    expect(exchangeRate).toBe(0.052);
    expect(amountCny).toBe(1456);
  });
});

describe('money-dna-threshold.util', () => {
  const baseCard = (vector: Partial<MoneyDnaCard['vector']>): MoneyDnaCard => ({
    userId: 'u1',
    vector: {
      experienceTendency: 0.5,
      qualityTendency: 0.5,
      timeValueTendency: 0.5,
      socialScarcityTendency: 0.5,
      ...vector,
    },
    consumptionPace: 'balanced',
    confidence: 0.8,
    completedAt: 'x',
  });

  it('raises threshold for experience-heavy profiles', () => {
    expect(mapMoneyDnaToCoolingOffMultiplier(baseCard({ experienceTendency: 0.8 }))).toBe(2.5);
  });

  it('lowers threshold for frugal profiles', () => {
    expect(
      mapMoneyDnaToCoolingOffMultiplier(
        baseCard({ qualityTendency: 0.8, experienceTendency: 0.3 }),
      ),
    ).toBe(1.5);
  });
});
