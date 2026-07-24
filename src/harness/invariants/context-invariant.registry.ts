export type { InvariantResult } from './invariant.types';
import type { ContextInvariantDefinition, InvariantResult } from './invariant.types';
import type { EvaluateContextInvariantsInput } from './invariant.types';
import { STATE_INVARIANTS } from './evaluators/state.invariants';
import { AUTHORITY_INVARIANTS } from './evaluators/authority.invariants';
import { WORLD_INVARIANTS } from './evaluators/world.invariants';

const REGISTRY = new Map<string, ContextInvariantDefinition>();

for (const def of [...STATE_INVARIANTS, ...AUTHORITY_INVARIANTS, ...WORLD_INVARIANTS]) {
  REGISTRY.set(def.invariantId, def);
}

export function getContextInvariant(id: string): ContextInvariantDefinition | undefined {
  return REGISTRY.get(id);
}

export function listContextInvariantIds(): string[] {
  return [...REGISTRY.keys()].sort();
}

export function evaluateContextInvariants(input: EvaluateContextInvariantsInput): InvariantResult[] {
  return input.invariantIds.map((id) => {
    const def = REGISTRY.get(id);
    if (!def) {
      return {
        invariantId: id,
        pass: false,
        severity: 'BLOCKER',
        message: `Unknown invariant: ${id}`,
      };
    }
    return def.evaluate({
      before: input.before,
      after: input.after,
      trace: input.trace,
    });
  });
}

export { REGISTRY as CONTEXT_INVARIANT_REGISTRY };
