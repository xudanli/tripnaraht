import { getAuthorityCase } from '../authority/authority-cases.registry';
import { authorityAssert, expectAuthorityPass } from '../assertions/canonical-authority.assertions';
import { runAuthorityCaseWithContext } from './run-authority-case-with-context.util';
import { assertAuthorityResultHasAnchor } from './authority-context-anchor.util';
import { evaluateClientPlanVersionConflict } from '../../../agent/utils/trip-orchestration-lock.util';
import {
  buildDurableAuthoritySnapshotV1,
  validateAsyncAuthority,
} from '../../../decision-runtime/execution/async-resume-authority.util';
import { applyAsyncMutationCommitGuard } from '../../../decision-runtime/execution/async-mutation-commit.adapter';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';

/**
 * AU-P1-006 — Concurrent edit must surface version conflict (STALE_PLAN_VERSION / EXECUTION_CONFLICT).
 */
describe('AU-P1-006 — Concurrent modification version conflict', () => {
  const caseDef = getAuthorityCase('AU-P1-006')!;
  const prevGuard = process.env.ASYNC_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.ASYNC_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.ASYNC_MUTATION_WRITE_GUARD;
    else process.env.ASYNC_MUTATION_WRITE_GUARD = prevGuard;
  });

  it('evaluateClientPlanVersionConflict detects stale client view', () => {
    const verdict = evaluateClientPlanVersionConflict({
      clientVersion: 3,
      serverVersion: 5,
    });
    expect(verdict.conflict).toBe(true);
    expect(verdict.reason).toContain('client_dso_version=3');
  });

  it('fresh client view does not conflict', () => {
    const verdict = evaluateClientPlanVersionConflict({
      clientVersion: 5,
      serverVersion: 5,
    });
    expect(verdict.conflict).toBe(false);
  });

  it(caseDef.description, async () => {
    const request = {
      request_id: 'au-p1-006',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '改第三天',
      options: { client_dso_version: 12 },
    } as RouteAndRunRequestDto;

    const snapshot = buildDurableAuthoritySnapshotV1({
      request,
      serverTripVersion: 12,
    })!;

    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: { route: 'SYSTEM2', confidence: 0.5, reasons: [] },
      result: {
        status: 'OK',
        answer_text: 'plan',
        payload: {
          timeline: [{ day: 3, items: [] }],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
        },
      },
      explain: { decision_log: [] },
      observability: {},
    };

    const guarded = applyAsyncMutationCommitGuard({
      request,
      response,
      authoritySnapshot: snapshot,
      currentTripVersion: 13,
      stage: 'commit',
    });

    const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;
    const commitCheck = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 13,
      stage: 'commit',
    });

    const result = await runAuthorityCaseWithContext({
      caseId: caseDef.caseId,
      tripId: 'trip_1',
      runtimeAuthority: 'CANONICAL',
      run: async () => [
        authorityAssert({
          layer: 'trip_version',
          name: 'async_commit_rechecks_version',
          pass:
            !commitCheck.allowed &&
            commitCheck.reasonCodes.includes('EXECUTION_CONFLICT') &&
            guardPayload?.canCommit === false,
          expected: { conflict: true, canCommit: false },
          actual: {
            conflict: !commitCheck.allowed,
            reasonCodes: commitCheck.reasonCodes,
            canCommit: guardPayload?.canCommit,
          },
        }),
      ],
    });

    expectAuthorityPass(result);
    assertAuthorityResultHasAnchor(result, { runtimeAuthority: 'CANONICAL' });
  });
});
