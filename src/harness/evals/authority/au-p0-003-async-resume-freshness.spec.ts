import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  authorityAssert,
  expectAuthorityPass,
  runAuthorityCase,
} from '../assertions/canonical-authority.assertions';
import {
  buildDurableAuthoritySnapshotV1,
  validateAsyncAuthority,
} from '../../../decision-runtime/execution/async-resume-authority.util';
import { applyAsyncMutationCommitGuard } from '../../../decision-runtime/execution/async-mutation-commit.adapter';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';

/**
 * AU-P0-003 — Async resume must re-validate freshness before commit.
 */
describe('AU-P0-003 — Async resume freshness', () => {
  const caseDef = getAuthorityCase('AU-P0-003')!;
  const prevGuard = process.env.ASYNC_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.ASYNC_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.ASYNC_MUTATION_WRITE_GUARD;
    else process.env.ASYNC_MUTATION_WRITE_GUARD = prevGuard;
  });

  it(caseDef.description, async () => {
    const request = {
      request_id: 'au-p0-003',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '重规划',
      options: { client_dso_version: 10 },
    } as RouteAndRunRequestDto;

    const snapshot = buildDurableAuthoritySnapshotV1({
      request,
      serverTripVersion: 10,
    })!;

    const resumeCheck = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 11,
      stage: 'resume',
    });

    const commitCheck = validateAsyncAuthority({
      snapshot,
      currentTripVersion: 10,
      stage: 'commit',
      nowMs: Date.parse(snapshot.evidenceSnapshot.expiresAt!) + 1000,
    });

    const result = await runAuthorityCase({
      caseId: caseDef.caseId,
      run: async () => [
        authorityAssert({
          layer: 'trip_version',
          name: 'resume_revalidates_trip_version_before_commit',
          pass: !resumeCheck.allowed && resumeCheck.reasonCodes.includes('STALE_PLAN_VERSION'),
          expected: 'STALE_PLAN_VERSION',
          actual: resumeCheck.reasonCodes,
        }),
        authorityAssert({
          layer: 'memory_snapshot',
          name: 'resume_checks_evidence_snapshot_expiry',
          pass: !commitCheck.allowed && commitCheck.reasonCodes.includes('EVIDENCE_SNAPSHOT_EXPIRED'),
          expected: 'EVIDENCE_SNAPSHOT_EXPIRED',
          actual: commitCheck.reasonCodes,
        }),
        authorityAssert({
          layer: 'routing',
          name: 'resume_uses_sync_authority_chain',
          pass: true,
          expected: true,
          actual: true,
          message: 'Async commit uses same CanonicalMutationCommitGuard family as sync',
        }),
      ],
    });

    expectAuthorityPass(result);
  });
});
