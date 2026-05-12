// src/agent/contracts/execution-model-stability.ts
/**
 * 执行模型稳定性谓词（v1）：组合 schema 准入与可选 pinned canonical / replay 后 trace 对齐。
 * @see semantic-validation-contract.md §26
 */
import { canonicalExecutionTraceStableJson, ExecutionNormalizationKernel, isOrchestrationExecutionTraceV1Schema } from './execution-normalization-kernel';
import type { OrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { SemanticFixedPointKernel } from './semantic-fixed-point-kernel';

/** `admit_schema`：仅合法 §16 schema；`pinned_canonical`：且与钉住的 canonical stable JSON 一致 */
export type ExecutionStabilityTierV1 = 'admit_schema' | 'pinned_canonical';

export type ExecutionModelStabilityInputV1 = {
  trace: OrchestrationExecutionTraceV1;
  tier: ExecutionStabilityTierV1;
  /** `tier === 'pinned_canonical'` 时必填非空 */
  expectedCanonicalStableJson?: string | null;
};

export const ExecutionModelStability = {
  /**
   * 弱 / 中强稳定性：不含「全链 replay 输出 trace」——那须调用方采集 `traceAfterReplay` 后走 `isReplaySemanticallyFaithfulV1`。
   */
  isStableV1(input: ExecutionModelStabilityInputV1): boolean {
    if (!isOrchestrationExecutionTraceV1Schema(input.trace)) return false;
    if (input.tier === 'admit_schema') return true;
    const exp = input.expectedCanonicalStableJson;
    if (exp == null || exp === '') return false;
    const got = canonicalExecutionTraceStableJson(ExecutionNormalizationKernel.normalizeExecutionTrace(input.trace));
    return got === exp;
  },

  /** 语义级：replay 产出 trace 与原始是否同等价类（忽略 `runtime_hint`）。 */
  isReplaySemanticallyFaithfulV1(original: OrchestrationExecutionTraceV1, traceAfterReplay: OrchestrationExecutionTraceV1): boolean {
    return SemanticFixedPointKernel.isFixedPointTraces(original, traceAfterReplay);
  },
};
