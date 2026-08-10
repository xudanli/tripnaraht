/**
 * Gate 只读 Canonical Reality Snapshot 的约束工具。
 */

import type { DecisionDepth } from '../../decision/kernel/decision-cognition.types';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { attachRealityCognition } from '../../decision/kernel/decision-cognition.util';
import type { RorRealitySnapshot } from './reality-observation.types';
import { resolveRealityLoadView } from './canonical-load.view';
import { canActivateLatentForConsumer } from './latent-activation.policy';

export type GateRealityPolicyMeta = {
  mode: 'CANONICAL_ONLY';
  latentInjected: false;
  source: 'ROR' | 'DSO_DERIVED';
  observationId?: string;
  activatedLatentCount: 0;
  loadMode: string;
};

/**
 * Gate 前：确保 DSO cognition 使用 ROR Canonical 投影。
 * 返回更新后的 DSO + 供 Orchestrator metadata 打标的策略摘要。
 */
export function ensureGateCanonicalReality(
  decisionState: DecisionState | undefined,
  rorSnapshot: RorRealitySnapshot | null | undefined,
  decisionDepth?: DecisionDepth,
): {
  decisionState: DecisionState | undefined;
  gateRealityPolicy: GateRealityPolicyMeta;
} {
  const load = resolveRealityLoadView(rorSnapshot ?? null, { purpose: 'GATE' });
  const gateRealityPolicy: GateRealityPolicyMeta = {
    mode: 'CANONICAL_ONLY',
    latentInjected: false,
    source: rorSnapshot ? 'ROR' : 'DSO_DERIVED',
    observationId: rorSnapshot?.observationId,
    activatedLatentCount: 0,
    loadMode: load.mode,
  };

  if (!decisionState) {
    return { decisionState, gateRealityPolicy };
  }

  if (rorSnapshot?.decisionSnapshot) {
    return {
      decisionState: attachRealityCognition(decisionState, {
        preferredSnapshot: rorSnapshot.decisionSnapshot,
        decisionDepth,
      }),
      gateRealityPolicy,
    };
  }

  return { decisionState, gateRealityPolicy };
}

/** 审计：Gate 路径不得激活任何 latent */
export function assertNoLatentForGate(rorSnapshot: RorRealitySnapshot | null | undefined): {
  ok: boolean;
  violations: string[];
} {
  if (!rorSnapshot) return { ok: true, violations: [] };
  const violations = rorSnapshot.latentHypotheses
    .filter((h) => canActivateLatentForConsumer(h, 'GATE'))
    .map((h) => h.key);
  return { ok: violations.length === 0, violations };
}
