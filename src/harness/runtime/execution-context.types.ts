import type { HarnessStepName } from '../contracts/harness-step.types';

/** 证据引用（最小结构，可随 DSO 演进） */
export interface HarnessEvidenceRef {
  id: string;
  kind?: string;
  snapshotId?: string;
}

export interface HarnessExecutionContextMetadata {
  startedAt: string;
  actor: string;
  model?: string;
  /** 文档 7.4.1：执行步所用模型标识（审计 / 配置对齐，可选） */
  executorModel?: string;
  /** 文档 7.4.1：推理型 grader 所用模型标识（可与 executor 分离） */
  graderModel?: string;
  /** P0：外部工具调用 / 写路径幂等键 */
  idempotencyKey?: string;
  /** 重试序号，供审计（可选） */
  attempt?: number;
}

/**
 * 单步执行上下文：Scoped View，不暴露完整 DSO
 */
export interface HarnessExecutionContext<TVisibleState = unknown> {
  traceId: string;
  requestId: string;
  step: HarnessStepName;
  visibleState: TVisibleState;
  visibleEvidence: HarnessEvidenceRef[];
  allowedTools: string[];
  writableStatePaths: string[];
  metadata: HarnessExecutionContextMetadata;
}
