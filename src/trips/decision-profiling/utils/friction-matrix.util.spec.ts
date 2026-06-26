import { computeFrictionMatrix, buildHighRiskAlerts } from './friction-matrix.util';
import type { MoneyDnaCard, TravelStyleCard } from '../types/decision-profiling.types';

function profile(
  id: string,
  styleType: TravelStyleCard['styleType'],
  money: Partial<MoneyDnaCard>,
): {
  userId: string;
  displayName: string;
  style: TravelStyleCard;
  money: MoneyDnaCard;
} {
  const baseMoney: MoneyDnaCard = {
    userId: id,
    vector: {
      experienceTendency: 0.5,
      qualityTendency: 0.5,
      timeValueTendency: 0.5,
      socialScarcityTendency: 0.5,
    },
    consumptionPace: 'balanced',
    confidence: 0.7,
    completedAt: new Date().toISOString(),
    ...money,
  };
  return {
    userId: id,
    displayName: id,
    style: {
      userId: id,
      styleType,
      styleLabel: styleType,
      coreDrivers: [],
      teamRole: '',
      compatibilityHints: [],
      confidence: 0.7,
      completedAt: new Date().toISOString(),
      source: 'quiz',
    },
    money: baseMoney,
  };
}

describe('friction-matrix.util', () => {
  it('flags red friction between planner and spontaneous on pace', () => {
    const matrix = computeFrictionMatrix([
      profile('a', 'PRAGMATIC_PLANNER', {
        vector: { experienceTendency: 0.2, qualityTendency: 0.8, timeValueTendency: 0.6, socialScarcityTendency: 0.2 },
        budgetRangeMax: 5000,
      }),
      profile('b', 'SPONTANEOUS_ADVENTURER', {
        vector: { experienceTendency: 0.9, qualityTendency: 0.2, timeValueTendency: 0.2, socialScarcityTendency: 0.7 },
        budgetRangeMax: 1500,
        consumptionPace: 'spontaneous',
      }),
    ]);

    expect(matrix).toHaveLength(1);
    const alerts = buildHighRiskAlerts(matrix);
    expect(alerts.length).toBeGreaterThan(0);
    expect(matrix[0].cells.some((c) => c.level === 'red')).toBe(true);
  });
});
