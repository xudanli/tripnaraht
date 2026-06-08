import type { SoftMatchWeights } from './types/match-learning.types';
import { DEFAULT_SOFT_MATCH_WEIGHTS } from './types/match-learning.types';

let activeWeights: SoftMatchWeights = { ...DEFAULT_SOFT_MATCH_WEIGHTS };

export function getActiveSoftMatchWeights(): SoftMatchWeights {
  return { ...activeWeights };
}

export function setActiveSoftMatchWeights(weights: SoftMatchWeights): SoftMatchWeights {
  activeWeights = { ...weights };
  return activeWeights;
}

export function resetActiveSoftMatchWeights(): SoftMatchWeights {
  activeWeights = { ...DEFAULT_SOFT_MATCH_WEIGHTS };
  return activeWeights;
}
