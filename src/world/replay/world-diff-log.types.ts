import type { WorldDiff } from '../diff/world-diff.contract';

/**
 * 单步世界变迁记录 — 存 transition，而非静态 state 快照。
 */
export interface WorldDiffLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly worldVersion: number;
  readonly diff: WorldDiff;
  /** 应用本 diff 后的世界快照哈希（可校验回放一致性） */
  readonly resultingStateHash: string;
}
