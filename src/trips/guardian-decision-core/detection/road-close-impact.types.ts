/**
 * PR-B — road close impact analysis types.
 */

import type { EntityRef } from '../contracts/entity-ref.types';
import type { RouteSegment } from '../../decision/shared/world-model.types';

export interface RoadSegmentBindings {
  /** itineraryItemId → road ids (e.g. F208) */
  byItemId?: Record<string, string[]>;
  /** segmentId → road ids */
  bySegmentId?: Record<string, string[]>;
}

/** @deprecated Use RoadSegmentBindings */
export type IcelandRoadSegmentBindings = RoadSegmentBindings;

export interface RoadCloseImpactInput {
  tripId: string;
  roadId: string;
  /** Primary segment from WorldStateAssertion.subjectRef when known */
  primarySegmentId?: string;
  bindings?: RoadSegmentBindings;
}

export interface RoadCloseImpactResult {
  roadId: string;
  matchedSegmentIds: string[];
  affectedPlanItemIds: string[];
  affectedEntityRefs: EntityRef[];
  downstreamItemIds: string[];
  matchedSegments: RouteSegment[];
}
