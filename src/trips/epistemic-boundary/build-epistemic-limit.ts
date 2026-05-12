import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { EpistemicLimit } from './epistemic-limit.types';

export function buildEpistemicLimit(input: {
  executionUncertainty: ExecutionUncertainty;
  confidenceHorizonScalar: number;
}): EpistemicLimit {
  const u = input.executionUncertainty;
  const regions: string[] = ['latent_user_utility'];
  if (u.variance > 0.15) regions.push('future_environment_branch');
  if (u.entropy > 0.35) regions.push('multi_equilibrium_overlay');

  return {
    undecidableRegions: regions,
    unknowableStateDimensions: ['full_spatiotemporal_truth', 'counterfactual_user_history'],
    proofBoundaries: [
      'global_F_contractivity',
      'complete_lyapunov_certificate',
      'total_causal_identification',
    ],
    computationalLimits: ['finite_neptune_retries', 'bounded_ir_depth', 'snapshot_only_witnesses'],
    confidenceHorizon: input.confidenceHorizonScalar,
  };
}
