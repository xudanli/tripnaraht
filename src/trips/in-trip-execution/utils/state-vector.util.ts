import type {
  DecisionFatigueLevel,
  EmotionalLevel,
  PhysicalLevel,
  SpendingLevel,
  SocialLevel,
  ThermometerLevel,
} from '../types/group-pulse.types';

export function moodScoreToEmotional(score: number): EmotionalLevel {
  if (score >= 5) return 'joyful';
  if (score >= 4) return 'stable';
  if (score >= 3) return 'low';
  return 'irritable';
}

export function calibratePhysicalFromMood(
  score: number,
  experienceTendency: number,
): PhysicalLevel {
  const threshold = experienceTendency > 0.7 ? 3 : 2;
  if (score >= 5) return 'energetic';
  if (score >= 4) return 'normal';
  if (score >= threshold) return 'fatigued';
  return 'exhausted';
}

export function motionToPhysical(
  steps: number,
  restMinutes: number,
): PhysicalLevel {
  if (restMinutes >= 90) return 'fatigued';
  if (steps >= 12000) return 'fatigued';
  if (steps >= 8000) return 'normal';
  if (steps >= 4000) return 'energetic';
  return 'normal';
}

export function spendingPaceToLevel(ratio: number): SpendingLevel {
  if (ratio < 0.7) return 'surplus';
  if (ratio <= 1.1) return 'normal';
  if (ratio <= 1.3) return 'tight';
  return 'overspent';
}

export function scoreToThermometerLevel(score: number): ThermometerLevel {
  if (score >= 0.75) return 'green';
  if (score >= 0.55) return 'yellow';
  if (score >= 0.35) return 'orange';
  return 'red';
}

export function levelToNumeric(level: string): number {
  const map: Record<string, number> = {
    energetic: 1,
    joyful: 1,
    surplus: 1,
    harmonious: 1,
    fresh: 1,
    normal: 0.7,
    stable: 0.7,
    fatigued: 0.45,
    low: 0.45,
    tight: 0.45,
    subtle: 0.45,
    exhausted: 0.2,
    irritable: 0.2,
    overspent: 0.2,
    tense: 0.2,
    depleted: 0.2,
  };
  return map[level] ?? 0.5;
}

export function aggregateDecisionFatigue(decisionsToday: number): DecisionFatigueLevel {
  if (decisionsToday <= 1) return 'fresh';
  if (decisionsToday <= 3) return 'normal';
  if (decisionsToday <= 5) return 'fatigued';
  return 'depleted';
}
