/**
 * 4.0 Experience Replay：决策溯源常量（写入 DecisionLog / Harness metadata）。
 * 凡由历史认知档案触发的 EBP 或参数偏置，应显式标记，便于审计与自进化训练。
 */
export const MEMORY_REPLAY_DECISION_SOURCE = 'MEMORY_REPLAY' as const;

export type MemoryReplayDecisionSource = typeof MEMORY_REPLAY_DECISION_SOURCE;

/** 单次拉取切片条数上限（含 NARRATE 与否定标签行，供时间序回溯） */
export const MEMORY_KERNEL_SLICE_FETCH_LIMIT = 120 as const;

/** 记忆加载预算（Constraint Set 1.0）：超时应回退 3.0 无记忆路径 */
export const MEMORY_KERNEL_LOAD_BUDGET_MS = 200 as const;

/**
 * 设为 `1` 时，`ExperienceReplayModule` 使用 `PrismaMemoryCognitiveSliceProvider`（`rag_decision_logs`）替代 NoOp。
 * 默认关闭，便于单测与无 DB 环境。
 */
export const EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER_ENV = 'EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER' as const;

/**
 * 合规—体验轴：≤ 此值视为「体验 / 探索」偏好（与 EBP 软化、Member gossip 对齐）。
 * 注意：负侧为体验倾向（见 `UserCognitiveProfile` 注释）。
 */
export const COMPLIANCE_EXPERIENCE_AXIS_EXPERIENCE_LEAN_THRESHOLD = -0.25 as const;

/**
 * 写入 `DecisionLogCognitiveSlice.metadata.user_feedback_tags` / `research_audit_tags` 的否定类短码（禁止自由文本）。
 * 若某条 `MEMORY_REPLAY` 的 NARRATE 之后时间序上出现含此类标签的切片，则聚合时对当次立场施加 `MEMORY_REPLAY_REJECTION_FEEDBACK_PENALTY`。
 */
export const COGNITIVE_NEGATIVE_FEEDBACK_TAGS = ['USER_REJECTION', 'USER_NEGATIVE_FEEDBACK'] as const;

/** 用户否定紧随记忆复盘叙事时，对当次 EBP 立场项的惩罚乘子（<0 反向扣分） */
export const MEMORY_REPLAY_REJECTION_FEEDBACK_PENALTY = -2 as const;
