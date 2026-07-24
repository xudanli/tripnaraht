/**
 * WriteTarget registry for UWC v1 first-batch corridors.
 * Mirrors WRITEBACK_CORRIDOR_AUDIT_MATRIX — does not invent a new persistence SSOT.
 */

import {
  ACTIONS_COMMIT_MIXED_TARGETS,
  MIXED_WRITE_UNIFICATION_FORBIDDEN,
  UNIFIED_EXECUTE_MIXED_TARGETS,
  WRITEBACK_CORRIDOR_AUDIT_MATRIX,
  type MixedWriteTargetDescriptor,
} from '../../../agent/contracts/writeback-corridor-audit.matrix';
import type {
  AuthoritativeWriteCorridorId,
  WriteCompensationModel,
  WriteTargetKind,
  WriteTargetRef,
} from './authoritative-write.types';
import { CORRIDOR_TO_AUDIT_ROW_ID } from './authoritative-write.types';

function mapMixedDurability(
  d: MixedWriteTargetDescriptor['durability'],
): WriteTargetRef['durability'] {
  return d;
}

function kindFromMixedTarget(target: string, id: string): WriteTargetKind {
  const t = `${id} ${target}`.toLowerCase();
  if (t.includes('itinerary')) return 'trip_itinerary_item';
  if (t.includes('ledger')) return 'decision_ledger';
  if (t.includes('problem')) return 'problem_store';
  if (t.includes('side')) return 'side_effect';
  if (t.includes('action_log') || t.includes('agentactionlog')) return 'agent_action_log';
  if (t.includes('dedup') || t.includes('in_memory') || t.includes('in-memory'))
    return 'in_memory_dedup';
  if (t.includes('metadata') || t.includes('revision')) return 'trip_metadata';
  if (t.includes('effective')) return 'effective_plan';
  if (t.includes('planversion') || t.includes('plan_version') || t.includes('plan version'))
    return 'plan_version';
  return 'trip_metadata';
}

function refsFromMixed(
  rows: readonly MixedWriteTargetDescriptor[],
): WriteTargetRef[] {
  return rows.map((row) => ({
    kind: kindFromMixedTarget(row.target, row.id),
    mixedTargetId: row.id,
    durability: mapMixedDurability(row.durability),
  }));
}

const ITINERARY_ADJUST_TARGETS: WriteTargetRef[] = [
  {
    kind: 'trip_itinerary_item',
    mixedTargetId: 'itinerary_item_crud',
    durability: 'always',
  },
  {
    kind: 'trip_metadata',
    mixedTargetId: 'itinerary_revision_audit',
    durability: 'optional',
  },
];

export type CorridorWriteTargetProfile = {
  corridor: AuthoritativeWriteCorridorId;
  auditRowId: string;
  entry: string;
  writeTargets: WriteTargetRef[];
  compensationModel: WriteCompensationModel;
  /** Delegate path — existing executor; gateway does not replace it. */
  delegatePath: string;
  delegateSymbol: string;
  notes: string;
};

export const AUTHORITATIVE_WRITE_TARGET_PROFILES: Record<
  AuthoritativeWriteCorridorId,
  CorridorWriteTargetProfile
> = {
  ITINERARY_ADJUST: {
    corridor: 'ITINERARY_ADJUST',
    auditRowId: CORRIDOR_TO_AUDIT_ROW_ID.ITINERARY_ADJUST,
    entry: 'POST /agent/route_and_run (+ apply_itinerary_adjust_draft / AUTO)',
    writeTargets: ITINERARY_ADJUST_TARGETS,
    compensationModel: 'revision_chain_rollback',
    delegatePath: 'src/agent/utils/itinerary-adjust-draft-apply.util.ts',
    delegateSymbol: 'executeItineraryAdjustDraftApply',
    notes: 'Single primary persistence trip_itinerary_item; revision audit best-effort.',
  },
  UNIFIED_EXECUTE: {
    corridor: 'UNIFIED_EXECUTE',
    auditRowId: CORRIDOR_TO_AUDIT_ROW_ID.UNIFIED_EXECUTE,
    entry: 'POST /trips/:tripId/decisions/:decisionId/execute',
    writeTargets: refsFromMixed(UNIFIED_EXECUTE_MIXED_TARGETS),
    compensationModel: 'post_effective_compensating_plan_version',
    delegatePath:
      'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    delegateSymbol: 'Rfc001PlanVersionApplyExecutor.execute',
    notes: MIXED_WRITE_UNIFICATION_FORBIDDEN,
  },
  ACTIONS_COMMIT: {
    corridor: 'ACTIONS_COMMIT',
    auditRowId: CORRIDOR_TO_AUDIT_ROW_ID.ACTIONS_COMMIT,
    entry: 'POST /agent/actions/commit',
    writeTargets: refsFromMixed(ACTIONS_COMMIT_MIXED_TARGETS),
    compensationModel: 'stub_no_side_effects',
    delegatePath: 'src/agent/services/action-execution.service.ts',
    delegateSymbol: 'ActionExecutionService.commit',
    notes: `${MIXED_WRITE_UNIFICATION_FORBIDDEN}; rollback remains STUB_NO_SIDE_EFFECTS.`,
  },
};

export function getCorridorWriteTargetProfile(
  corridor: AuthoritativeWriteCorridorId,
): CorridorWriteTargetProfile {
  return AUTHORITATIVE_WRITE_TARGET_PROFILES[corridor];
}

/** Assert audit matrix still contains first-batch rows (contract helper). */
export function listAuditRowIdsForV1Batch(): string[] {
  const ids = new Set(WRITEBACK_CORRIDOR_AUDIT_MATRIX.map((r) => r.id));
  return Object.values(CORRIDOR_TO_AUDIT_ROW_ID).filter((id) => ids.has(id));
}
