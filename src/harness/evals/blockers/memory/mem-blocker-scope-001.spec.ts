/**
 * MEM-BLOCKER-SCOPE-001
 *
 * A CURRENT_TRIP constraint must influence only its owning trip and must
 * not appear in any assembled context for another trip.
 */

import { runMemBlockerScope001 } from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('MEM-BLOCKER-SCOPE-001 — Trip-level constraint must not cross trips', () => {
  const caseDef = getBlockerCase('MEM-BLOCKER-SCOPE-001')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runMemBlockerScope001());
  });
});
