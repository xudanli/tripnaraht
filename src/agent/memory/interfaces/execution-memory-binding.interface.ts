// src/agent/memory/interfaces/execution-memory-binding.interface.ts

/** 全链执行节点应对齐的 memory snapshot 锚点（replay / audit） */
export interface ExecutionMemoryBinding {
  snapshot_id: string;
  snapshot_version: number;
  request_id: string;
}
