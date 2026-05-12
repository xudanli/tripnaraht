import type { SpatioTemporalAnchor } from './joint-anchor.types';
import type { ExecutionPoint } from './spacetime-window';
import { executionInAnchorField } from './spacetime-window';

export type SpacetimeOverlayFeasibility = 'feasible' | 'window_mismatch' | 'anchor_unknown';

/**
 * P28-style overlay reduction — one evaluation hook replacing parallel temporal / daylight / drift flags
 * at the kernel boundary (production overlay still composes route/weather; this is the joint gate).
 */
export function evaluateSpacetimeOverlay(
  anchors: SpatioTemporalAnchor[],
  execution: ExecutionPoint,
): { feasibility: SpacetimeOverlayFeasibility; anchor?: SpatioTemporalAnchor } {
  const match = anchors.find(a => a.anchorId === execution.anchorId);
  if (!match) {
    return { feasibility: 'anchor_unknown' };
  }
  if (executionInAnchorField(match, execution)) {
    return { feasibility: 'feasible', anchor: match };
  }
  return { feasibility: 'window_mismatch', anchor: match };
}
