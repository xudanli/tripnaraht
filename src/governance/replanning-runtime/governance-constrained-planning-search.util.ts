import type { GovernancePressureField } from '../activation/governance-activation.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { GovernancePlanningSearchConstraints } from './controlled-replanning-context.types';

/**
 * Derives hard search-space exclusions from pressure + branch (v1 heuristics).
 */
export function buildGovernanceConstrainedPlanningSearch(args: {
  pressure: GovernancePressureField;
  directive: RuntimeBranchDirective;
}): GovernancePlanningSearchConstraints {
  const w = args.pressure.weather ?? args.pressure.worldPressure;
  const x = args.pressure.executionPressure;
  const tags: string[] = [];
  const forbidRemoteHighlands = w >= 0.55 || args.directive.branchType === 'replanning';
  const forbidNightCorridorExpansion = w >= 0.45 || x >= 0.5;
  const forbidFerryOnlyCorridors = w >= 0.5 && x >= 0.35;
  if (forbidRemoteHighlands) tags.push('governance.search.forbid.remote_highlands');
  if (forbidNightCorridorExpansion) tags.push('governance.search.forbid.night_corridor_expansion');
  if (forbidFerryOnlyCorridors) tags.push('governance.search.forbid.ferry_only_corridors');
  if (args.directive.branchType === 'halted') {
    tags.push('governance.search.halted');
  }
  return {
    forbidRemoteHighlands,
    forbidNightCorridorExpansion,
    forbidFerryOnlyCorridors,
    constraintTags: tags,
  };
}
