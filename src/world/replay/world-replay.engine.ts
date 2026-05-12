/**
 * World Replay — 重执行 WorldDiff 序列以重建世界（非快照 restore）
 */

import { processWorldDiff } from '../diff/world-diff.processor';
import type { ProcessWorldDiffOptions } from '../diff/world-diff.processor';
import { WorldConstraintStore } from '../world-constraint.store';
import type { WorldDiff } from '../diff/world-diff.contract';
import type { WorldDiffLogEntry } from './world-diff-log.types';
import { hashWorldConstraintStore } from './world-state-hash';

export type ReplayWorldOptions = ProcessWorldDiffOptions;

export function createInitialWorldStore(): InstanceType<typeof WorldConstraintStore> {
  return new WorldConstraintStore();
}

/**
 * 将一系列日志条目中的 `diff` 依次重算到空初始世界上。
 */
export function replayWorld(
  logs: readonly WorldDiffLogEntry[],
  options?: ReplayWorldOptions,
): InstanceType<typeof WorldConstraintStore> {
  const state = createInitialWorldStore();
  for (const entry of logs) {
    processWorldDiff(entry.diff, state, options);
  }
  return state;
}

/**
 * 应用单条 `WorldDiff`（与 `processWorldDiff` 语义一致，别名便于回放叙事）
 */
export function applyWorldDiff(
  store: WorldConstraintStore,
  diff: WorldDiff,
  options?: ReplayWorldOptions,
): ReturnType<typeof processWorldDiff> {
  return processWorldDiff(diff, store, options);
}

/**
 * 从 `diffIndex` 起重放（含该下标）：用于 rollback / 局部 scenario。
 * `diffIndex === logs.length` → 空回放，得到初始世界。
 */
export function reexecuteFrom(
  diffIndex: number,
  logs: readonly WorldDiffLogEntry[],
  options?: ReplayWorldOptions,
): InstanceType<typeof WorldConstraintStore> {
  const start = Math.max(0, Math.min(diffIndex, logs.length));
  return replayWorld(logs.slice(start), options);
}

export interface RecordDiffMeta {
  readonly id: string;
  readonly timestamp: number;
}

/**
 * 在一次 `processWorldDiff` 之后构造日志条目（含结果哈希）。
 */
export function buildWorldDiffLogEntry(
  store: WorldConstraintStore,
  diff: WorldDiff,
  meta: RecordDiffMeta,
): WorldDiffLogEntry {
  return {
    id: meta.id,
    timestamp: meta.timestamp,
    worldVersion: store.version,
    diff,
    resultingStateHash: hashWorldConstraintStore(store),
  };
}
