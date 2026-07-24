/**
 * Block authorize/execute of OR-Tools-sourced candidates when canary is off,
 * trip/op out of scope, or evidence went stale after evaluate.
 */

import { BadRequestException } from '@nestjs/common';
import type { Rfc001RepairCandidate } from '../../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import { evaluateOrtToolsAuthorityCanaryGate } from '../ortools-authority-canary.gate';
import { resolveAuthoritativeRepairProviderForRequest } from '../ortools-authority-canary.gate';
import { selectUsableOrtToolsEvaluateShadow } from '../ortools-shadow-evidence-freshness.util';
import { drillIdempotentPlanVersionWrite } from './rollback-drill-scenarios';
import type { OrToolsCanaryDashboardCollector } from '../../observability/ortools-canary-dashboard.metrics';

export const ORTOOLS_REPAIR_GENERATOR_MARKER = 'ortools-repair';

export function isOrtToolsRepairCandidate(
  candidate: Pick<Rfc001RepairCandidate, 'generatorVersion'> | undefined,
): boolean {
  if (!candidate?.generatorVersion) return false;
  return candidate.generatorVersion.includes(ORTOOLS_REPAIR_GENERATOR_MARKER);
}

export type OrtToolsCanaryAuthRejectCode =
  | 'ORTOOLS_CANARY_DISABLED'
  | 'ORTOOLS_OUT_OF_SCOPE'
  | 'ORTOOLS_EVIDENCE_STALE'
  | 'ORTOOLS_NOT_MERGED';

export class OrtToolsCanaryAuthorizationError extends BadRequestException {
  constructor(
    public readonly rejectCode: OrtToolsCanaryAuthRejectCode,
    message: string,
  ) {
    super({ rejectCode, message });
  }
}

export interface OrtToolsCanaryAuthContext {
  tripId: string;
  candidateId: string;
  candidate?: Rfc001RepairCandidate;
  /** Workspace ortoolsShadow attachment */
  ortoolsShadow?: {
    evidenceVersionId?: string;
    snapshotId?: string;
    shadowAuthority?: boolean;
    canary?: {
      mergedIntoRepairCandidates?: boolean;
      operation?: string;
      authoritativeProviderId?: string;
    };
    solverOperation?: string;
  } | null;
  currentEvidenceVersionId?: string | null;
  phase: 'authorize' | 'execute';
  dashboard?: OrToolsCanaryDashboardCollector;
}

/**
 * No-op for Neptune candidates. Throws if OR-Tools candidate is no longer allowed.
 */
export function assertOrtToolsCanaryAllowsAuthorizeOrExecute(
  ctx: OrtToolsCanaryAuthContext,
): void {
  if (!isOrtToolsRepairCandidate(ctx.candidate)) return;

  const operation =
    ctx.ortoolsShadow?.canary?.operation ??
    ctx.ortoolsShadow?.solverOperation ??
    'REROUTE';

  const gate = evaluateOrtToolsAuthorityCanaryGate();
  const provider = resolveAuthoritativeRepairProviderForRequest({
    tripId: ctx.tripId,
    operation,
    gate,
  });

  if (!gate.authoritativePromotion || provider !== 'ortools-repair') {
    recordReject(ctx, 'ORTOOLS_CANARY_DISABLED', operation);
    throw new OrtToolsCanaryAuthorizationError(
      'ORTOOLS_CANARY_DISABLED',
      `OR-Tools candidate ${ctx.candidateId} rejected at ${ctx.phase}: canary offline or out of scope — use Neptune`,
    );
  }

  if (ctx.ortoolsShadow?.canary?.mergedIntoRepairCandidates !== true) {
    recordReject(ctx, 'ORTOOLS_NOT_MERGED', operation);
    throw new OrtToolsCanaryAuthorizationError(
      'ORTOOLS_NOT_MERGED',
      `OR-Tools candidate ${ctx.candidateId} was never merged into authority set`,
    );
  }

  const usable = selectUsableOrtToolsEvaluateShadow({
    attachment: ctx.ortoolsShadow ?? undefined,
    currentEvidenceVersionId: ctx.currentEvidenceVersionId,
    currentSnapshotId: ctx.currentEvidenceVersionId,
  });
  if (!usable) {
    recordReject(ctx, 'ORTOOLS_EVIDENCE_STALE', operation);
    throw new OrtToolsCanaryAuthorizationError(
      'ORTOOLS_EVIDENCE_STALE',
      `OR-Tools candidate ${ctx.candidateId} void: evidence changed since evaluate`,
    );
  }
}

function recordReject(
  ctx: OrtToolsCanaryAuthContext,
  code: OrtToolsCanaryAuthRejectCode,
  operation: string,
): void {
  ctx.dashboard?.record({
    decisionId: `${ctx.phase}:${ctx.tripId}:${ctx.candidateId}`,
    tripId: ctx.tripId,
    operation,
    at: new Date().toISOString(),
    candidateProvider: 'ortools-repair',
    decisionAuthority: 'decision-runtime',
    writeAuthorizer: 'ortools-canary-authorization.guard',
    fallbackProvider: 'neptune-repair',
    decisionResult: 'REJECT',
    rollbackReason: code,
    outcomes: {
      gatewayBypass: false,
      unauthorizedPlanVersionWrite: false,
      evidenceStaleContinued: code === 'ORTOOLS_EVIDENCE_STALE',
      bookedContentMutated: false,
      autoFallbackFailed: false,
      fellBackToNeptune: true,
      candidateAccepted: false,
    },
  });
}

/** Shared helper for createPending idempotency (aligns lab drill + store). */
export function resolveIdempotentPendingPlanVersionId(input: {
  tripId: string;
  decisionId: string;
  proposedPlanVersionId: string;
  existingPlanVersionId?: string;
}): { planVersionId: string; duplicate: boolean } {
  if (input.existingPlanVersionId) {
    const r = drillIdempotentPlanVersionWrite({
      decisionId: input.decisionId,
      proposedPlanVersionId: input.proposedPlanVersionId,
      priorWrites: [
        {
          decisionId: input.decisionId,
          planVersionId: input.existingPlanVersionId,
        },
      ],
    });
    return { planVersionId: r.planVersionId, duplicate: r.duplicate };
  }
  const r = drillIdempotentPlanVersionWrite({
    decisionId: input.decisionId,
    proposedPlanVersionId: input.proposedPlanVersionId,
    priorWrites: [],
  });
  return { planVersionId: r.planVersionId, duplicate: false };
}
