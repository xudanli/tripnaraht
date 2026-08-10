/**
 * Map verified runbook execution → RepairInstruction-shaped hints for Repair Runtime.
 */

import type {
  RepairAction,
  RepairInstruction,
} from '../../../../trips/decision/repair/repair-action.types';
import type {
  IcelandDriveRunbookCandidateOp,
  IcelandDriveRunbookExecutionResult,
} from './iceland-drive-runbook.types';

const ACTION_BY_OP: Record<IcelandDriveRunbookCandidateOp, RepairAction> = {
  REROUTE: 'SWAP_POI',
  SHORTEN: 'SHORTEN_ACTIVITY',
  REMOVE: 'SKIP_OPTIONAL_POI',
  SHIFT: 'MOVE_SLOT_LATER',
  ADD_STOP: 'INSERT_REST',
  END_DAY_EARLY: 'EARLY_DEPARTURE',
  SWAP: 'SWAP_POI',
};

/**
 * Convert a verified (or fallback) runbook proposal into repair instructions.
 * Does not apply plan versions — caller confirms then applies.
 */
export function runbookExecutionToRepairInstructions(
  execution: IcelandDriveRunbookExecutionResult,
  opts?: { date?: string; targetSlotIds?: string[] },
): RepairInstruction[] {
  if (!execution.verifiedProposal && !execution.fallbackApplied) {
    return [];
  }

  const date = opts?.date ?? new Date().toISOString().slice(0, 10);
  const targetSlotIds = opts?.targetSlotIds ?? [];
  const out: RepairInstruction[] = [];
  let i = 0;

  for (const op of execution.candidateOperations) {
    out.push({
      id: `repair_rb_${execution.runbookId}_${op}_${i++}`,
      action: ACTION_BY_OP[op],
      targetSlotIds,
      date,
      narrative: `${execution.runbookId}: ${execution.proposalSummary}`,
      priority: execution.runbookId === 'IS_RB_ROAD_CLOSURE' ? 1 : 4,
      confidence: execution.verifiedProposal ? 0.85 : 0.55,
      metadata: {
        source: 'ICELAND_DRIVE_RUNBOOK',
        domain: 'RUNBOOK',
        runbookId: execution.runbookId,
        runbookOperation: op,
        commandType: execution.commandType,
        createPlanVersion: execution.createPlanVersion,
        confirmationPolicy: execution.confirmationPolicy,
      },
    });
  }

  return out;
}
