import type { GuardianPersonaPresentation } from './guardian-presentation.types';

/** 从 presentation 推断硬约束是否已 BLOCK（前端优先读此字段） */
export function resolveHardConstraintBlocked(
  presentation: Pick<
    GuardianPersonaPresentation,
    'actions' | 'structuredStatus' | 'scenario'
  >,
): boolean {
  if (presentation.actions.abu === 'BLOCK') return true;
  if (presentation.structuredStatus.abu?.existence === 'BLOCK') return true;
  if (presentation.scenario === 'SAFETY_BLOCK') return true;
  return false;
}

export function enrichGuardianPresentation(
  presentation: GuardianPersonaPresentation,
): GuardianPersonaPresentation {
  return {
    ...presentation,
    hardConstraintBlocked: resolveHardConstraintBlocked(presentation),
  };
}
