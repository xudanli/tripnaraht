import type { MoneyDnaCard } from '../types/decision-profiling.types';

const PACE_LABELS: Record<MoneyDnaCard['consumptionPace'], string> = {
  planned: '消费节奏偏计划',
  spontaneous: '消费节奏偏即兴',
  balanced: '消费节奏均衡',
};

export function buildMoneyDnaSummary(card: Pick<MoneyDnaCard, 'vector' | 'consumptionPace'>): string {
  const { vector, consumptionPace } = card;
  const experience =
    vector.experienceTendency >= 0.6
      ? '体验倾向偏高'
      : vector.experienceTendency <= 0.4
        ? '体验倾向偏低'
        : '体验倾向均衡';

  return `${experience} · ${PACE_LABELS[consumptionPace]}`;
}

export function formatTripLabel(input: {
  name?: string | null;
  destination: string;
  startDate: Date;
}): string {
  const title = input.name?.trim() || input.destination;
  const month = input.startDate.getMonth() + 1;
  return `${title} · ${month}月`;
}

export function isProfileStale(lastCompletedAt: Date, staleMonths = 24): boolean {
  const cutoff = new Date(lastCompletedAt);
  cutoff.setMonth(cutoff.getMonth() + staleMonths);
  return new Date() > cutoff;
}
