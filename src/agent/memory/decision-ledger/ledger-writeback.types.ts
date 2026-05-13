import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import type { MemoryLedgerPhaseV1 } from './world-topic-slice.types';

/**
 * 承接 IncrementalKernel / LLM 产出的单节点写回碎片（v1）。
 * `output` 仅参与 stableDigest；业务结构由调用方约定。
 */
export interface IncrementalKernelDecisionV1 {
  nodeId: string;
  output: unknown;
  /** 可选：覆盖展示用摘要 */
  summary?: string;
}

export interface LedgerWritebackContextV1 {
  memoryPhase: MemoryLedgerPhaseV1;
  nowMs: number;
}

export interface LedgerWritebackResultV1 {
  ledger: DecisionLedgerSnapshot;
  /** 写回前为 STABLE、写回后因依赖级联或二次锚漂移变为 INVALIDATED 的节点 */
  secondaryInvalidated: string[];
  /** 无校验错误且无次生 INVALIDATED */
  isStable: boolean;
  errors?: string[];
}
