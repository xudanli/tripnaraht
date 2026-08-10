// src/agent/runtime/agent-execution-context.interface.ts
import type { ExecutionMemoryBinding } from '../memory/interfaces/execution-memory-binding.interface';
import type { OperationalNegativeConstraintsV1 } from '../compression/world-state-compression.types';
import type { ContextPackage } from '../context-engine/types/context-package.types';

/**
 * 黄金链路执行上下文：与 request 解耦，由 ALS 承载（避免 request.__xxx 失控扩张）。
 * planner / route selector / recovery 应优先从此 store 读取因果锚点。
 */
export interface AgentExecutionContext {
  requestId: string;
  snapshotId: string;
  snapshotVersion: number;
  executionBinding: ExecutionMemoryBinding;
  /**
   * P6：本请求黄金链路根 span（子 span 的默认 parent；与 route_and_run 首条 chain.enter 的 spanId 对齐）。
   * 仅 route_and_run 等显式入口设置；其余路径为 null。
   */
  activeParentSpanId?: string | null;
  /**
   * P7：负向操作约束（Decision Memory ring 压缩）。不入冻结 AgentMemoryContext，可在链路中随 append 刷新。
   */
  operationalNegativeConstraints?: OperationalNegativeConstraintsV1 | null;
  operationalNegativeConstraintsMarkdown?: string | null;
  /**
   * 请求级 Context Package L1（ALS 内生死；跨并发请求隔离）。
   */
  contextPackageL1Cache?: Map<string, { package: ContextPackage; timestamp: number }>;
  /**
   * TMR 选择性 CONSUME hints（prepare 注入；OPTIMIZE/CGUS 可读）。
   * advisoryOnly，不替代旧 Memory OS。
   */
  travelMemoryDecisionHints?: import('../../travel-memory/context-assembly/selective-consume.util').TravelMemoryDecisionHintV1[];
}
