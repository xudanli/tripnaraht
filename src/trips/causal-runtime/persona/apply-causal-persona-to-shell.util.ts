import type { PersonaStatement } from '../../../agent/services/persona-shell.service';
import type { CausalPersonaSlice } from './causal-persona-projection.types';

const ICONS: Record<CausalPersonaSlice['persona'], string> = {
  ABU: '🐻‍❄️',
  DR_DRE: '🐕',
  NEPTUNE: '🦦',
};

const SLOGANS: Record<CausalPersonaSlice['persona'], string> = {
  ABU: '我负责：这条路，在真实世界里真的能走吗？',
  DR_DRE: '人承不承受？我负责把节奏代价说清楚。',
  NEPTUNE: '改变哪个变量，代价最小？我负责找干预。',
};

export function causalSliceToPersonaStatement(slice: CausalPersonaSlice): PersonaStatement {
  return {
    persona: slice.persona,
    icon: ICONS[slice.persona],
    slogan: SLOGANS[slice.persona],
    verdict: slice.verdict,
    explanation: slice.explanation,
    evidence: slice.evidence,
    recommendations: slice.recommendations,
  };
}

export function mergePersonaWithCausalSlice(
  legacy: PersonaStatement | null,
  slice: CausalPersonaSlice | undefined,
): PersonaStatement | null {
  if (!slice) return legacy;
  const kernel = causalSliceToPersonaStatement(slice);
  if (!legacy) return kernel;
  return {
    ...kernel,
    recommendations: kernel.recommendations ?? legacy.recommendations,
    confirmations: legacy.confirmations,
  };
}
