/**
 * STATE-BLOCKER-PARTIAL-001
 *
 * applyRepair succeeds → itinerary persisted → post-apply route recalc fails.
 * Only ROLLED_BACK (Path A) or PARTIALLY_APPLIED (Path B) — never fake EXECUTED/APPLIED.
 */

import {
  runStateBlockerPartial001PathA,
  runStateBlockerPartial001PathB,
} from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('STATE-BLOCKER-PARTIAL-001 — post-apply route recalc failure', () => {
  const caseDef = getBlockerCase('STATE-BLOCKER-PARTIAL-001')!;

  it('Path B — PARTIALLY_APPLIED when rollback unavailable', async () => {
    expectBlockerPass(await runStateBlockerPartial001PathB());
  });

  it('Path A — ROLLED_BACK when rollback succeeds', async () => {
    expectBlockerPass(await runStateBlockerPartial001PathA());
  });
});
