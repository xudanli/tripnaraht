import type { ConvergenceResult } from '../convergence/convergence.types';
import type { DraftValidationGateResult } from '../gate/draft-validation-gate.types';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type { StandardizedRepairAction } from './repair.types';
import { bumpTripDraftStateVersion } from '../state/build-trip-draft-state';

/**
 * 将 Gate 输出映射为标准化 RepairAction（便于 Execution / Planner 消费）。
 */
export function repairActionsFromGate(gate: DraftValidationGateResult): StandardizedRepairAction[] {
  const out: StandardizedRepairAction[] = [];
  for (const r of gate.repairActions) {
    const type = r.action as StandardizedRepairAction['type'];
    if (
      type !== 'replace_place' &&
      type !== 'move_slot' &&
      type !== 'split_day' &&
      type !== 'remove_activity' &&
      type !== 'insert_rest_buffer' &&
      type !== 'change_zone'
    ) {
      continue;
    }
    out.push({
      type,
      day: r.day ?? 0,
      slot: r.slot,
      placeId: r.placeId,
      class: gate.status === 'REJECTED' ? 'hard' : 'soft',
      reasonCode: gate.blockingIssues[0]?.type,
    });
  }
  return out;
}

/**
 * 由收敛分歧生成额外修复建议（软约束）。
 */
export function repairActionsFromConvergence(convergence: ConvergenceResult): StandardizedRepairAction[] {
  return convergence.divergenceAreas.map((d) => ({
    type: 'replace_place' as const,
    day: d.day,
    slot: d.slot,
    placeId: d.algoChoice ?? d.llmChoice ?? undefined,
    class: d.type === 'meal' ? ('hard' as const) : ('soft' as const),
    reasonCode: `divergence:${d.type}`,
  }));
}

export interface ApplyPatchOptions {
  /** 仲裁后的最终选点写入 state.selections */
  finalSelections?: import('../state/trip-draft-state.types').TripDraftSelection[];
}

/**
 * 将一次修复回合应用到 TripDraftState（不可变拷贝）。
 */
export function applyRepairPatchToState(
  state: TripDraftState,
  gate: DraftValidationGateResult,
  convergence: ConvergenceResult,
  opts?: ApplyPatchOptions,
): TripDraftState {
  let next = bumpTripDraftStateVersion(state);
  if (opts?.finalSelections?.length) {
    next = {
      ...next,
      selections: [...opts.finalSelections],
    };
  }

  if (gate.status !== 'APPROVED' && (gate.blockingIssues.length > 0 || convergence.divergenceAreas.length > 0)) {
    next = {
      ...next,
      uncertainty: {
        items: [
          ...next.uncertainty.items,
          { type: 'timing', level: 'medium' },
        ],
      },
    };
  }

  return next;
}
