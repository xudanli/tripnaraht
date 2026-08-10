/**
 * Memory Need Planning — 回答「这次决策需要哪类记忆」，不是 Vector Search。
 */

import type { TmrLayer } from './memory-layers.types';
import type { MemoryContractV1 } from './memory-contract.types';

export type MemoryNeedType =
  | 'PACE_PREFERENCE'
  | 'RISK_TOLERANCE'
  | 'ACCOMMODATION_MOVEMENT'
  | 'TRIP_MEMBER_CONSTRAINT'
  | 'ACTIVITY_RISK_PREFERENCE'
  | 'PAST_SIMILAR_DECISION'
  | 'TRIP_INTENT'
  | 'NIGHT_DRIVING_PREFERENCE'
  | 'SEMANTIC_EVIDENCE'
  | 'WORKING_CONTEXT';

export type MemoryNeedRoute =
  | 'STRUCTURED_USER'
  | 'STRUCTURED_TRIP'
  | 'EPISODE'
  | 'SEMANTIC'
  | 'WORKING'
  | 'WORLD_STATE';

export type MemoryNeed = {
  type: MemoryNeedType;
  required: boolean;
  route: MemoryNeedRoute;
  layers: TmrLayer[];
  hint?: string;
};

export type MemoryNeedPlan = {
  task: string;
  tripId?: string | null;
  day?: number | null;
  memoryNeeds: MemoryNeed[];
  /** 按任务申请的装载合同；buildContext 必须遵守 */
  contract: MemoryContractV1;
  /** 衍生自 CRE operation（若有） */
  creOperation?: string | null;
  reason: string;
};
