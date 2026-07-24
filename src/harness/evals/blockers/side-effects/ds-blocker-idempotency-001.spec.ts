/**
 * DS-BLOCKER-IDEMPOTENCY-001
 *
 * Applying the same repair decision twice must produce one effective
 * itinerary mutation and one effective decision application.
 */

import { runDsBlockerIdempotency001 } from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('DS-BLOCKER-IDEMPOTENCY-001 — Plan B duplicate apply idempotency', () => {
  const caseDef = getBlockerCase('DS-BLOCKER-IDEMPOTENCY-001')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runDsBlockerIdempotency001(0));
  });
});
