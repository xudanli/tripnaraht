import {
  buildDurableAuthoritySnapshotV1,
  validateAsyncAuthority,
  DEFAULT_ASYNC_EVIDENCE_TTL_MS,
} from './async-resume-authority.util';
import { applyAsyncMutationCommitGuard } from './async-mutation-commit.adapter';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';

function baseRequest(): RouteAndRunRequestDto {
  return {
    request_id: 'req_async_1',
    user_id: 'u1',
    trip_id: 'trip_async_1',
    message: '重规划全程',
    options: { client_dso_version: 12 },
  };
}

function asyncResponseWithTimeline(): RouteAndRunResponseDto {
  return {
    request_id: 'req_async_1',
    route: { route: 'SYSTEM2', confidence: 0.8, reasons: [] },
    result: {
      status: 'OK',
      answer_text: 'async plan',
      payload: {
        timeline: [{ day: 1, items: [] }],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
      },
    },
    explain: { decision_log: [] },
    observability: {},
  };
}

describe('async-resume-authority', () => {
  const prevGuard = process.env.ASYNC_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.ASYNC_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.ASYNC_MUTATION_WRITE_GUARD;
    else process.env.ASYNC_MUTATION_WRITE_GUARD = prevGuard;
  });

  it('builds durable authority snapshot at task start', () => {
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
    });
    expect(snapshot?.expectedTripVersion).toBe(12);
    expect(snapshot?.evidenceSnapshot.snapshotId).toBeTruthy();
    expect(snapshot?.evidenceSnapshot.expiresAt).toBeTruthy();
  });

  it('resume rejects stale trip version', () => {
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
    })!;
    const result = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 13,
      stage: 'resume',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain('STALE_PLAN_VERSION');
  });

  it('commit rejects EXECUTION_CONFLICT when version changed after long run', () => {
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
    })!;
    const result = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 13,
      stage: 'commit',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain('EXECUTION_CONFLICT');
  });

  it('commit rejects expired evidence snapshot', () => {
    const now = new Date();
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
      evidenceTtlMs: 1000,
      now,
    })!;
    const result = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 12,
      nowMs: now.getTime() + DEFAULT_ASYNC_EVIDENCE_TTL_MS + 5000,
      stage: 'commit',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain('EVIDENCE_SNAPSHOT_EXPIRED');
  });

  it('applyAsyncMutationCommitGuard blocks commit and sets BLOCKED action', () => {
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
    })!;
    const guarded = applyAsyncMutationCommitGuard({
      request: baseRequest(),
      response: asyncResponseWithTimeline(),
      authoritySnapshot: snapshot,
      currentTripVersion: 14,
      stage: 'commit',
    });
    const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
    expect(guardPayload?.canCommit).toBe(false);
    expect(guardPayload?.reasonCodes).toContain('EXECUTION_CONFLICT');
    expect(guardPayload?.statusV2?.action?.status).toBe('BLOCKED');
    expect(guardPayload?.statusV2?.decision?.status).toBe('CONFLICTED');
  });

  it('ADVICE_ONLY itinerary_adjust draft does not append authority failure to answer_text', () => {
    const response: RouteAndRunResponseDto = {
      ...asyncResponseWithTimeline(),
      result: {
        ...asyncResponseWithTimeline().result,
        answer_text: '按您的改排要求，只调整了第 6 天。',
        payload: {
          ...asyncResponseWithTimeline().result.payload,
          itinerary_adjust_result: {
            execution_mode: 'ADVICE_ONLY',
            applied: false,
            target_date_iso: '2026-08-20',
          },
        },
      },
    };
    const guarded = applyAsyncMutationCommitGuard({
      request: baseRequest(),
      response,
      authoritySnapshot: null,
      currentTripVersion: undefined,
      stage: 'commit',
    });
    expect(guarded.result.answer_text).toBe('按您的改排要求，只调整了第 6 天。');
    expect((guarded.result.payload as any)?.canonical_mutation_guard).toBeUndefined();
  });

  it('commit allows when version and evidence still valid', () => {
    const snapshot = buildDurableAuthoritySnapshotV1({
      request: baseRequest(),
      serverTripVersion: 12,
    })!;
    const result = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 12,
      stage: 'commit',
    });
    expect(result.allowed).toBe(true);
  });
});
