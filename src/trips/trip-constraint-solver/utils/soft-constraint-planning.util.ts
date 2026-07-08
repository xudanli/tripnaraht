import type { PlanningConflictItem } from '../types/planning-conflicts.types';

export function mergeSoftAdvisoriesIntoPlanningConflicts(
  hardConflicts: PlanningConflictItem[],
  softAdvisories: PlanningConflictItem[],
): PlanningConflictItem[] {
  if (!softAdvisories.length) return hardConflicts;
  const seen = new Set(hardConflicts.map((c) => c.id));
  const merged = [...hardConflicts];
  for (const item of softAdvisories) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
