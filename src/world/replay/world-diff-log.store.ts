/**
 * WorldDiff 时间线 — append-only 日志底座（可换持久化实现）
 */

import type { WorldDiffLogEntry } from './world-diff-log.types';

export class WorldDiffLogStore {
  private readonly entries: WorldDiffLogEntry[] = [];

  /** 追加一条已由上层写入 SSOT 后构造好的条目 */
  append(entry: WorldDiffLogEntry): void {
    this.entries.push(entry);
  }

  readonly(): readonly WorldDiffLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }

  get length(): number {
    return this.entries.length;
  }
}
