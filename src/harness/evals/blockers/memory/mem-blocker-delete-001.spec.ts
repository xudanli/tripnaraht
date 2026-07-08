/**
 * MEM-BLOCKER-DELETE-001
 *
 * After DELETE, deleted constraint must not be recallable across canonical store,
 * cache, snapshot head, vector recall, or assembled planner context.
 */

import { runMemBlockerDelete001 } from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('MEM-BLOCKER-DELETE-001 — deleted constraint must not be recalled', () => {
  const caseDef = getBlockerCase('MEM-BLOCKER-DELETE-001')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runMemBlockerDelete001());
  });
});
