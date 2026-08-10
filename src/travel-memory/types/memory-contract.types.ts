/**
 * Memory Contract — 按任务申请记忆，禁止 buildContext 变成万能上下文。
 *
 * CRE → Task → Memory Need Planner → Memory Contract → buildContext(contract)
 */

import type { MemoryNeed, MemoryNeedType } from './memory-need.types';

export type MemoryContractDeny =
  | 'ALL_USER_HISTORY'
  | 'ALL_EPISODES'
  | 'FULL_SEMANTIC_DUMP'
  | 'PROCEDURAL_SKILLS';

/**
 * 对单次决策生效的记忆装载合同（像 Tool 申请权限）。
 */
export type MemoryContractV1 = {
  schemaId: 'tripnara.memory_contract@v1';
  version: 1;
  task: string;
  /** 允许装载的 need 类型 */
  allow: MemoryNeedType[];
  /** 硬拒绝的大上下文 */
  deny: MemoryContractDeny[];
  /** Episode 上限（默认很小） */
  maxEpisodes: number;
  includeUserProfileFields: Array<
    'pace' | 'riskTolerance' | 'accommodationMovement' | 'preferredExperience' | 'planningStyle'
  >;
  includeTripMemory: boolean;
  includeSemantic: boolean;
  includeWorking: boolean;
  needs: MemoryNeed[];
  reason: string;
};
