import type { HarnessStepName } from '../contracts/harness-step.types';
import type { HarnessValidationResult } from '../contracts/validation.types';
import type { HarnessFailureEvent } from '../failures/failure-event.types';
import type { HarnessGraderResult } from '../inferential/harness-inferential-grader.interface';

/** 单步 harness 聚合状态（与 `HarnessStepRunner` 返回值一致） */
export type HarnessStepRunStatus =
  | 'PASSED'
  | 'FAILED'
  | 'REPAIRED'
  | 'BLOCKED';

export interface HarnessDecisionJustification {
  summary: string;
  citesEvidenceRefs?: string[];
  relatedToolCallIds?: string[];
  createdAt: string;
}

export interface HarnessTraceToolCallSummary {
  tool: string;
  inputSummary: unknown;
  outputSummary: unknown;
  durationMs: number;
}

export interface HarnessTraceStep {
  step: HarnessStepName;
  startedAt: string;
  endedAt?: string;
  /** 本步 harness（确定性 + inferential）总耗时，毫秒 */
  durationMs?: number;
  /** 本步 harness 聚合状态 */
  runStatus?: HarnessStepRunStatus;
  visibleStateSnapshot: unknown;
  decisionJustification?: HarnessDecisionJustification;
  toolCalls: HarnessTraceToolCallSummary[];
  validationResults: HarnessValidationResult[];
  graderResults?: HarnessGraderResult[];
  failureEvents?: HarnessFailureEvent[];
  outputPatch?: unknown;
}

export type HarnessTraceFinalStatus =
  | 'DONE'
  | 'FAILED'
  | 'BLOCKED'
  | 'NEED_USER_CONFIRM';

/** 与 Evaluation Harness（replay 报告 `runFingerprint.runId`）对齐的 trace 级元数据 */
export interface HarnessTraceCorrelationMeta {
  evaluationRunId?: string;
}

export interface HarnessTrace {
  traceId: string;
  requestId: string;
  startedAt: string;
  endedAt?: string;
  finalStatus: HarnessTraceFinalStatus;
  steps: HarnessTraceStep[];
  meta?: HarnessTraceCorrelationMeta;
}
