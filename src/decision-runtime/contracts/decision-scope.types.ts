/**
 * DecisionScope — minimal sufficient decision space for one Decision Run.
 * Decision / Solver / Verification must share the same snapshotId + scope.
 */

export const DECISION_SCOPE_SCHEMA = 'tripnara.decision_scope@v1' as const;

export interface DecisionScopeObjectRef {
  kind: string;
  id: string;
  label?: string;
}

export interface DecisionWindow {
  from: string;
  to: string;
}

export interface DecisionScope {
  schema: typeof DECISION_SCOPE_SCHEMA;
  snapshotId: string;
  tripId: string;
  trigger: string;
  affectedObjects: DecisionScopeObjectRef[];
  affectedDays: number[];
  decisionWindow: DecisionWindow;
  mutableObjects: DecisionScopeObjectRef[];
  lockedObjects: DecisionScopeObjectRef[];
  allowedActions: string[];
  forbiddenActions: string[];
  hardConstraints: string[];
  softObjectives: string[];
}

export interface ScopeMutationCandidate {
  actionType: string;
  targetObjectIds: string[];
}

/**
 * Verification / Solver gate: candidate mutations must stay inside scope.
 */
export function assertCandidateWithinDecisionScope(
  scope: DecisionScope,
  candidate: ScopeMutationCandidate,
): { ok: true } | { ok: false; reason: string } {
  if (scope.forbiddenActions.includes(candidate.actionType)) {
    return { ok: false, reason: `forbiddenActions contains ${candidate.actionType}` };
  }
  if (!scope.allowedActions.includes(candidate.actionType)) {
    return { ok: false, reason: `action ${candidate.actionType} not in allowedActions` };
  }
  const mutable = new Set(scope.mutableObjects.map((o) => o.id));
  const locked = new Set(scope.lockedObjects.map((o) => o.id));
  for (const id of candidate.targetObjectIds) {
    if (locked.has(id)) {
      return { ok: false, reason: `target ${id} is locked` };
    }
    if (!mutable.has(id)) {
      return { ok: false, reason: `target ${id} not in mutableObjects` };
    }
  }
  return { ok: true };
}

/** Same Decision Run: Decision / Solver / Verification must bind identical snapshotId. */
export function assertSharedSnapshotId(
  snapshotId: string,
  consumers: Array<{ name: string; snapshotId?: string | null }>,
): void {
  for (const c of consumers) {
    if (c.snapshotId !== snapshotId) {
      throw new Error(
        `DecisionScope snapshot mismatch: expected ${snapshotId} for ${c.name}, got ${c.snapshotId ?? 'null'}`,
      );
    }
  }
}
