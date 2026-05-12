/**
 * WorldDiff Engine — 统一解释合约：apply → constraint diff → 传播槽位
 */

import type { TripPlan } from '../../trips/decision/plan-model';
import { computeWorldDiff } from '../world-diff.engine';
import type { WorldConstraintDiff } from '../world-diff.engine';
import type { WorldConstraintStore } from '../world-constraint.store';
import type { WorldDiff } from './world-diff.contract';
import { computePropagation } from './world-diff-propagation';
import { worldDiffToConstraintField } from './world-diff-materialize';

export interface ProcessWorldDiffOptions {
  readonly tripPlan?: TripPlan;
}

export interface ProcessWorldDiffResult {
  readonly store: WorldConstraintStore;
  readonly constraintDiff: WorldConstraintDiff;
  readonly propagatedSlotIds: readonly string[];
  readonly needsReplan: boolean;
}

/**
 * 处理单一 `WorldDiff`：写入 SSOT、计算引擎侧 `WorldConstraintDiff`、按 hint 展开传播槽位。
 */
export function processWorldDiff(
  diff: WorldDiff,
  store: WorldConstraintStore,
  options?: ProcessWorldDiffOptions,
): ProcessWorldDiffResult {
  const field = worldDiffToConstraintField(diff);
  if (field === undefined) {
    throw new Error('worldDiffToConstraintField returned undefined');
  }

  store.upsert(field);
  const written = store.get(field.type, field.id);
  if (!written) {
    throw new Error(`expected field ${field.type}:${field.id} after upsert`);
  }

  const constraintDiff = computeWorldDiff(written, options?.tripPlan);
  const propagatedSlotIds = computePropagation(diff, {
    plan: options?.tripPlan,
  });

  const needsReplan =
    constraintDiff.hasImpact && propagatedSlotIds.length > 0;

  return {
    store,
    constraintDiff,
    propagatedSlotIds,
    needsReplan,
  };
}
