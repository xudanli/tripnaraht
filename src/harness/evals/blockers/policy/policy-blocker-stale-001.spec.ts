/**
 * POLICY-BLOCKER-STALE-001
 *
 * Stale high-risk evidence must block auto-repair: no applyRepair, no EXECUTED/APPLIED,
 * must surface DATA_STALE and require evidence refresh.
 */

import { runPolicyBlockerStale001 } from '../../fixtures/blocker-case-runners';
import { getBlockerCase } from '../../fixtures/blocker-cases.registry';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';

describe('POLICY-BLOCKER-STALE-001 — DATA_STALE blocks auto-repair', () => {
  const caseDef = getBlockerCase('POLICY-BLOCKER-STALE-001')!;

  it(caseDef.description, async () => {
    expectBlockerPass(await runPolicyBlockerStale001());
  });
});
