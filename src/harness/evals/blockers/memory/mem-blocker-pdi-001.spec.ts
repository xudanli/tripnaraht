/**
 * MEM-BLOCKER-PDI-001
 *
 * A member's private wish (PDI) must not appear in another member's
 * privateWishDigest, wishConstraintDigest, or assembled context blocks.
 */

import { runMemBlockerPdi001 } from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('MEM-BLOCKER-PDI-001 — private wish must not leak to other members', () => {
  const caseDef = getBlockerCase('MEM-BLOCKER-PDI-001')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runMemBlockerPdi001());
  });
});
