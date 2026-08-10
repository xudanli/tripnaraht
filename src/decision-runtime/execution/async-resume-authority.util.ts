import { createHash } from 'crypto';
import type { RouteAndRunRequestDto } from '../../agent/dto/route-and-run.dto';
import type {
  AsyncAuthorityDenialReasonCode,
  AsyncMutationGuardPayloadV1,
  DurableAuthoritySnapshotV1,
} from './durable-authority-snapshot-v1.types';
import { buildAuthorityAuditTrace } from './build-authority-audit-trace.util';
import type { AuthorityAuditTraceV1 } from './authority-audit-trace-v1.types';

/** Default evidence TTL for async planning tasks (90 min). */
export const DEFAULT_ASYNC_EVIDENCE_TTL_MS = 90 * 60 * 1000;

export function resolveAsyncMutationWriteGuardMode(): 'OFF' | 'SHADOW' | 'ENFORCE' {
  const raw = process.env.ASYNC_MUTATION_WRITE_GUARD?.trim().toUpperCase();
  if (raw === 'OFF' || raw === '0' || raw === 'FALSE') return 'OFF';
  if (raw === 'SHADOW') return 'SHADOW';
  return 'ENFORCE';
}

export function isAsyncMutationWriteGuardActive(): boolean {
  return resolveAsyncMutationWriteGuardMode() !== 'OFF';
}

export function isAsyncMutationWriteGuardEnforce(): boolean {
  return resolveAsyncMutationWriteGuardMode() === 'ENFORCE';
}

function digestEvidence(snapshotId: string, capturedAt: string): string {
  return createHash('sha256').update(`${snapshotId}:${capturedAt}`).digest('hex').slice(0, 16);
}

export function buildDurableAuthoritySnapshotV1(input: {
  request: RouteAndRunRequestDto;
  serverTripVersion?: number;
  memorySnapshotId?: string;
  decisionId?: string;
  constraintEvaluationId?: string;
  evidenceTtlMs?: number;
  now?: Date;
}): DurableAuthoritySnapshotV1 | null {
  const tripId = input.request.trip_id?.trim();
  if (!tripId) return null;

  const clientRaw = input.request.options?.client_dso_version;
  const clientVersion =
    clientRaw !== undefined && Number.isFinite(Number(clientRaw))
      ? Math.floor(Number(clientRaw))
      : undefined;
  const expectedTripVersion = input.serverTripVersion ?? clientVersion;
  if (expectedTripVersion === undefined || !Number.isFinite(expectedTripVersion)) {
    return null;
  }

  const now = input.now ?? new Date();
  const capturedAt = now.toISOString();
  const ttl = input.evidenceTtlMs ?? DEFAULT_ASYNC_EVIDENCE_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const memorySnapshotVersion =
    input.memorySnapshotId?.trim() ||
    input.request.options?.orchestration_replay_anchor_snapshot_id?.trim() ||
    `mem:${input.request.request_id}`;

  const evidenceSnapshotId =
    input.request.options?.orchestration_replay_anchor_snapshot_id?.trim() ||
    `evidence:${input.request.request_id}:${now.getTime()}`;

  return {
    schemaId: 'tripnara.durable_authority_snapshot@v1',
    tripId,
    expectedTripVersion: Math.floor(expectedTripVersion),
    decisionId: input.decisionId,
    memorySnapshotVersion,
    evidenceSnapshot: {
      snapshotId: evidenceSnapshotId,
      capturedAt,
      expiresAt,
      digest: digestEvidence(evidenceSnapshotId, capturedAt),
    },
    constraintEvaluationId: input.constraintEvaluationId,
    frozenAt: capturedAt,
  };
}

export type AsyncAuthorityValidationInput = {
  snapshot: DurableAuthoritySnapshotV1 | null | undefined;
  currentTripVersion?: number;
  nowMs?: number;
  stage: 'resume' | 'commit';
};

export type AsyncAuthorityValidationResult = {
  allowed: boolean;
  reasonCodes: AsyncAuthorityDenialReasonCode[];
  auditTrace: AuthorityAuditTraceV1;
  guardPayload?: AsyncMutationGuardPayloadV1;
};

function buildDeniedGuardPayload(
  snapshot: DurableAuthoritySnapshotV1 | null | undefined,
  stage: 'resume' | 'commit',
  reasonCodes: AsyncAuthorityDenialReasonCode[],
): AsyncMutationGuardPayloadV1 {
  const stale = reasonCodes.includes('STALE_PLAN_VERSION') || reasonCodes.includes('EXECUTION_CONFLICT');
  const expired = reasonCodes.includes('EVIDENCE_SNAPSHOT_EXPIRED');

  return {
    schemaId: 'tripnara.async_mutation_guard@v1',
    canCommit: false,
    stage,
    reasonCodes,
    userMessage: stale
      ? '行程已被更新，异步任务结果无法提交，请刷新后重新规划。'
      : expired
        ? '支撑证据已过期，异步任务结果无法提交，请重新发起规划。'
        : '异步任务缺少完整权威快照，无法提交行程修改。',
    statusV2: {
      execution: { status: stage === 'commit' ? 'SUCCEEDED' : 'FAILED' },
      decision: { status: 'CONFLICTED' },
      freshness: { status: expired ? 'EXPIRED' : stale ? 'STALE' : 'PENDING_VERIFICATION' },
      action: { status: 'BLOCKED' },
    },
    authoritySnapshot: snapshot ?? undefined,
  };
}

export function validateAsyncAuthority(input: AsyncAuthorityValidationInput): AsyncAuthorityValidationResult {
  const nowMs = input.nowMs ?? Date.now();
  const reasonCodes: AsyncAuthorityDenialReasonCode[] = [];
  const snapshot = input.snapshot;

  if (!snapshot?.tripId?.trim()) {
    reasonCodes.push('AUTHORITY_SNAPSHOT_INCOMPLETE');
  } else {
    if (input.currentTripVersion === undefined) {
      if (input.stage === 'commit') {
        reasonCodes.push('TRIP_VERSION_UNAVAILABLE');
      }
    } else if (input.currentTripVersion !== snapshot.expectedTripVersion) {
      reasonCodes.push(input.stage === 'commit' ? 'EXECUTION_CONFLICT' : 'STALE_PLAN_VERSION');
    }

    const exp = snapshot.evidenceSnapshot?.expiresAt;
    if (exp && nowMs >= Date.parse(exp)) {
      reasonCodes.push('EVIDENCE_SNAPSHOT_EXPIRED');
    }
  }

  const unique = [...new Set(reasonCodes)];
  const allowed = unique.length === 0;

  const evidenceFreshness =
    unique.includes('EVIDENCE_SNAPSHOT_EXPIRED')
      ? 'EXPIRED'
      : unique.includes('STALE_PLAN_VERSION') || unique.includes('EXECUTION_CONFLICT')
        ? 'STALE'
        : 'CURRENT';

  const auditTrace = buildAuthorityAuditTrace({
    routeClass: 'ASYNC_WORKER',
    orchestrationMode: 'ASYNC',
    mutationIntent: Boolean(snapshot?.tripId),
    mutationAttempted: true,
    mutationCommitted: false,
    constraintGatewayRequired: true,
    decisionRequired: true,
    decisionId: snapshot?.decisionId,
    expectedTripVersion: snapshot?.expectedTripVersion,
    actualTripVersion: input.currentTripVersion,
    evidenceSnapshotId: snapshot?.evidenceSnapshot?.snapshotId,
    evidenceFreshness,
    reasonCodes: unique,
  });

  if (allowed) {
    return { allowed: true, reasonCodes: [], auditTrace };
  }

  return {
    allowed: false,
    reasonCodes: unique,
    auditTrace,
    guardPayload: buildDeniedGuardPayload(snapshot, input.stage, unique),
  };
}

export function detectAsyncMutationIntent(
  request: RouteAndRunRequestDto,
  response: import('../../agent/dto/route-and-run.dto').RouteAndRunResponseDto,
): boolean {
  const tripId = request.trip_id?.trim();
  if (!tripId) return false;
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  const timeline = payload?.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0) return false;

  /**
   * Chat / ITINERARY_ADJUST 常以 ADVICE_ONLY 草案附带 timeline，并不提交写库。
   * 此时不应走 async mutation commit 闸门，否则缺 DSO version 会把
   * 「缺少完整权威快照」拼进用户可见 answer_text。
   */
  const adjust = payload?.itinerary_adjust_result as
    | { execution_mode?: string; applied?: boolean }
    | undefined;
  const mode = String(adjust?.execution_mode ?? '').toUpperCase();
  if (adjust && (mode === 'ADVICE_ONLY' || mode === '') && adjust.applied !== true) {
    return false;
  }

  return true;
}
