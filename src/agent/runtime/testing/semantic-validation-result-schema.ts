// src/agent/runtime/testing/semantic-validation-result-schema.ts
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';

/** Facade 输出显式 ABI（版本化）；变更须 bump 并更新 semantic-validation-contract.md */
export const SEMANTIC_VALIDATION_RESULT_SCHEMA_ID = 'semantic.validation.result@v1' as const;
export const SEMANTIC_VALIDATION_RESULT_VERSION = 1 as const;

/** 语义执行图模型身份：与 validation contract / regression 对齐；图结构演进时 bump */
export const EXECUTION_MODEL_VERSION = 'v1' as const;

/** 与 `semantic-validation-contract.md` Document revision 对齐；变更须 bump 文档与常量 */
export const SEMANTIC_VALIDATION_CONTRACT_REVISION = '2026-05-11x' as const;

/** 归一化输入：仅 `ExecutionTimelineEvent[]`，禁止 request / ALS / 非 timeline 对象 */
export type NormalizedSemanticTimelineEvents = ExecutionTimelineEvent[];
