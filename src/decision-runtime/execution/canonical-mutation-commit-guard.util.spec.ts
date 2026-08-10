import {
  commitEffectivePlanMutation,
  validateMutationAuthority,
} from './canonical-mutation-commit-guard.util';
import { applyLegacyMutationCommitGuard } from './legacy-mutation-commit.adapter';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';

function baseRequest(): RouteAndRunRequestDto {
  return {
    request_id: 'req_guard_test',
    user_id: 'u1',
    trip_id: 'trip_is_1',
    message: 'adjust day 3',
    options: { client_dso_version: 12 },
  };
}

function legacyResponseWithTimeline(): RouteAndRunResponseDto {
  return {
    request_id: 'req_guard_test',
    route: { route: 'SYSTEM2_REASONING', confidence: 0.5, reasons: [] },
    result: {
      status: 'OK',
      answer_text: 'Legacy draft',
      payload: {
        timeline: [{ day: 1, items: [] }],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
      },
    },
    explain: { decision_log: [] },
    observability: { latency_ms: 100 },
  };
}

describe('CanonicalMutationCommitGuard', () => {
  const prevLegacyGuard = process.env.LEGACY_MUTATION_WRITE_GUARD;

  afterEach(() => {
    if (prevLegacyGuard === undefined) delete process.env.LEGACY_MUTATION_WRITE_GUARD;
    else process.env.LEGACY_MUTATION_WRITE_GUARD = prevLegacyGuard;
  });

  describe('validateMutationAuthority', () => {
    it('denies when Decision ID missing', () => {
      const result = validateMutationAuthority({
        tripId: 'trip_1',
        decisionId: '',
        expectedTripVersion: 12,
        constraintEvaluation: {
          evaluationId: 'eval_1',
          verdict: 'PASS',
          hardConstraintViolations: [],
        },
        evidenceSnapshot: {
          snapshotId: 'ev_1',
          capturedAt: new Date().toISOString(),
        },
        writeAuthority: { verdict: 'ALLOW', reasonCodes: [] },
        executionSource: { routeClass: 'TEST', orchestrationMode: 'LEGACY' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCodes).toContain('MUTATION_DENIED_DECISION_AUTHORITY_MISSING');
    });

    it('denies HARD_CONSTRAINT_BLOCK on road closure', () => {
      const result = validateMutationAuthority({
        tripId: 'trip_1',
        decisionId: 'dec_1',
        expectedTripVersion: 12,
        constraintEvaluation: {
          evaluationId: 'eval_road',
          verdict: 'BLOCK',
          hardConstraintViolations: ['ROAD_SEGMENT_CLOSED'],
        },
        evidenceSnapshot: {
          snapshotId: 'ev_1',
          capturedAt: new Date().toISOString(),
        },
        writeAuthority: { verdict: 'DENY', reasonCodes: ['HARD_CONSTRAINT_BLOCK'] },
        executionSource: { routeClass: 'LEGACY_FALLBACK', orchestrationMode: 'LEGACY' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCodes).toContain('HARD_CONSTRAINT_BLOCK');
    });

    it('denies EXECUTION_CONFLICT on version mismatch at commit', async () => {
      const commit = await commitEffectivePlanMutation({
        envelope: {
          tripId: 'trip_1',
          decisionId: 'dec_1',
          expectedTripVersion: 12,
          constraintEvaluation: {
            evaluationId: 'eval_1',
            verdict: 'PASS',
            hardConstraintViolations: [],
          },
          evidenceSnapshot: {
            snapshotId: 'ev_1',
            capturedAt: new Date().toISOString(),
          },
          writeAuthority: { verdict: 'ALLOW', reasonCodes: [] },
          executionSource: { routeClass: 'TEST', orchestrationMode: 'LEGACY' },
        },
        proposedChangeSet: {
          schemaId: 'tripnara.proposed_change_set@v1',
          tripId: 'trip_1',
          patch: {},
        },
        actualTripVersion: 13,
        commitFn: async () => ({ tripVersionAfter: 14 }),
      });
      expect(commit.committed).toBe(false);
      expect(commit.reasonCodes).toContain('EXECUTION_CONFLICT');
    });

    it('denies expired evidence snapshot', () => {
      const result = validateMutationAuthority({
        tripId: 'trip_1',
        decisionId: 'dec_1',
        expectedTripVersion: 12,
        constraintEvaluation: {
          evaluationId: 'eval_1',
          verdict: 'PASS',
          hardConstraintViolations: [],
        },
        evidenceSnapshot: {
          snapshotId: 'ev_stale',
          capturedAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-01-02T00:00:00.000Z',
        },
        writeAuthority: { verdict: 'ALLOW', reasonCodes: [] },
        executionSource: { routeClass: 'TEST', orchestrationMode: 'LEGACY' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCodes).toContain('EVIDENCE_SNAPSHOT_EXPIRED');
    });
  });

  describe('applyLegacyMutationCommitGuard', () => {
    beforeEach(() => {
      process.env.LEGACY_MUTATION_WRITE_GUARD = 'ENFORCE';
    });

    it('allows read-only legacy responses without mutation guard payload', () => {
      const request = {
        ...baseRequest(),
        message: '维克附近有什么好吃的',
      };
      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: { route: 'SYSTEM1_RAG', confidence: 0.9, reasons: [] },
        result: { status: 'OK', answer_text: '餐厅列表', payload: {} as any },
        explain: { decision_log: [] },
        observability: {},
      };
      const guarded = applyLegacyMutationCommitGuard(request, response);
      expect((guarded.observability as any)?.authority_audit_v1?.mutationIntent).toBe(false);
      expect((guarded.result.payload as any)?.canonical_mutation_guard).toBeUndefined();
    });

    it('blocks silent write when gateway authority unavailable', () => {
      const guarded = applyLegacyMutationCommitGuard(baseRequest(), legacyResponseWithTimeline());
      const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
      expect(guardPayload?.canCommit).toBe(false);
      expect(guardPayload?.reasonCodes).toContain('MUTATION_DENIED_DECISION_AUTHORITY_MISSING');
      expect(guardPayload?.reasonCodes).toContain('LEGACY_SILENT_WRITE_BLOCKED');
      expect(guardPayload?.statusV2?.action?.status).toBe('BLOCKED');
      expect((guarded.observability as any)?.authority_audit_v1?.mutationCommitted).toBe(false);
    });

    it('stamps LEGACY_SILENT_WRITE_BLOCKED even when DECISION_RUNTIME_MODE is not LEGACY', () => {
      process.env.DECISION_RUNTIME_MODE = 'SHADOW';
      const guarded = applyLegacyMutationCommitGuard(baseRequest(), legacyResponseWithTimeline());
      const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
      expect(guardPayload?.canCommit).toBe(false);
      expect(guardPayload?.reasonCodes).toContain('LEGACY_SILENT_WRITE_BLOCKED');
    });

    it('blocks commit on road closure constraint BLOCK', () => {
      const guarded = applyLegacyMutationCommitGuard(baseRequest(), legacyResponseWithTimeline(), {
        constraintEvaluation: {
          evaluationId: 'eval_road_close',
          verdict: 'BLOCK',
          hardConstraintViolations: ['ROAD_SEGMENT_CLOSED'],
        },
      });
      const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
      expect(guardPayload?.canCommit).toBe(false);
      expect(guardPayload?.reasonCodes).toContain('HARD_CONSTRAINT_BLOCK');
    });
  });
});
