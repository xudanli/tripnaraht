/**
 * Phase 3：局部传播 / 因果图入口 — v0 恒为「需全量重建」
 *
 * 归约器在实现增量前可调用此函数记录意图；不得用它跳过 fingerprint 治理。
 */

import type { ISODate } from '../world-model';
import type { SemanticDeltaEvent } from './semantic-delta-event.types';

export type SemanticDeltaPropagationScopeV0 =
  | { mode: 'FULL_REBUILD_REQUIRED' }
  | { mode: 'PARTIAL'; affectedDates: readonly ISODate[] };

/** v0：所有 delta 尚未实现局部合并 → 一律要求全量语义重建 */
export function resolveSemanticDeltaPropagationV0(
  _delta: SemanticDeltaEvent,
): SemanticDeltaPropagationScopeV0 {
  return { mode: 'FULL_REBUILD_REQUIRED' };
}
