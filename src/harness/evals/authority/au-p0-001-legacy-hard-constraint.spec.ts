import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  authorityAssert,
  expectAuthorityPass,
  runAuthorityCase,
} from '../assertions/canonical-authority.assertions';
import { applyLegacyMutationCommitGuard } from '../../../decision-runtime/execution/legacy-mutation-commit.adapter';
import { validateMutationAuthority } from '../../../decision-runtime/execution/canonical-mutation-commit-guard.util';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';

function legacyWriteResponse(): RouteAndRunResponseDto {
  return {
    request_id: 'au-p0-001',
    route: { route: 'SYSTEM2_REASONING', confidence: 0.5, reasons: [] },
    result: {
      status: 'OK',
      answer_text: 'draft',
      payload: {
        timeline: [{ day: 3, items: [{ id: 'poi_1' }] }],
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

describe('AU-P0-001 — Legacy hard constraint equivalence', () => {
  const caseDef = getAuthorityCase('AU-P0-001')!;
  const prevLegacyGuard = process.env.LEGACY_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.LEGACY_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevLegacyGuard === undefined) delete process.env.LEGACY_MUTATION_WRITE_GUARD;
    else process.env.LEGACY_MUTATION_WRITE_GUARD = prevLegacyGuard;
  });

  it(caseDef.description, async () => {
    const request = {
      request_id: 'au-p0-001',
      user_id: 'u1',
      trip_id: 'trip_iceland',
      message: '调整第三天',
      options: { client_dso_version: 12 },
    } as RouteAndRunRequestDto;

    const guarded = applyLegacyMutationCommitGuard(request, legacyWriteResponse(), {
      constraintEvaluation: {
        evaluationId: 'eval_road',
        verdict: 'BLOCK',
        hardConstraintViolations: ['ROAD_SEGMENT_CLOSED'],
      },
    });

    const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
    const audit = (guarded.observability as any)?.authority_audit_v1;

    const result = await runAuthorityCase({
      caseId: caseDef.caseId,
      run: async () => [
        authorityAssert({
          layer: 'constraint_gateway',
          name: 'legacy_evaluates_constraints_before_write',
          pass: Boolean(guardPayload?.reasonCodes?.includes('HARD_CONSTRAINT_BLOCK')),
          expected: true,
          actual: guardPayload?.reasonCodes,
        }),
        authorityAssert({
          layer: 'write_guard',
          name: 'legacy_blocks_silent_write_on_hard_violation',
          pass: guardPayload?.canCommit === false && audit?.mutationCommitted === false,
          expected: { canCommit: false, mutationCommitted: false },
          actual: { canCommit: guardPayload?.canCommit, mutationCommitted: audit?.mutationCommitted },
        }),
        authorityAssert({
          layer: 'decision_ledger',
          name: 'legacy_denies_without_decision_id',
          pass: guardPayload?.reasonCodes?.includes('MUTATION_DENIED_DECISION_AUTHORITY_MISSING'),
          expected: 'MUTATION_DENIED_DECISION_AUTHORITY_MISSING',
          actual: guardPayload?.reasonCodes,
        }),
      ],
    });

    expectAuthorityPass(result);
  });

  it('gateway unavailable defaults to non-writable legacy draft', () => {
    const request = {
      request_id: 'au-p0-001-gw',
      user_id: 'u1',
      trip_id: 'trip_iceland',
      message: '调整',
    } as RouteAndRunRequestDto;
    const guarded = applyLegacyMutationCommitGuard(request, legacyWriteResponse());
    const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
    expect(guardPayload?.canCommit).toBe(false);
    expect(guardPayload?.reasonCodes).toEqual(
      expect.arrayContaining(['MUTATION_DENIED_DECISION_AUTHORITY_MISSING', 'CONSTRAINT_EVALUATION_MISSING']),
    );
  });

  it('validateMutationAuthority rejects synthetic decision id bypass with incomplete envelope', () => {
    const validation = validateMutationAuthority({
      tripId: 'trip_1',
      decisionId: 'temp_fake_id',
      expectedTripVersion: 12,
      constraintEvaluation: { evaluationId: '', verdict: 'PASS', hardConstraintViolations: [] },
      evidenceSnapshot: { snapshotId: '', capturedAt: new Date().toISOString() },
      writeAuthority: { verdict: 'DENY', reasonCodes: [] },
      executionSource: { routeClass: 'LEGACY', orchestrationMode: 'LEGACY' },
    });
    expect(validation.allowed).toBe(false);
    expect(validation.reasonCodes).toContain('CONSTRAINT_EVALUATION_MISSING');
  });
});
