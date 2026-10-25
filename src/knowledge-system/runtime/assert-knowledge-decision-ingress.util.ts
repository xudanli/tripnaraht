/**
 * Decision ingress audit — Snapshot SSOT + ETC + Vector≠HARD BLOCK.
 * Does not invent a third decision stack; composes existing guards.
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import type { EffectiveTravelerContextV1 } from '../../travel-memory/effective-context/effective-traveler-context.types';
import { resolveEffectiveTravelerContextConsumeMode } from '../../travel-memory/effective-context/resolve-etc-consume-mode.util';
import {
  assertDecisionConsumerUsesSnapshot,
  WorldStateSsotViolationError,
  type SsotConsumer,
} from '../world-state/snapshot-ssot.guard.util';
import {
  assertGateReadsEffectiveTravelerContext,
  TravelerContextSsotViolationError,
} from '../traveler-context/etc-ssot.guard.util';
import {
  assertVectorMustNotHardBlock,
  VectorHardBlockViolationError,
} from '../semantic/vector-hard-block.guard.util';
import {
  resolveKnowledgeRuntimeSsotEnforceMode,
  type KnowledgeRuntimeSsotEnforceMode,
} from './resolve-knowledge-ssot-enforce-mode.util';

export type KnowledgeDecisionIngressAudit = {
  consumer: SsotConsumer;
  enforceMode: KnowledgeRuntimeSsotEnforceMode;
  etcConsumeMode: 'off' | 'shadow' | 'active';
  ok: boolean;
  violations: string[];
  checks: {
    snapshotSsot: 'pass' | 'fail' | 'skip';
    etcSsot: 'pass' | 'fail' | 'skip';
    vectorHardBlockBan: 'pass' | 'fail';
  };
};

export class KnowledgeRuntimeSsotViolationError extends Error {
  constructor(
    message: string,
    public readonly audit: KnowledgeDecisionIngressAudit,
  ) {
    super(message);
    this.name = 'KnowledgeRuntimeSsotViolationError';
  }
}

export type KnowledgeDecisionIngressInput = {
  consumer: SsotConsumer;
  /** Canonical snapshot when Gate/Constraint claims world SSOT */
  snapshot?: CanonicalWorldStateSnapshot | null;
  /** @deprecated legacy — fail if present without snapshot */
  worldModelContext?: unknown;
  /** Require snapshot check (default: true when snapshot or worldModelContext provided) */
  requireSnapshot?: boolean;
  effectiveTravelerContext?: EffectiveTravelerContextV1 | null;
  memoryOsDirect?: unknown;
  tripMetadataDirect?: unknown;
  /** Require ETC when EFFECTIVE_TRAVELER_CONTEXT_CONSUME=active (default true) */
  requireEtcWhenActive?: boolean;
  hardBlockFromVector?: boolean;
  vectorSimilarityAsBlockThreshold?: number | null;
  env?: NodeJS.ProcessEnv;
};

/**
 * Audit (and optionally enforce) Knowledge SSOT at decision ingress.
 */
export function auditKnowledgeDecisionIngress(
  input: KnowledgeDecisionIngressInput,
): KnowledgeDecisionIngressAudit {
  const enforceMode = resolveKnowledgeRuntimeSsotEnforceMode(input.env);
  const etcConsumeMode = resolveEffectiveTravelerContextConsumeMode(input.env);
  const violations: string[] = [];
  const checks: KnowledgeDecisionIngressAudit['checks'] = {
    snapshotSsot: 'skip',
    etcSsot: 'skip',
    vectorHardBlockBan: 'pass',
  };

  const shouldCheckSnapshot =
    input.requireSnapshot === true ||
    input.snapshot != null ||
    input.worldModelContext != null;

  if (shouldCheckSnapshot) {
    try {
      assertDecisionConsumerUsesSnapshot(input.consumer, {
        snapshot: input.snapshot,
        worldModelContext: input.worldModelContext,
      });
      checks.snapshotSsot = 'pass';
    } catch (e) {
      checks.snapshotSsot = 'fail';
      violations.push(e instanceof Error ? e.message : String(e));
    }
  }

  const requireEtc =
    (input.requireEtcWhenActive !== false && etcConsumeMode === 'active') ||
    input.effectiveTravelerContext != null ||
    input.memoryOsDirect != null ||
    input.tripMetadataDirect != null;

  if (requireEtc) {
    try {
      assertGateReadsEffectiveTravelerContext(input.consumer, {
        effectiveTravelerContext: input.effectiveTravelerContext,
        memoryOsDirect: input.memoryOsDirect,
        tripMetadataDirect: input.tripMetadataDirect,
      });
      checks.etcSsot = 'pass';
    } catch (e) {
      checks.etcSsot = 'fail';
      violations.push(e instanceof Error ? e.message : String(e));
    }
  }

  try {
    assertVectorMustNotHardBlock({
      consumer: input.consumer,
      hardBlockFromVector: input.hardBlockFromVector,
      vectorSimilarityAsBlockThreshold: input.vectorSimilarityAsBlockThreshold,
    });
  } catch (e) {
    checks.vectorHardBlockBan = 'fail';
    violations.push(e instanceof Error ? e.message : String(e));
  }

  return {
    consumer: input.consumer,
    enforceMode,
    etcConsumeMode,
    ok: violations.length === 0,
    violations,
    checks,
  };
}

/**
 * Run audit; throw when enforce=active and violations exist.
 * shadow: returns audit for logging; off: returns audit without throw.
 */
export function enforceKnowledgeDecisionIngress(
  input: KnowledgeDecisionIngressInput,
): KnowledgeDecisionIngressAudit {
  const audit = auditKnowledgeDecisionIngress(input);
  if (!audit.ok && audit.enforceMode === 'active') {
    throw new KnowledgeRuntimeSsotViolationError(
      `[KnowledgeRuntimeSSOT] ${audit.consumer}: ${audit.violations.join(' | ')}`,
      audit,
    );
  }
  return audit;
}

export {
  WorldStateSsotViolationError,
  TravelerContextSsotViolationError,
  VectorHardBlockViolationError,
};
