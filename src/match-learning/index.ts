export {
  DEFAULT_SOFT_MATCH_WEIGHTS,
  type SoftMatchWeights,
} from './types/match-learning.types';

export {
  getActiveSoftMatchWeights,
  setActiveSoftMatchWeights,
  resetActiveSoftMatchWeights,
} from './matching-weights.store';

export { parseSoftWeights, iterateSoftWeightsFromSamples } from './engine/soft-weight-iteration.engine';
