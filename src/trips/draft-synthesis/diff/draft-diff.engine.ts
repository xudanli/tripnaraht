import type { TripDraftSelection } from '../state/trip-draft-state.types';
import type { DraftDiff, DraftDiffScores } from './draft-diff.types';

function selectionKey(s: TripDraftSelection): string {
  return `${s.day}:${s.slot}`;
}

function toMap(list: TripDraftSelection[]): Map<string, TripDraftSelection> {
  const m = new Map<string, TripDraftSelection>();
  for (const s of list) {
    m.set(selectionKey(s), s);
  }
  return m;
}

/**
 * 比较两套选点（如 LLM 编排 vs 算法编排），输出增删改与简单启发分。
 * 冲突细项（距离/餐食等）需后续接约束引擎再填充。
 */
export function computeSelectionDiff(
  a: TripDraftSelection[],
  b: TripDraftSelection[],
): DraftDiff {
  const ma = toMap(a);
  const mb = toMap(b);
  const added: TripDraftSelection[] = [];
  const removed: TripDraftSelection[] = [];
  const changed: Array<{ before: TripDraftSelection; after: TripDraftSelection }> = [];

  for (const [k, vb] of mb) {
    const va = ma.get(k);
    if (!va) {
      added.push(vb);
      continue;
    }
    if (va.placeId !== vb.placeId) {
      changed.push({ before: va, after: vb });
    }
  }

  for (const [k, va] of ma) {
    if (!mb.has(k)) removed.push(va);
  }

  const score = heuristicScores(added.length + removed.length + changed.length, a.length, b.length);

  return {
    added,
    removed,
    changed,
    conflicts: [],
    score,
  };
}

function heuristicScores(
  mutationCount: number,
  lenA: number,
  lenB: number,
): DraftDiffScores {
  const n = Math.max(lenA, lenB, 1);
  const churn = Math.min(1, mutationCount / (2 * n));
  return {
    continuity: Number((1 - churn).toFixed(3)),
    feasibility: 0,
    coherence: 0,
  };
}
