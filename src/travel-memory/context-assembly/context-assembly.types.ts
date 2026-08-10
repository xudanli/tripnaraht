/**
 * Context Assembly Layer — World / Decision Contract / Memory 同级 Provider。
 *
 * 禁止：CRE → Memory Runtime（把 Memory 当成特殊能力）。
 * 禁止：Self-drive Config → Travel Memory（自驾是 World，不是 Memory）。
 * 禁止：Decision Contract 与 Memory 融合成一个东西。
 *
 * 正确：Task Intent → Context Requirement Contract → Context Assembly → Decision Context
 *
 * @see TMR_READINESS.md
 */

export type ContextProviderKind =
  | 'WORLD'
  /** 道路/车辆/季节/F-road 等：Operational World，≠ Memory */
  | 'SELF_DRIVE_WORLD'
  | 'BOOKING'
  | 'TEAM'
  /** 当前应遵守的约束（Decision Contract），≠ 过去经验 */
  | 'DECISION_CONTRACT'
  | 'MEMORY'
  | 'EXTERNAL';

export type ContextAssemblySliceV1 = {
  provider: ContextProviderKind;
  /** 该 Provider 是否按合同装载 */
  included: boolean;
  keys: string[];
  notes?: string;
};

/**
 * Context Contract（Assembly 层，大于 Memory Contract）。
 * Memory Contract 是其中 Memory Resolver 的子合同。
 */
export type ContextAssemblyContractV1 = {
  schemaId: 'tripnara.context_assembly_contract@v1';
  version: 1;
  task: string;
  tripId?: string | null;
  providers: ContextProviderKind[];
  /** Memory 子合同引用（由 Memory Need Planner 生成） */
  memoryContractTask?: string | null;
  deny: Array<
    | 'FULL_HISTORY_DUMP'
    | 'ALL_EPISODES'
    | 'MEMORY_AS_SOLE_BASIS'
    | 'SELF_DRIVE_AS_MEMORY'
    | 'CONTRACT_AS_MEMORY'
  >;
};

export type AssembledDecisionContextV1 = {
  schemaId: 'tripnara.assembled_decision_context@v1';
  version: 1;
  task: string;
  assembledAt: string;
  slices: ContextAssemblySliceV1[];
  /** Memory 切片是否 decision-safe（无 CANDIDATE） */
  memoryDecisionSafe?: boolean;
};

/**
 * 边界冻结：Contract / Self-drive / Memory 职责分离。
 */
export const CONTEXT_ASSEMBLY_BOUNDARY = {
  decisionContract: 'CURRENT_CONSTRAINTS_TO_OBEY',
  selfDriveWorld: 'OPERATIONAL_WORLD_NOT_MEMORY',
  travelMemory: 'PAST_EVIDENCE_NOT_CURRENT_BAN',
  wrongPatternZh: '过去不喜欢夜驾 → 当前禁止夜驾',
  rightPatternZh:
    '过去夜驾体验差 → 作为建议依据 → 当前 Contract 决定是否约束',
} as const;
