/**
 * P4-B Corridor segmentation — hazards are local along the polyline, not city-level.
 */

import type { ExecutionState } from '../../decision/hazard/travel-hazard.types';

export interface RouteExecutionSegmentExposure {
  crosswind: number;
  icing: number;
  visibility: number;
}

export interface RouteExecutionSegment {
  segmentId: string;
  exposure: RouteExecutionSegmentExposure;
  executionState: ExecutionState;
  /** Speed multiplier vs nominal free-flow (e.g. 1.15 = 15% slower). */
  estimatedSpeedPenalty: number;
  /** Optional bind back to geometry indices after corridor split. */
  startIndex?: number;
  endIndex?: number;
}
