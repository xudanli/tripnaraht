/**
 * Canonical-only 装载视图 — CRE / ASK_TRIP_QUESTION / Gate 路径专用。
 * 禁止把 latent 全量注入 Prompt 或硬约束。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import {
  buildCanonicalOnlyLoadView,
  buildSuggestLoadView,
  crePathAllowsLatent,
  type LatentConsumer,
} from './latent-activation.policy';
import type { RorRealitySnapshot } from './reality-observation.types';

export type RealityLoadPurpose =
  | 'ASK_TRIP_QUESTION'
  | 'CRE_SLIM'
  | 'GATE'
  | 'EXECUTE'
  | 'SUGGEST'
  | 'RANKING'
  | 'EXPLAIN';

/**
 * 按 CRE 操作 + 用途选择装载视图。
 * ASK_TRIP_QUESTION / CRE slim / Gate / Execute → 仅 Canonical。
 */
export function resolveRealityLoadView(
  snapshot: RorRealitySnapshot | null | undefined,
  opts: {
    crePlan?: ContextRequirementPlan | null;
    purpose: RealityLoadPurpose;
  },
): {
  mode: 'NONE' | 'CANONICAL_ONLY' | 'CANONICAL_PLUS_ACTIVATED_LATENT';
  latentInjected: boolean;
  view: ReturnType<typeof buildCanonicalOnlyLoadView> | ReturnType<typeof buildSuggestLoadView> | null;
} {
  if (!snapshot) {
    return { mode: 'NONE', latentInjected: false, view: null };
  }

  const creOp = opts.crePlan?.operation;
  const slim =
    opts.crePlan?.acquisition?.slimLoad === true ||
    creOp === 'ASK_TRIP_QUESTION' ||
    opts.purpose === 'ASK_TRIP_QUESTION' ||
    opts.purpose === 'CRE_SLIM';

  if (
    slim ||
    opts.purpose === 'GATE' ||
    opts.purpose === 'EXECUTE' ||
    !crePathAllowsLatent(creOp)
  ) {
    const view = buildCanonicalOnlyLoadView(snapshot);
    return { mode: 'CANONICAL_ONLY', latentInjected: false, view };
  }

  const consumer: Extract<LatentConsumer, 'SUGGEST' | 'RANKING' | 'EXPLAIN'> =
    opts.purpose === 'EXPLAIN'
      ? 'EXPLAIN'
      : opts.purpose === 'RANKING'
        ? 'RANKING'
        : 'SUGGEST';
  const view = buildSuggestLoadView(snapshot, consumer);
  return {
    mode: 'CANONICAL_PLUS_ACTIVATED_LATENT',
    latentInjected: view.latentInjected,
    view,
  };
}

/** 序列化供 LIGHTWEIGHT / CRE 观测：永不带 latent 正文 */
export function serializeCanonicalLoadForCreAsk(
  snapshot: RorRealitySnapshot | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const view = buildCanonicalOnlyLoadView(snapshot);
  return {
    layer: view.layer,
    latentInjected: false,
    observedFactKeys: view.observedFacts.map((f) => f.key),
    derivedFactKeys: view.derivedFacts.map((f) => f.key),
    decisionSnapshotId: view.decisionSnapshot.snapshotId,
  };
}
