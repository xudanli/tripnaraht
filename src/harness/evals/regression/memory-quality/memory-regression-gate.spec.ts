/**
 * Memory regression gate — P2 quantitative metrics (skeleton).
 * P0/P1 memory safety is enforced by harness:blockers; this suite will host ablation runs.
 */

import { runMemBlockerDelete001, runMemBlockerPdi001, runMemBlockerScope001 } from '../../fixtures/blocker-case-runners';
import { expectBlockerPass } from '../../runners/run-blocker-case.util';
import { getPendingMemoryMetrics, MEMORY_REGRESSION_METRICS } from './memory-regression.registry';

describe('Memory Regression Gate', () => {
  describe('P2 metric registry', () => {
    it('tracks pending quantitative metrics', () => {
      expect(MEMORY_REGRESSION_METRICS.length).toBeGreaterThan(0);
      expect(getPendingMemoryMetrics().every((m) => m.phase === 'P2')).toBe(true);
    });
  });

  describe('P0/P1 memory safety proxy (until ablation runner lands)', () => {
    const proxyCases = [
      { caseId: 'MEM-BLOCKER-SCOPE-001', run: runMemBlockerScope001 },
      { caseId: 'MEM-BLOCKER-DELETE-001', run: runMemBlockerDelete001 },
      { caseId: 'MEM-BLOCKER-PDI-001', run: runMemBlockerPdi001 },
    ];

    for (const { caseId, run } of proxyCases) {
      it(`${caseId} — memory safety baseline`, async () => {
        expectBlockerPass(await run());
      });
    }
  });
});
