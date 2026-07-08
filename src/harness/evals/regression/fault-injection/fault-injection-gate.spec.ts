/**
 * Fault injection gate — validates implemented matrix entries via deterministic blockers.
 * P2 agent-level faults (model timeout, policy gateway down) remain registered but not gated here.
 */

import type { BlockerCaseResult } from '../../blockers/blocker-case.schema';
import {
  runDsBlockerIdempotency001,
  runMemBlockerDelete001,
  runPolicyBlockerStale001,
  runStateBlockerPartial001PathA,
  runStateBlockerPartial001PathB,
} from '../../fixtures/blocker-case-runners';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';
import {
  FAULT_INJECTION_MATRIX,
  getImplementedFaultCases,
} from './fault-matrix.registry';

const BLOCKER_RUNNERS: Record<string, () => Promise<BlockerCaseResult>> = {
  'POLICY-BLOCKER-STALE-001': runPolicyBlockerStale001,
  'STATE-BLOCKER-PARTIAL-001': async () => {
    const pathA = await runStateBlockerPartial001PathA();
    if (!pathA.pass) return pathA;
    return runStateBlockerPartial001PathB();
  },
  'DS-BLOCKER-IDEMPOTENCY-001': () => runDsBlockerIdempotency001(0),
  'MEM-BLOCKER-DELETE-001': runMemBlockerDelete001,
};

describe('Fault Injection Gate', () => {
  it('matrix registers at least three P1 fault locations', () => {
    const implemented = getImplementedFaultCases();
    expect(implemented.length).toBeGreaterThanOrEqual(3);
    const locations = new Set(implemented.map((c) => c.location));
    expect(locations.has('evidence')).toBe(true);
    expect(locations.has('db_after_external_side_effect')).toBe(true);
    expect(locations.has('tool_after_execution')).toBe(true);
  });

  for (const fault of getImplementedFaultCases()) {
    it(`${fault.faultId} — ${fault.expectedBehavior}`, async () => {
      const runner = BLOCKER_RUNNERS[fault.blockerCaseId];
      expect(runner).toBeDefined();
      const result = await runner();
      expectBlockerPass(result);
    });
  }

  it('unimplemented P2 faults are explicitly tracked', () => {
    const pending = FAULT_INJECTION_MATRIX.filter((c) => !c.implemented);
    expect(pending.some((c) => c.faultId === 'FAULT-MODEL-TIMEOUT-001')).toBe(true);
  });
});
