/**
 * Assembled Decision Context — Context Assembly 产出（Shadow / 未来主路径）。
 * Memory 与 Contract / Self-drive 分槽，禁止融合。
 */

import type { MemoryContextPackage } from '../types/memory-context-package.types';
import type {
  AssembledDecisionContextV1,
  ContextAssemblyContractV1,
  ContextAssemblySliceV1,
} from './context-assembly.types';

/** 当前应遵守的约束（≠ Memory） */
export type DecisionContractSliceV1 = {
  schemaId: 'tripnara.decision_contract_slice@v1';
  tripGoal?: string | null;
  constraints: string[];
  riskGates: string[];
  source: 'REQUEST_HINTS' | 'TRIP_STATE' | 'EMPTY';
};

/** 自驾 World 切片（≠ Memory）；Phase 2 可为轻量 keys，完整引擎另挂 */
export type SelfDriveWorldSliceV1 = {
  schemaId: 'tripnara.self_drive_world_slice@v1';
  countryCode?: string | null;
  travelMode?: string | null;
  keys: string[];
  notes?: string;
  /** 完整 SelfDriveContext 由 Kernel 注入时再填；默认 null */
  hasFullContext: boolean;
};

export type AssembledTravelContextV1 = AssembledDecisionContextV1 & {
  contract: ContextAssemblyContractV1;
  /** 过去证据 — 仅 ACTIVE / decision-safe */
  memory: MemoryContextPackage | null;
  /** 当前约束 */
  decisionContract: DecisionContractSliceV1 | null;
  /** 道路/车辆/季节等运营世界 */
  selfDriveWorld: SelfDriveWorldSliceV1 | null;
  booking: { included: boolean; keys: string[] } | null;
  team: { included: boolean; keys: string[] } | null;
  /**
   * Shadow：同任务无 Memory 的切片摘要（只记「未装载」，不跑第二套决策）。
   * 用于后续 Decision Pair。
   */
  shadowBaseline: {
    memoryOmitted: true;
    providersWithoutMemory: ContextAssemblySliceV1[];
  };
  mode: 'SHADOW' | 'CONSUME';
};
