/**
 * Deterministic perturbation matrix for N-sample robustness rollout.
 */

import type { ExecutionVariant } from './execution-simulation.types';
import type { RobustnessPerturbationKind, RobustnessSimulationConfig } from './robustness-rollout.types';

/** Seeded scalar in [0, 1) — reproducible across runs. */
function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function perturbationProfile(
  kind: RobustnessPerturbationKind,
  intensity: number,
): Partial<ExecutionVariant['perturbation']> {
  const t = Math.max(0, Math.min(1, intensity));
  switch (kind) {
    case 'WEATHER':
      return { weatherShift: 0.05 + t * 0.35, repairStrategy: 'conservative' };
    case 'TRANSPORT':
      return { delayBias: 0.08 + t * 0.4, roadNoise: 0.03 + t * 0.15 };
    case 'FATIGUE':
      return { delayBias: 0.05 + t * 0.25, repairStrategy: 'minimal' };
    case 'SOCIAL':
      return { delayBias: 0.02 + t * 0.12 };
    default:
      return {};
  }
}

export function buildRobustnessVariants(
  config: RobustnessSimulationConfig,
): ExecutionVariant[] {
  const n = Math.max(1, Math.min(config.sampleCount, 500));
  const kinds = config.enabledPerturbations.length
    ? config.enabledPerturbations
    : (['WEATHER', 'TRANSPORT'] as RobustnessPerturbationKind[]);

  const variants: ExecutionVariant[] = [];

  for (let i = 0; i < n; i++) {
    const seed = i + 1;
    const kind = kinds[i % kinds.length];
    const intensity = seededUnit(seed);
    const secondaryKind = kinds[(i + 1) % kinds.length];
    const secondaryIntensity = seededUnit(seed * 7);

    const primary = perturbationProfile(kind, intensity);
    const secondary =
      i % 3 === 0 ? perturbationProfile(secondaryKind, secondaryIntensity * 0.6) : {};

    variants.push({
      id: `robustness-${String(i).padStart(4, '0')}`,
      perturbation: {
        ...primary,
        weatherShift: (primary.weatherShift ?? 0) + (secondary.weatherShift ?? 0),
        delayBias: (primary.delayBias ?? 0) + (secondary.delayBias ?? 0),
        roadNoise: (primary.roadNoise ?? 0) + (secondary.roadNoise ?? 0),
      },
    });
  }

  return variants;
}

export function perturbationTagsForVariant(
  variant: ExecutionVariant,
  enabled: RobustnessPerturbationKind[],
): string[] {
  const p = variant.perturbation;
  const tags: string[] = [];
  if ((p.weatherShift ?? 0) > 0.01 && enabled.includes('WEATHER')) tags.push('WEATHER');
  if ((p.delayBias ?? 0) > 0.01 && (enabled.includes('TRANSPORT') || enabled.includes('FATIGUE'))) {
    tags.push((p.repairStrategy === 'minimal' ? 'FATIGUE' : 'TRANSPORT') as string);
  }
  if ((p.roadNoise ?? 0) > 0.01 && enabled.includes('TRANSPORT')) tags.push('TRANSPORT');
  if (enabled.includes('SOCIAL') && tags.length === 0) tags.push('SOCIAL');
  return tags.length ? tags : ['BASELINE'];
}
