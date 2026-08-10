/**
 * Hard Constraint / Gate BLOCK / 安全规则 — 禁止由 Learning 自动修改。
 */

import {
  assertLearningDoesNotMutatePolicy,
  type PolicyMutationTarget,
} from '../state-learning/hardening/learning-signal.registry';

export type HardConstraintKind =
  | 'HARD_CONSTRAINT'
  | 'GATE_BLOCK'
  | 'SAFETY_RULE';

export type HardConstraintGuardResult =
  | { ok: true; kind: HardConstraintKind }
  | {
      ok: false;
      code: 'LEARNING_CANNOT_MUTATE_HARD_CONSTRAINT';
      kind: HardConstraintKind;
      reason: string;
    };

const KIND_TO_TARGET: Record<HardConstraintKind, PolicyMutationTarget> = {
  HARD_CONSTRAINT: 'RULE',
  GATE_BLOCK: 'GATE',
  SAFETY_RULE: 'RULE',
};

/** Learning 试图修改硬约束时一律拒绝 */
export function assertLearningCannotMutateHardConstraint(
  kind: HardConstraintKind,
): HardConstraintGuardResult {
  const target = KIND_TO_TARGET[kind];
  const r = assertLearningDoesNotMutatePolicy(target);
  if (!r.ok) {
    return {
      ok: false,
      code: 'LEARNING_CANNOT_MUTATE_HARD_CONSTRAINT',
      kind,
      reason: `learning_cannot_auto_modify_${kind.toLowerCase()}`,
    };
  }
  return { ok: true, kind };
}

export function assertLearningCannotMutateHardConstraintOrThrow(
  kind: HardConstraintKind,
): void {
  const r = assertLearningCannotMutateHardConstraint(kind);
  if (r.ok === false) {
    throw new Error(`[HardConstraint] ${r.code}: ${r.reason}`);
  }
}

export const PROTECTED_FROM_LEARNING = [
  'HARD_CONSTRAINT',
  'GATE_BLOCK',
  'SAFETY_RULE',
] as const;
