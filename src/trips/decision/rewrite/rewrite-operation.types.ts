/**
 * Topology rewrite 原子操作 — Neptune 执行层枚举（Simulation / Commit 共用）。
 */

export type RewriteOperation =
  | 'MOVE_OVERNIGHT'
  | 'SHIFT_NEXT_DAY_START'
  | 'REANCHOR_ROUTE'
  | 'SHIFT_TIMELINE'
  | 'COMPRESS_DAY'
  | 'SWAP_REGION'
  | 'REMOVE_OPTIONAL_SLOT';
