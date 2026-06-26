/**
 * Repair 不变式一：MUST_PRESERVE 体验不得在修复中无声删除
 */

import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PreserveGoal } from '../types/repair-contract.types';
import type { ExperienceIntentDigest } from '../types/experience-intent.types';
import { getExperienceAtom } from '../config/mvp-experience-atoms.config';
import { compileExperienceIntent } from '../services/experience-intent.compiler';

export function extractPreserveGoalsFromState(dso: DecisionState): PreserveGoal[] {
  const fromContract = dso.experienceFulfillment?.repairContract?.preserveGoals ?? [];
  if (fromContract.length) return fromContract;

  const intent = dso.experienceFulfillment?.experienceIntent;
  if (intent) {
    return intent.experienceIntents
      .filter((i) => i.priority === 'MUST_PRESERVE' || i.weight >= 0.85)
      .map((i) => ({
        intent: i.atom,
        minimumScore: i.priority === 'MUST_PRESERVE' ? Math.max(0.65, i.weight - 0.1) : i.weight * 0.85,
        priority: i.priority === 'MUST_PRESERVE' ? 'MUST_PRESERVE' as const : 'HIGH' as const,
      }));
  }

  const msg = String((dso.userIntent as { message?: string })?.message ?? '').trim();
  if (msg) {
    const compiled = compileExperienceIntent({ message: msg });
    return compiled.experienceIntents
      .filter((i) => i.priority === 'MUST_PRESERVE')
      .map((i) => ({
        intent: i.atom,
        minimumScore: Math.max(0.65, i.weight - 0.1),
        priority: 'MUST_PRESERVE' as const,
      }));
  }

  return [];
}

function itemTextBlob(item: Record<string, unknown>): string {
  const parts = [
    item.name,
    item.title,
    (item.location_ref as Record<string, unknown> | undefined)?.name,
    item.poi_id,
    item.place_id,
    item.id,
    JSON.stringify(item.metadata ?? {}),
    JSON.stringify(item.tags ?? []),
  ];
  return parts
    .filter((p) => p != null)
    .map((p) => String(p).toLowerCase())
    .join(' ');
}

export function itemMatchesPreserveGoal(
  item: Record<string, unknown>,
  goal: PreserveGoal,
): boolean {
  const blob = itemTextBlob(item);
  const atom = getExperienceAtom(goal.intent);
  if (!atom) {
    return blob.includes(goal.intent.toLowerCase());
  }
  for (const expr of atom.userExpressions) {
    if (blob.includes(expr.toLowerCase())) return true;
  }
  for (const signal of atom.positiveSignals) {
    if (blob.includes(signal.toLowerCase())) return true;
  }
  const metaAtoms = (item.metadata as Record<string, unknown> | undefined)?.experience_atoms;
  if (Array.isArray(metaAtoms) && metaAtoms.some((a) => String(a) === goal.intent)) {
    return true;
  }
  return false;
}

export function findViolatedMustPreserveGoals(
  removedItem: Record<string, unknown>,
  preserveGoals: PreserveGoal[],
): PreserveGoal[] {
  return preserveGoals.filter(
    (g) => g.priority === 'MUST_PRESERVE' && itemMatchesPreserveGoal(removedItem, g),
  );
}

export function buildPreserveViolationFatalMessage(goals: PreserveGoal[]): string {
  const names = goals.map((g) => g.intent).join(', ');
  return `Repair 试图删除 MUST_PRESERVE 体验目标：${names}`;
}

export function resolveExperienceIntentFromState(dso: DecisionState): ExperienceIntentDigest | undefined {
  return dso.experienceFulfillment?.experienceIntent;
}
