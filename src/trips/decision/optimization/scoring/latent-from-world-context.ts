/**
 * Rule-based LatentContractSnapshot builder (v1).
 * Field semantics and DSO alignment: docs/decision/LATENT_CONTRACT_FIELD_DICTIONARY.md
 */
import type { WorldModelContext } from '../../shared/world-model.types';
import type { LatentContractSnapshot } from './candidate-scorer.interface';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function riskToleranceTo01(h: WorldModelContext['human']): number | undefined {
  if (!h?.riskTolerance) return undefined;
  const m: Record<string, number> = { LOW: 0.25, MEDIUM: 0.55, HIGH: 0.85 };
  return m[String(h.riskTolerance).toUpperCase()] ?? 0.55;
}

/**
 * Best-effort partial latent snapshot for CandidateScorer inputs (rule-based, not learned).
 */
export function latentSnapshotFromWorldContext(world: WorldModelContext): LatentContractSnapshot {
  const human = world.human;
  const physical = world.physical;
  const tw = physical?.climateSeasonality?.typicalWeather;

  let weather_stress_01 = 0;
  if (tw) {
    const wind = tw.windSpeedMps ?? 0;
    const precip = tw.precipitationMmPerHour ?? 0;
    weather_stress_01 = clamp01(wind / 25 * 0.55 + precip / 20 * 0.45);
  }

  const fitness = human?.fitnessScore;
  const experience_level =
    fitness !== undefined && fitness !== null ? clamp01(fitness / 100) : undefined;

  return {
    contractVersion: 'latent-snapshot@v1',
    z_user: {
      risk_tolerance: riskToleranceTo01(human),
      fatigue_limit: experience_level !== undefined ? clamp01(1 - experience_level * 0.3) : undefined,
      experience_level,
    },
    z_env: {
      weather_stress_01: tw ? weather_stress_01 : undefined,
      terrain_risk_01: undefined,
      accessibility_01: physical?.climateSeasonality?.accessibilityScore,
    },
  };
}
