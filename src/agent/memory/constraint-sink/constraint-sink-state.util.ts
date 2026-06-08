import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';
import {
  CONSTRAINT_SINK_V1_KEY,
  type ConstraintSinkPatchV1,
  type ConstraintSinkStateV1,
} from './constraint-sink.types';

const MAX_PATCHES = 32;

const PROTECTED_CONSTRAINT_KEYS = new Set([
  'toolAllowlist',
  'tool_policies',
  'approved_tool_invocations',
  CONSTRAINT_SINK_V1_KEY,
]);

export function readConstraintSinkState(
  constraints?: Record<string, unknown> | null,
): ConstraintSinkStateV1 | null {
  if (!constraints || typeof constraints !== 'object') return null;
  const raw = constraints[CONSTRAINT_SINK_V1_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as ConstraintSinkStateV1;
  if (r.revision !== 'v1' || !Array.isArray(r.patches)) return null;
  return r;
}

export function appendConstraintSinkPatch(
  existing: TripTaskMemory | null,
  patch: ConstraintSinkPatchV1,
): Record<string, unknown> {
  const base = existing?.constraints && typeof existing.constraints === 'object' ? { ...existing.constraints } : {};
  const state = readConstraintSinkState(base) ?? { revision: 'v1' as const, patches: [] };
  const patches = [...state.patches.filter((p) => p.id !== patch.id), patch].slice(-MAX_PATCHES);
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (!PROTECTED_CONSTRAINT_KEYS.has(k)) next[k] = v;
  }
  for (const k of PROTECTED_CONSTRAINT_KEYS) {
    if (base[k] !== undefined) next[k] = base[k];
  }
  next[CONSTRAINT_SINK_V1_KEY] = { revision: 'v1', patches } satisfies ConstraintSinkStateV1;
  return next;
}

export function removeConstraintSinkPatch(
  constraints: Record<string, unknown> | undefined,
  patchId: string,
): Record<string, unknown> | undefined {
  const state = readConstraintSinkState(constraints);
  if (!state) return constraints;
  const patches = state.patches.filter((p) => p.id !== patchId);
  if (patches.length === state.patches.length) return constraints;
  const base = { ...(constraints ?? {}) };
  if (patches.length === 0) {
    delete base[CONSTRAINT_SINK_V1_KEY];
  } else {
    base[CONSTRAINT_SINK_V1_KEY] = { revision: 'v1', patches };
  }
  return base;
}

/** Fold patches into one effective delta (later patch wins per field). */
export function foldConstraintSinkPatches(state: ConstraintSinkStateV1 | null): {
  delta: import('./constraint-sink.types').ConstraintDeltaV1;
  patch_ids: string[];
} {
  const delta: import('./constraint-sink.types').ConstraintDeltaV1 = {};
  const patch_ids: string[] = [];
  if (!state?.patches?.length) return { delta, patch_ids };

  for (const p of state.patches) {
    patch_ids.push(p.id);
    const d = p.delta;
    if (d.destination_pivot) delta.destination_pivot = { ...delta.destination_pivot, ...d.destination_pivot };
    if (d.negative) {
      delta.negative = {
        ...delta.negative,
        ...d.negative,
        avoid_regions: [...new Set([...(delta.negative?.avoid_regions ?? []), ...(d.negative.avoid_regions ?? [])])],
        avoid_poi_types: [
          ...new Set([...(delta.negative?.avoid_poi_types ?? []), ...(d.negative.avoid_poi_types ?? [])]),
        ],
      };
    }
    if (d.budget) delta.budget = { ...delta.budget, ...d.budget };
    if (d.pace) delta.pace = d.pace;
    if (d.party) delta.party = { ...delta.party, ...d.party };
  }
  return { delta, patch_ids };
}

export function summarizePatchForConsole(patch: ConstraintSinkPatchV1): string {
  const parts: string[] = [];
  const d = patch.delta;
  if (d.destination_pivot?.to) parts.push(`改去 ${d.destination_pivot.to}`);
  if (d.negative?.avoid_regions?.length) parts.push(`避免区域：${d.negative.avoid_regions.join('、')}`);
  if (d.negative?.notes_zh) parts.push(d.negative.notes_zh);
  if (d.pace) parts.push(`节奏：${d.pace}`);
  if (d.budget?.total) parts.push(`预算：${d.budget.total}${d.budget.currency ?? ''}`);
  return parts.join('；') || '行程偏好更新';
}
