/**
 * P28 — Temporal–spatial joint kernel: unified spacetime anchors for execution synthesis.
 */

export type { SpatioTemporalAnchor, SpatialAnchorFacet } from './joint-anchor.types';

export type { SpacetimeProjectionInput } from './spacetime-projection-input.types';

export {
  projectSpacetime,
  resolveAnchorKernel,
  resolveTemporalWindows,
  type TemporalWindowResolver,
} from './spacetime-projection';

export {
  executionInAnchorField,
  findAnchorForExecution,
  timeWindowContains,
  type ExecutionPoint,
} from './spacetime-window';

export {
  evaluateSpacetimeOverlay,
  type SpacetimeOverlayFeasibility,
} from './overlay-feasibility';
