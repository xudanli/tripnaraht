/**
 * P5-4: structural graph patches — single runtime contract for repair-driven edge mutation.
 */

import type { RepairInstruction } from '../decision/repair/repair-action.types';
import type { ExecutionTruthDAG } from './execution-truth-dag.types';
import { nodeIdForSlot } from './dag-node-ids';

export type GraphPatchOp = 'INCREASE_WEIGHT' | 'DECREASE_WEIGHT' | 'REMOVE';

export interface ExecutionGraphPatch {
  target: string;
  op: GraphPatchOp;
  reason: string;
}

const MUTATING: ReadonlySet<RepairInstruction['action']> = new Set([
  'COMPRESS_STOP',
  'SHORTEN_ACTIVITY',
  'MOVE_SLOT_EARLIER',
  'MOVE_SLOT_LATER',
  'EARLY_DEPARTURE',
  'DELAY_CHECKIN',
  'SPLIT_DRIVE',
]);

export function buildGraphPatchesFromRepairs(
  dag: ExecutionTruthDAG,
  repairs: RepairInstruction[],
): ExecutionGraphPatch[] {
  if (!repairs.length || !dag.edges.length) {
    return [];
  }

  const out: ExecutionGraphPatch[] = [];

  for (const r of repairs) {
    for (const e of dag.edges) {
      const touches = r.targetSlotIds.some(
        sid => e.from === nodeIdForSlot(sid) || e.to === nodeIdForSlot(sid),
      );
      if (!touches) {
        continue;
      }

      if (r.action === 'SKIP_OPTIONAL_POI' && e.type === 'TEMPORAL_SEQUENCE') {
        out.push({
          target: e.id,
          op: 'REMOVE',
          reason: `SKIP_OPTIONAL:${r.id}`,
        });
        continue;
      }

      if (MUTATING.has(r.action) && typeof r.suggestedDeltaMinutes === 'number') {
        out.push({
          target: e.id,
          op: 'DECREASE_WEIGHT',
          reason: `${r.action}:${r.id}`,
        });
        continue;
      }

      if (r.action === 'SWAP_POI') {
        out.push({
          target: e.id,
          op: 'DECREASE_WEIGHT',
          reason: `SWAP_POI:${r.id}`,
        });
      }
    }
  }

  return out;
}
