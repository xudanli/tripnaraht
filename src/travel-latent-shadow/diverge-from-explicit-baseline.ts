/**
 * Compare latent hypotheses to an explicit baseline snippet (research metrics only).
 */

import type {
  ExplicitBaselineSnippet,
  LatentExplicitDivergence,
  LatentShadowHypothesis,
} from './latent-shadow.types';

export function divergeLatentFromExplicitBaseline(input: {
  hypotheses: LatentShadowHypothesis[];
  explicitBaseline?: ExplicitBaselineSnippet;
}): LatentExplicitDivergence {
  if (!input.explicitBaseline) {
    return {
      compared: false,
      hasNovelHint: input.hypotheses.length > 0,
      notes: ['No explicit baseline provided; novelty unevaluated against rules.'],
    };
  }

  const baseline = input.explicitBaseline.summary.toLowerCase();
  const novel: string[] = [];
  for (const h of input.hypotheses) {
    const tokens = h.summary
      .toLowerCase()
      .split(/[^a-z0-9_\u4e00-\u9fff]+/)
      .filter((t) => t.length > 3);
    const overlap = tokens.filter((t) => baseline.includes(t)).length;
    if (overlap < Math.max(1, Math.floor(tokens.length / 3))) {
      novel.push(h.hypothesisId);
    }
  }

  return {
    compared: true,
    hasNovelHint: novel.length > 0,
    notes:
      novel.length > 0
        ? [`Novel hypothesis ids vs explicit baseline: ${novel.join(', ')}`]
        : ['Latent hypotheses largely overlap explicit baseline wording.'],
  };
}
