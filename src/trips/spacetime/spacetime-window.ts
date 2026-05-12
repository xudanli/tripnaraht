import type { SpatioTemporalAnchor } from './joint-anchor.types';

/** Inclusive membership test — replaces ad-hoc “slot vs dusk” checks at the kernel boundary. */
export function timeWindowContains(window: { start: number; end: number }, executionTimeMs: number): boolean {
  return executionTimeMs >= window.start && executionTimeMs <= window.end;
}

export interface ExecutionPoint {
  anchorId: string;
  executionTimeMs: number;
}

/**
 * Single feasibility predicate — execution lies in the stable spatiotemporal region for that anchor.
 */
export function executionInAnchorField(anchor: SpatioTemporalAnchor, point: ExecutionPoint): boolean {
  return anchor.anchorId === point.anchorId && timeWindowContains(anchor.timeWindow, point.executionTimeMs);
}

export function findAnchorForExecution(
  anchors: SpatioTemporalAnchor[],
  point: ExecutionPoint,
): SpatioTemporalAnchor | undefined {
  return anchors.find(a => executionInAnchorField(a, point));
}
