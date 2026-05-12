/**
 * 旧 `physical-reality.model` RoadState → SSOT 规范路况。
 * 不参与裁决：Objective / legacy planner 迁移期只做读模型对齐。
 */

import type { CanonicalRoadWorldState } from '../../../world/road-canonical.types';
import type { RoadState } from './physical-reality.model';

export function legacyPhysicalRoadStateToCanonical(
  road: Pick<RoadState, 'status'>,
): CanonicalRoadWorldState {
  switch (road.status) {
    case 'OPEN':
      return 'OPEN';
    case 'CLOSED':
      return 'CLOSED';
    case 'RESTRICTED':
      return 'RESTRICTED';
    case 'SEASONAL':
      return 'CLOSED';
  }
}
