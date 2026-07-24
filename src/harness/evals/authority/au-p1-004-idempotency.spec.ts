import { runDsBlockerIdempotency001 } from '../fixtures/blocker-case-runners';
import { expectBlockerPass } from '../runners/run-blocker-case.util';
import { getAuthorityCase } from '../authority/authority-cases.registry';
import { authorityAssert, expectAuthorityPass } from '../assertions/canonical-authority.assertions';
import { runAuthorityCaseWithContext } from './run-authority-case-with-context.util';
import { assertAuthorityResultHasAnchor } from './authority-context-anchor.util';

/**
 * AU-P1-004 — Delegates to DS-BLOCKER-IDEMPOTENCY-001 (existing release blocker).
 */
describe('AU-P1-004 — Duplicate idempotency_key must not double-write', () => {
  const caseDef = getAuthorityCase('AU-P1-004')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runDsBlockerIdempotency001(0));
  });

  it('idempotency blocker result is anchored to Travel Context revision', async () => {
    const blockerResult = await runDsBlockerIdempotency001(0);

    const result = await runAuthorityCaseWithContext({
      caseId: caseDef.caseId,
      tripId: 'trip_1',
      runtimeAuthority: 'CANONICAL',
      run: async () => [
        authorityAssert({
          layer: 'write_guard',
          name: 'idempotency_blocker_passes',
          pass: blockerResult.pass,
          expected: true,
          actual: blockerResult.pass,
        }),
      ],
    });

    expectAuthorityPass(result);
    assertAuthorityResultHasAnchor(result, { runtimeAuthority: 'CANONICAL' });
  });
});
