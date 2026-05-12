import type { ConstraintProofGlobalStatus } from '../constraint-proof/constraint-proof.types';
import { getExecutionMemoryGraph } from './memory-store';
import type {
  ExecutionMemoryEvent,
  ExecutionMemoryEventType,
  ExecutionMemorySnapshot,
  ExecutionReplayState,
} from './execution-memory.types';

function applyMemoryEvent(state: ExecutionReplayState, event: ExecutionMemoryEvent): ExecutionReplayState {
  const typesSeen = new Set(state.eventTypesSeen);
  typesSeen.add(event.type);

  const next: ExecutionReplayState = {
    ...state,
    eventTypesSeen: [...typesSeen] as ExecutionMemoryEventType[],
    rawEvents: [...state.rawEvents, event],
  };

  if (event.type === 'PROOF_EVALUATED' && event.payload && typeof event.payload === 'object') {
    const gs = (event.payload as { globalStatus?: ConstraintProofGlobalStatus }).globalStatus;
    if (gs) {
      next.lastProofStatus = gs;
    }
  }

  if (event.type === 'SIMULATION_RUN' && event.payload && typeof event.payload === 'object') {
    next.lastSimulationSummary = event.payload as Record<string, unknown>;
  }

  if (event.type === 'NEPTUNE_DECISION' && event.payload && typeof event.payload === 'object') {
    next.lastNeptuneSummary = event.payload as Record<string, unknown>;
  }

  if (event.type === 'REPAIR_APPLIED' && event.payload && typeof event.payload === 'object') {
    const ids = (event.payload as { changedSlotIds?: string[] }).changedSlotIds;
    if (ids) {
      next.repairApplied = { changedSlotIds: ids };
    }
  }

  return next;
}

export function replayExecution(dagId: string): ExecutionReplayState {
  const graph = getExecutionMemoryGraph();
  const sorted = graph.events
    .filter(e => e.dagId === dagId)
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  let state: ExecutionReplayState = {
    dagId,
    eventTypesSeen: [],
    rawEvents: [],
  };

  for (const e of sorted) {
    state = applyMemoryEvent(state, e);
  }

  return state;
}

/** Same structural hashes + ids imply deterministic replay inputs. */
export function snapshotsAreDeterministicallyAligned(a: ExecutionMemorySnapshot, b: ExecutionMemorySnapshot): boolean {
  return (
    a.dagId === b.dagId &&
    a.irId === b.irId &&
    a.truthHash === b.truthHash &&
    a.overlayHash === b.overlayHash
  );
}
