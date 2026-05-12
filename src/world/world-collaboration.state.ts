/**
 * Co-planning UI / Session — 人机对世界状态的协同编辑轨迹
 */

import type { WorldCommand } from './world-command.types';
import type { WorldConstraintStoreSnapshot } from './world-snapshot';
import type { WorldSuggestion } from './world-suggestion.engine';

export interface CoPlanningState {
  readonly userEdits: readonly WorldCommand[];
  /** 系统基于当前世界提出的后续 diff 预览（可多条） */
  readonly systemSuggestions: readonly WorldSuggestion[];
  readonly pendingReplan: boolean;
  /** 上次与 UI 对齐的快照（可序列化） */
  readonly lastSyncSnapshot: WorldConstraintStoreSnapshot;
}
