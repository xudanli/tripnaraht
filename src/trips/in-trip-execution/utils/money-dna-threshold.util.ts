import type { MoneyDnaCard } from '../../decision-profiling/types/decision-profiling.types';

/** 按 Money DNA 调 cooling_off 阈值倍数 */
export function mapMoneyDnaToCoolingOffMultiplier(card: MoneyDnaCard | null): number {
  if (!card) return 2.0;
  const { experienceTendency, qualityTendency } = card.vector;
  if (experienceTendency > 0.7) return 2.5;
  if (qualityTendency > 0.7 && experienceTendency < 0.4) return 1.5;
  return 2.0;
}
