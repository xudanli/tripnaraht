import { createHash } from 'crypto';
import type { TripWorldState } from '../decision/world-model';
import type { ExecutionIdentity } from './identity-preservation.types';

/** Materialize identity carriers from stable trip + causal lineage fields. */
export function buildExecutionIdentity(state: TripWorldState): ExecutionIdentity {
  const ctx = state.context;
  const modelId = state.signals.reflectiveCausalModel?.modelId ?? 'no-causal';
  const raw = `${ctx.destination}|${ctx.startDate}|${ctx.durationDays}|${modelId}`;
  const semanticCoreHash = createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32);
  return {
    semanticCoreHash,
    invariantCore: ['trip_context', 'causal_model_lineage'],
    mutationEnvelope: 0.35,
  };
}
