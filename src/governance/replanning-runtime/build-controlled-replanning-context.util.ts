import type { HydratedGovernanceRuntimeContext } from '../activation/governance-activation.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { ControlledReplanningContext } from './controlled-replanning-context.types';
import { buildGovernanceConstrainedPlanningSearch } from './governance-constrained-planning-search.util';
import { inferReplanningScopeIsolation } from './infer-replanning-scope-isolation.util';
import { mapDirectiveToRuntimeStateHint } from './map-directive-to-runtime-state.util';

export function buildControlledReplanningContext(args: {
  directive: RuntimeBranchDirective;
  hydrated: HydratedGovernanceRuntimeContext;
  userMessage?: string;
}): ControlledReplanningContext {
  const { directive, hydrated } = args;
  const intent = directive.replanningIntent;
  const replanningScope = inferReplanningScopeIsolation({
    snapshot: hydrated.snapshot,
    replanningIntent: intent,
    userMessage: args.userMessage,
  });
  const forbiddenStrategies =
    intent?.forbiddenStrategies?.length ? [...intent.forbiddenStrategies] : ['expand_long_distance_autoroute_until_cleared'];
  return {
    sourceGovernanceDirective: directive,
    replanningIntent: intent,
    inheritedRestrictions: [...hydrated.snapshot.activeRestrictions],
    forbiddenStrategies,
    preservedSegments: [],
    replanningScope,
    runtimeState: hydrated.runtimeState,
    runtimeStateHint: mapDirectiveToRuntimeStateHint(directive),
    planningSearchConstraints: buildGovernanceConstrainedPlanningSearch({
      pressure: hydrated.pressure,
      directive,
    }),
  };
}
