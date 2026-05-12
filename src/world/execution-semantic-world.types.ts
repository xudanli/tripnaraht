/**
 * Execution Semantic View — 世界 SSOT 挂载形状
 */

import type { WorldConstraintDiff } from './world-diff.engine';
import type { WorldConstraintStoreSnapshot } from './world-snapshot';

export interface ExecutionSemanticWorldOverlay {
  readonly version: number;
  readonly lastUpdatedAt: number;
  readonly lastDiff?: WorldConstraintDiff;
  readonly constraints: WorldConstraintStoreSnapshot;
}
