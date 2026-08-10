/**
 * Travel Memory Runtime 五层（TMR L0–L5）。
 * 与 Agent Memory OS 的 L0–L4 编号不同；禁止混用裸 `L1`。
 * @see ADR-TRAVEL-MEMORY-RUNTIME
 * @see TMR_READINESS.md — Evidence Ingestion Ready / Decision Consumption Not Ready
 */

/** TMR 层标识 */
export type TmrLayer =
  | 'TMR_L0_WORKING'
  | 'TMR_L1_USER_STRUCTURED'
  | 'TMR_L2_TRIP'
  | 'TMR_L3_EPISODIC'
  | 'TMR_L4_SEMANTIC'
  | 'TMR_L5_PROCEDURAL';

/** 层对 Agent 决策的影响就绪度 */
export type TmrLayerAgentImpact =
  | 'AFFECTS_AGENT'
  | 'DESIGN_ONLY'
  | 'WRITE_ONLY'
  | 'FROZEN';

/**
 * 与现有 Agent Memory OS / State-Learning 的映射（只读说明用）。
 * Runtime 委托这些 SoT，不平行重建。
 */
export const TMR_TO_EXISTING_SOT: Readonly<
  Record<TmrLayer, readonly string[]>
> = {
  TMR_L0_WORKING: ['request ALS', 'TripTaskMemory hot slice'],
  TMR_L1_USER_STRUCTURED: [
    'AgentMemoryUserBasics',
    'UserTravelProfile',
    'MemoryStateV1',
  ],
  TMR_L2_TRIP: [
    'routePartyProfile',
    'trip digests',
    'TripTaskMemory',
  ],
  TMR_L3_EPISODIC: [
    'TravelEpisodicMemoryV1',
    'CgusDecisionTraceV1',
    'DecisionLedgerSnapshot',
  ],
  TMR_L4_SEMANTIC: ['trips/memory SemanticMemory', 'RAG'],
  TMR_L5_PROCEDURAL: ['Skill Registry candidates (P0 frozen write)'],
} as const;

/**
 * 五层实际接入（冻结快照）：写入闭环 > 读取闭环。
 * L3 只写不读 = Evidence Ingestion Ready 的核心证据。
 */
export const TMR_LAYER_READINESS: Readonly<
  Record<
    TmrLayer,
    { statusZh: string; agentImpact: TmrLayerAgentImpact }
  >
> = {
  TMR_L0_WORKING: {
    statusZh: 'request context 已存在',
    agentImpact: 'AFFECTS_AGENT',
  },
  TMR_L1_USER_STRUCTURED: {
    statusZh: '有模型设计，未成 Agent 主来源',
    agentImpact: 'DESIGN_ONLY',
  },
  TMR_L2_TRIP: {
    statusZh: '有 Trip 数据，未进 Context Assembly',
    agentImpact: 'DESIGN_ONLY',
  },
  TMR_L3_EPISODIC: {
    statusZh: 'CGUS → Episode 已接，只写不读',
    agentImpact: 'WRITE_ONLY',
  },
  TMR_L4_SEMANTIC: { statusZh: '冻结', agentImpact: 'FROZEN' },
  TMR_L5_PROCEDURAL: { statusZh: '冻结', agentImpact: 'FROZEN' },
} as const;

/** 总就绪：可摄入证据，不可决策消费 */
export const TMR_RUNTIME_READINESS = {
  evidenceIngestion: 'READY',
  decisionConsumption: 'NOT_READY',
  summaryZh:
    'Evidence Ingestion Ready；Decision Consumption Not Ready。Memory 在学习过去，尚未参与未来。',
} as const;

/** Working Memory（TMR L0）— 不长期保存 */
export type WorkingMemorySnapshot = {
  lifecycle?: string;
  currentDay?: number;
  currentLocation?: string;
  currentTask?: string;
  focusedEntity?: string;
  tripId?: string | null;
  recentTurnCount?: number;
};
