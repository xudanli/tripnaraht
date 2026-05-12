// src/agent/execution/execution-runtime-surface.types.ts
/**
 * Execution Layer：当前轮运行态（短生命周期；与 runtime/ 下具体实现互补的类型锚点）。
 */
export interface ExecutionRuntimeSurfaceV1 {
  activeTools: string[];
  currentIntent: string;
  currentReasoningContext: string;
}
