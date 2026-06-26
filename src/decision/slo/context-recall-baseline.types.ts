import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';

/** 修订 KPI：T+6 上下文召回目标 */
export const CONTEXT_RECALL_TARGET_PCT_T6 = 90;

export type ContextRecallBaselineCase = {
  id: string;
  title: string;
  /** 模拟已组装的 AgentMemoryContext（fixture / replay snapshot） */
  context: Partial<AgentMemoryContext>;
  /** dot-path，值须「存在且非空」 */
  mustPresent: string[];
  /** dot-path，值须缺失或为空（隐私/负向约束） */
  mustAbsent?: string[];
};

export type ContextRecallCaseResult = {
  id: string;
  title: string;
  passed: boolean;
  recallPct: number;
  hits: string[];
  misses: string[];
  forbiddenPresent: string[];
};

export type ContextRecallBaselineReport = {
  generatedAt: string;
  totalCases: number;
  passedCases: number;
  recallPct: number;
  targetPctT6: number;
  deltaVsTargetPct: number;
  results: ContextRecallCaseResult[];
};
