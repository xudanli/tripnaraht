/**
 * Reality Observation Runtime facade。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import { runObservationLoop } from './observation-executor';
import { buildObservationPlan } from './observation-plan.builder';
import { crePathAllowsLatent } from './latent-activation.policy';
import {
  freezeRealitySnapshot,
  serializeRorSnapshotForObservability,
} from './reality-snapshot.freeze';
import { serializeCanonicalLoadForCreAsk } from './canonical-load.view';
import {
  buildRorSeedFacts,
  createObservationFetchHost,
  type TripDaySeed,
} from './observation-seed.builder';
import type {
  ObservationPlan,
  ObservationScope,
  RorFetchHost,
  RorRealitySnapshot,
  RorSeedFacts,
} from './reality-observation.types';

export type RunRealityObservationInput = {
  message: string;
  scope: ObservationScope;
  crePlan?: ContextRequirementPlan | null;
  seeds?: RorSeedFacts;
  tripDay?: TripDaySeed | null;
  host?: RorFetchHost;
  travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
  containsOutdoorActivity?: boolean;
  containsReservableActivity?: boolean;
  /** 默认 true；CRE ASK / slim 路径应传 false */
  includeLatent?: boolean;
};

export type RunRealityObservationResult = {
  skipped: boolean;
  reason?: string;
  plan: ObservationPlan | null;
  snapshot: RorRealitySnapshot | null;
  observability: Record<string, unknown> | null;
  /** CRE/ASK 装载用：永不含 latent */
  canonicalLoad: Record<string, unknown> | null;
};

/**
 * CRE 之后：若命中 6 大观察任务则 Plan→Execute→Reflect→Freeze。
 * LIGHTWEIGHT / ASK 类 CRE 操作返回 skipped。
 */
export async function runRealityObservationRuntime(
  input: RunRealityObservationInput,
): Promise<RunRealityObservationResult> {
  const plan = buildObservationPlan({
    message: input.message,
    scope: input.scope,
    crePlan: input.crePlan,
    travelMode: input.travelMode ?? input.tripDay?.travelMode ?? null,
    containsOutdoorActivity: input.containsOutdoorActivity,
    containsReservableActivity: input.containsReservableActivity,
  });

  if (!plan) {
    return {
      skipped: true,
      reason: 'no_ror_task_for_operation',
      plan: null,
      snapshot: null,
      observability: null,
      canonicalLoad: null,
    };
  }

  const allowLatent =
    input.includeLatent !== false && crePathAllowsLatent(input.crePlan?.operation);

  const mergedSeeds = buildRorSeedFacts({
    crePlan: input.crePlan,
    scope: input.scope,
    tripDay: input.tripDay,
    extras: input.seeds?.byKey,
  });

  /** 始终以 mergedSeeds 为优先；外部 FetchHost 仅作服务回退（Weather/Road/Route） */
  const host = createObservationFetchHost({
    seeds: mergedSeeds,
    fallback: input.host,
  });

  const state = await runObservationLoop(plan, mergedSeeds, host);
  const snapshot = freezeRealitySnapshot({
    plan,
    state,
    message: input.message,
    includeLatent: allowLatent,
  });

  return {
    skipped: false,
    plan,
    snapshot,
    observability: serializeRorSnapshotForObservability(snapshot),
    canonicalLoad: serializeCanonicalLoadForCreAsk(snapshot),
  };
}

export { buildObservationPlan, mapCreOperationToRorTask } from './observation-plan.builder';
export { runObservationLoop } from './observation-executor';
export {
  freezeRealitySnapshot,
  serializeRorSnapshotForObservability,
} from './reality-snapshot.freeze';
export {
  canActivateLatentForConsumer,
  selectLatentForConsumer,
  buildCanonicalOnlyLoadView,
  crePathAllowsLatent,
} from './latent-activation.policy';
export {
  resolveRealityLoadView,
  serializeCanonicalLoadForCreAsk,
} from './canonical-load.view';
export {
  buildRorSeedFacts,
  createObservationFetchHost,
  extractDayActivitiesFromTripSummaryText,
} from './observation-seed.builder';
