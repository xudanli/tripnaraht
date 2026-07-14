/**
 * M4-RA-01 — wire scoped authority + canary dashboard onto evaluate main-chain.
 *
 * Default (Release BLOCKED): Neptune-only repairCandidates; OR-Tools stays observational.
 * When Release Authorized + trip/op in scope: Gateway-PASS OR-Tools candidates may join
 * the authority candidate set. Attachment.shadowAuthority remains false (writes still
 * require Decision Runtime / Gateway — ADR-008).
 */

import { createHash } from 'crypto';
import type { Rfc001RepairCandidate } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import {
  evaluateOrtToolsAuthorityCanaryGate,
  resolveAuthoritativeRepairProviderForRequest,
  type OrtToolsAuthorityGateReport,
} from '../lab/ortools-authority-canary.gate';
import {
  isTripInSelectedCanary,
  loadApprovedAuthorityPackage,
  resolveCanaryStage,
} from '../lab/planning-signoff/selected-trips-canary';
import type { AuthorityApprovalPackage } from '../lab/planning-signoff/authority-package.types';
import type { OrtToolsEvaluateShadowAttachment } from '../bridge/ortools-road-evaluate-shadow.bridge';
import type {
  CanaryDecisionTrace,
  OrToolsCanaryDashboardCollector,
} from './ortools-canary-dashboard.metrics';

export type OrtToolsEvaluateCanaryMeta =
  import('../bridge/ortools-road-evaluate-shadow.bridge').OrtToolsEvaluateCanaryAttachmentMeta;

export interface WireOrtToolsEvaluateCanaryResult {
  repairCandidates: Rfc001RepairCandidate[];
  ortoolsShadow: OrtToolsEvaluateShadowAttachment & {
    canary?: OrtToolsEvaluateCanaryMeta;
  };
  meta: OrtToolsEvaluateCanaryMeta;
}

function tokenFingerprint(token: string | undefined): string | undefined {
  if (!token) return undefined;
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function gatewayAllows(
  attachment: OrtToolsEvaluateShadowAttachment,
  candidateId: string,
): boolean {
  const g = attachment.gatewayByCandidateId[candidateId];
  if (!g) return false;
  const s = (g.overallStatus ?? '').toUpperCase();
  return s === 'PASS' || s === 'OK' || s === 'ALLOW' || s === 'ALLOWED';
}

/**
 * Apply canary policy after shadow bridge. Safe no-op when gate is blocked.
 */
export function wireOrtToolsEvaluateCanary(input: {
  tripId: string;
  operation: string;
  planVersionId?: string;
  evidenceVersionAtSolve?: string;
  evidenceVersionAtExecute?: string;
  neptuneCandidates: Rfc001RepairCandidate[];
  ortoolsShadow: OrtToolsEvaluateShadowAttachment;
  dashboard?: OrToolsCanaryDashboardCollector;
  gate?: OrtToolsAuthorityGateReport;
  /** Override approved package (tests / gate override seams) */
  pkg?: AuthorityApprovalPackage;
  startedAtMs?: number;
}): WireOrtToolsEvaluateCanaryResult {
  const started = input.startedAtMs ?? Date.now();
  const gate = input.gate ?? evaluateOrtToolsAuthorityCanaryGate();
  const stage = resolveCanaryStage();
  const operation = (input.operation || 'REROUTE').toUpperCase();
  const whitelistMatched = isTripInSelectedCanary(input.tripId);
  const pkg = input.pkg ?? loadApprovedAuthorityPackage();

  const authoritativeProviderId = resolveAuthoritativeRepairProviderForRequest({
    tripId: input.tripId,
    operation,
    gate,
    pkg,
  });

  const merge =
    authoritativeProviderId === 'ortools-repair' &&
    gate.authoritativePromotion === true &&
    (input.ortoolsShadow.shadowRepairCandidates?.length ?? 0) > 0;

  const mergedIds: string[] = [];
  let repairCandidates = [...input.neptuneCandidates];

  if (merge) {
    const ortoolsPass = input.ortoolsShadow.shadowRepairCandidates.filter((c) =>
      gatewayAllows(input.ortoolsShadow, c.candidateId),
    );
    // Prefer OR-Tools Gateway-PASS candidates first, then Neptune (no id dupes)
    const seen = new Set<string>();
    const merged: Rfc001RepairCandidate[] = [];
    for (const c of ortoolsPass) {
      if (seen.has(c.candidateId)) continue;
      seen.add(c.candidateId);
      merged.push(c);
      mergedIds.push(c.candidateId);
    }
    for (const c of input.neptuneCandidates) {
      if (seen.has(c.candidateId)) continue;
      seen.add(c.candidateId);
      merged.push(c);
    }
    repairCandidates = merged;
  }

  const meta: OrtToolsEvaluateCanaryMeta = {
    canaryStage: stage,
    authoritativeProviderId,
    whitelistMatched,
    operation,
    authorityArtifactId: gate.signoffBundleDate
      ? `planning-signoff:${gate.signoffBundleDate}`
      : undefined,
    authorityTokenId: tokenFingerprint(process.env.OR_TOOLS_AUTHORITY_TOKEN),
    gateAuthoritativePromotion: gate.authoritativePromotion,
    mergedIntoRepairCandidates: merge,
    mergedCandidateIds: mergedIds,
  };

  const gatewayStatuses = Object.values(
    input.ortoolsShadow.gatewayByCandidateId ?? {},
  );
  const anyBlock = gatewayStatuses.some((g) =>
    ['BLOCK', 'FAIL', 'REJECTED'].includes((g.overallStatus ?? '').toUpperCase()),
  );
  const anyPass = gatewayStatuses.some((g) => gatewayAllows(input.ortoolsShadow, g.candidateId));

  const evidenceSolve =
    input.evidenceVersionAtSolve ?? input.ortoolsShadow.evidenceVersionId;
  const evidenceExec =
    input.evidenceVersionAtExecute ?? evidenceSolve;
  const staleContinued =
    Boolean(evidenceSolve) &&
    Boolean(evidenceExec) &&
    evidenceSolve !== evidenceExec &&
    merge;

  const trace: CanaryDecisionTrace = {
    decisionId: `eval:${input.tripId}:${started}`,
    tripId: input.tripId,
    operation,
    at: new Date().toISOString(),
    canaryStage: stage,
    whitelistMatched,
    authorityArtifactId: meta.authorityArtifactId,
    authorityTokenId: meta.authorityTokenId,
    candidateProvider: authoritativeProviderId,
    decisionAuthority: 'decision-runtime',
    writeAuthorizer: 'constraint-evaluation-gateway',
    fallbackProvider: 'neptune-repair',
    gatewayResult: anyBlock ? 'BLOCK' : anyPass ? 'PASS' : 'SKIP',
    decisionResult: merge
      ? 'ACCEPT'
      : authoritativeProviderId === 'neptune-repair'
        ? 'FALLBACK'
        : 'REJECT',
    evidenceVersionAtSolve: evidenceSolve,
    evidenceVersionAtExecute: evidenceExec,
    planVersionId: input.planVersionId,
    rollbackReason:
      authoritativeProviderId === 'neptune-repair' &&
      gate.authoritativePromotion === false
        ? 'release_gate_blocked'
        : authoritativeProviderId === 'neptune-repair' && !whitelistMatched
          ? 'trip_not_whitelisted_or_op_out_of_scope'
          : undefined,
    elapsedMs: Date.now() - started,
    outcomes: {
      gatewayBypass: false,
      unauthorizedPlanVersionWrite: false,
      evidenceStaleContinued: staleContinued,
      bookedContentMutated: false,
      autoFallbackFailed: false,
      duplicatePlanVersion: false,
      fellBackToNeptune: authoritativeProviderId === 'neptune-repair',
      candidateAccepted: merge,
      localityOk: true,
      revalidatedAfterWrite: undefined,
    },
  };
  input.dashboard?.record(trace);

  return {
    repairCandidates,
    ortoolsShadow: {
      ...input.ortoolsShadow,
      // Keep false — Plan Version write authority stays Decision Runtime
      shadowAuthority: false,
      report: {
        ...input.ortoolsShadow.report,
        authorityProviderId: authoritativeProviderId,
      },
      canary: meta,
    },
    meta,
  };
}
