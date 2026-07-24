/**
 * @deprecated Use buildMinimalEvaluateWorld — Iceland-specific alias retained for harness imports.
 */

import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';

export function buildMinimalIcelandWorld(input: {
  roadId: string;
  roadStatus: RoadStatusAssertionPayload['status'];
  month?: number;
}): ReturnType<typeof buildMinimalEvaluateWorld> {
  return buildMinimalEvaluateWorld({
    countryCode: 'IS',
    roadId: input.roadId,
    roadStatus: input.roadStatus,
    month: input.month,
  });
}
