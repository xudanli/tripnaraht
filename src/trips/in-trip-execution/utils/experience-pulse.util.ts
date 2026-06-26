import type { ExperienceTriggerType } from '../types/experience-loop.types';

/** 根据微调查各维度分估算情绪极性 -1..+1 */
export function computeEmotionPolarity(scores: {
  expectationConfirmation?: number;
  emotionalValueScore?: number;
  senseOfControl?: number;
  spendWorthIt?: number;
  teamAtmosphere?: number;
}): number | null {
  const values = [
    scores.expectationConfirmation,
    scores.emotionalValueScore,
    scores.senseOfControl,
    scores.spendWorthIt,
    scores.teamAtmosphere,
  ].filter((v): v is number => v != null && v >= 1 && v <= 5);

  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(((avg - 3) / 2) * 100) / 100;
}

export function buildTriggerKey(
  triggerType: ExperienceTriggerType,
  parts: Record<string, string | number>,
): string {
  const suffix = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(':');
  return `${triggerType}:${suffix}`;
}

export function clampDelta(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value * 100) / 100));
}
