/**
 * TD-05：E2E 回放 fixture 注册表（单一事实来源，供 Jest / CI matrix 引用）
 */
import type { E2ECase } from '../e2e-case.types';
import {
  icelandHighlandsCase,
  icelandHighlandsDemMissingCase,
  icelandHighlandsPaceAdjustCase,
} from './iceland-highlands.example';

/** 当前纳入 TD 回放门禁的全部真实 fixture（可随 EVAL 评审追加） */
export const TD_REPLAY_FIXTURES: readonly E2ECase[] = [
  icelandHighlandsCase,
  icelandHighlandsDemMissingCase,
  icelandHighlandsPaceAdjustCase,
];

export const TD_REPLAY_FIXTURE_IDS: readonly string[] = TD_REPLAY_FIXTURES.map((c) => c.id);

/**
 * CI matrix：设置 `TD_REPLAY_MATRIX_ID=<fixture id>` 时仅跑该条，便于并行分片。
 */
export function getTdReplayFixturesForRun(): E2ECase[] {
  const id = process.env.TD_REPLAY_MATRIX_ID?.trim();
  if (!id) return [...TD_REPLAY_FIXTURES];
  const found = TD_REPLAY_FIXTURES.filter((c) => c.id === id);
  if (found.length === 0) {
    throw new Error(
      `TD_REPLAY_MATRIX_ID=${id} not in TD_REPLAY_FIXTURES (${TD_REPLAY_FIXTURE_IDS.join(', ')})`,
    );
  }
  return [...found];
}
