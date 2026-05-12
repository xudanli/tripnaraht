/**
 * Build P3 ReplayPersistenceRecord from route_and_run observability (unified_state when present).
 */

import { createHash } from 'crypto';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import type { ReplayArtifactDescriptor } from '../contracts/replay-artifact-descriptor.types';
import type {
  ArtifactEvolutionRecord,
  PartialRecomputeScope,
  ReplayPersistenceRecord,
  RuntimeReplayAdmissionPath,
} from './runtime-persistence.types';
import type { UnifiedRuntimeState } from './runtime-state.types';
import type { RuntimeObservabilitySlice } from './runtime-observability-slice.types';
import { extractExecutionDecisionFromObservability } from './runtime-ecps-decision.extract';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function phiDigestFromUnifiedState(us: UnifiedRuntimeState): string {
  const phi = us.phi;
  const particles = phi?.particles
    ? [...phi.particles]
        .sort((a, b) => String(a.agentId).localeCompare(String(b.agentId)))
        .map((p) => ({ agentId: p.agentId, phi: p.phi }))
    : null;
  const canonical = JSON.stringify({
    q: us.queryId,
    t: us.tickId ?? null,
    p: particles,
    k: us.kThetaFingerprint,
    a: [...us.artifactRefs].sort(),
    e: us.executionGraphNodeId ?? null,
  });
  return sha256Hex(canonical);
}

function certificateDigestFrom(cert: ExecutionCertificate): string {
  const payload = JSON.stringify({
    k: cert.kThetaTrace.kernelFingerprint,
    h: cert.piProof?.holds,
    sx: cert.phiExec?.timeStep,
  });
  return sha256Hex(payload);
}

function fallbackPhiDigest(
  request: RouteAndRunRequestDto,
  requestHash: string,
  response: RouteAndRunResponseDto,
): string {
  const route =
    typeof response.route?.route === 'string'
      ? response.route.route
      : String((response.route?.route as unknown) ?? '');
  return sha256Hex(
    JSON.stringify({
      rid: request.request_id,
      rh: requestHash,
      route: route.trim(),
    }),
  );
}

function fallbackArtifactRefs(request: RouteAndRunRequestDto): string[] {
  const refs: string[] = [];
  const tid = request.trip_id?.trim();
  if (tid) refs.push(tid);
  refs.push(request.request_id);
  return [...new Set(refs)].sort();
}

function partialRecomputeScopeFromEcps(
  d: ExecutionDecision | undefined,
  artifactRefs: string[],
): PartialRecomputeScope | undefined {
  if (!d || d.invalidationScope === 'NONE') return undefined;
  const invalidation = d.invalidationScope === 'FULL' ? 'FULL' : 'PARTIAL';
  return {
    artifactIds: [...artifactRefs],
    invalidation,
    reason: `ecps:${d.mode}`,
  };
}

function artifactEvolutionFromObservability(
  obs: Record<string, unknown> | undefined,
): ArtifactEvolutionRecord | undefined {
  const desc = obs?.replay_artifact_descriptor as ReplayArtifactDescriptor | undefined;
  const aid = desc?.artifactIdentity?.artifactId;
  if (!aid) return undefined;
  return {
    artifactId: aid,
    version: 1,
  };
}

/**
 * Snapshot id: content-addressed over admission path + materialization + dedup hash + time.
 */
export function buildReplayPersistenceRecord(params: {
  request: RouteAndRunRequestDto;
  requestHash: string;
  response: RouteAndRunResponseDto;
  createdAtMs: number;
  admissionPath: RuntimeReplayAdmissionPath;
}): ReplayPersistenceRecord {
  const { request, requestHash, response, createdAtMs, admissionPath } = params;
  const obs = response.observability as Record<string, unknown> | undefined;
  const rm = obs?.runtime_materialization as RuntimeObservabilitySlice | undefined;
  const us = rm?.unified_state as UnifiedRuntimeState | undefined;

  let phiDigest: string;
  let certificateDigest: string | undefined;
  let artifactRefs: string[];

  if (us) {
    phiDigest = phiDigestFromUnifiedState(us);
    certificateDigest = us.proofCertificate
      ? certificateDigestFrom(us.proofCertificate)
      : undefined;
    artifactRefs = [...us.artifactRefs];
  } else {
    phiDigest = fallbackPhiDigest(request, requestHash, response);
    artifactRefs = fallbackArtifactRefs(request);
  }

  const desc = obs?.replay_artifact_descriptor as
    | { artifactIdentity?: { artifactId?: string } }
    | undefined;
  const aid = desc?.artifactIdentity?.artifactId;
  if (aid) {
    const set = new Set(artifactRefs);
    set.add(aid);
    artifactRefs = [...set].sort();
  }

  const ecps = extractExecutionDecisionFromObservability(
    response.observability as RouteAndRunResponseDto['observability'],
  );
  const partialRecomputeScope = partialRecomputeScopeFromEcps(ecps, artifactRefs);
  const artifactEvolution = artifactEvolutionFromObservability(obs);

  const snapshotId = sha256Hex(
    `${admissionPath}|${request.request_id}|${requestHash}|${phiDigest}|${certificateDigest ?? ''}|${artifactRefs.join('|')}|${createdAtMs}`,
  );

  return {
    snapshotId,
    queryId: request.request_id,
    admissionPath,
    phiDigest,
    certificateDigest,
    artifactRefs,
    createdAtMs,
    partialRecomputeScope,
    artifactEvolution,
  };
}

/** Fresh route_and_run success finalize — same digest rules, admission locked to FRESH_FINALIZE. */
export function buildReplayPersistenceRecordFromFreshFinalize(params: {
  request: RouteAndRunRequestDto;
  requestHash: string;
  response: RouteAndRunResponseDto;
  createdAtMs: number;
}): ReplayPersistenceRecord {
  return buildReplayPersistenceRecord({ ...params, admissionPath: 'FRESH_FINALIZE' });
}
