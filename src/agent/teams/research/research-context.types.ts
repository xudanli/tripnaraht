/**
 * MAT 3.0+：研究上下文合并语义（隔离 diff 合并与显式 Patch 契约）。
 */
export type ResearchContextPhase = 'pre_parallel' | 'parallel' | 'sequential';

/** Member 正常合并 vs prior 缝合降级（观测 / NARRATOR 归因）；5.0 预算仲裁降级重跑。 */
export type ResearchMergeAttribution = 'MEMBER_PATCH' | 'FALLBACK_SUTURE' | 'BUDGET_ARBITRATOR_ROLLBACK';

/** 一次 Member 合并产生的可观测摘要（供 Leader / 日志消费）。 */
export type ResearchContextMergeManifest = {
  source: string;
  phase: ResearchContextPhase;
  /** 相对合并前基线发生变化的顶层 research_data 键 */
  keysTouched: readonly string[];
  /** 本轮追加的 evidence id 数量 */
  evidenceRefsAppended: number;
  /** 归因：正常 Patch 或 prior 缝合 */
  attribution?: ResearchMergeAttribution;
};

export type ResearchContextSnapshot = Readonly<{
  researchData: Readonly<Record<string, unknown>>;
  evidenceRefs: readonly string[];
}>;
