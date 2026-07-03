import { runDsBlockerIdempotency001 } from '../fixtures/blocker-case-runners';
import { expectBlockerPass } from '../runners/run-blocker-case.util';
import { getAuthorityCase } from '../authority/authority-cases.registry';

/**
 * AU-P1-004 — Delegates to DS-BLOCKER-IDEMPOTENCY-001 (existing release blocker).
 */
describe('AU-P1-004 — Duplicate idempotency_key must not double-write', () => {
  const caseDef = getAuthorityCase('AU-P1-004')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runDsBlockerIdempotency001(0));
  });
});
