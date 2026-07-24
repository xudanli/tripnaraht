import { buildIcelandPlanningContextFixture } from '../fixtures/contexts/iceland-planning.fixture';
import { assertContextAssembly001 } from './context-assembly.util';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';
import type { ContextConstraint } from '../../../travel-context/domain/travel-context.types';

const DAILY_DRIVING_CONSTRAINT: ContextConstraint = {
  id: 'daily_driving_max_4h',
  level: 'HARD',
  source: 'USER_EXPLICIT',
  confidence: 1,
  editable: true,
  overridable: false,
  label: '每日驾驶不超过 4 小时',
  domain: 'pacing',
};

describe('CONTEXT-ASSEMBLY-001 — Travel Context Snapshot assembly', () => {
  it('assembles intent, contract, plan, and decisions coherently', async () => {
    const snapshot = buildIcelandPlanningContextFixture({
      contract: {
        constraints: [DAILY_DRIVING_CONSTRAINT],
        conflictSummary: { count: 0, blockingCount: 0 },
      },
      intent: {
        ...buildIcelandPlanningContextFixture().intent,
        successCriteria: ['每天驾驶不超过4小时'],
      },
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'CONTEXT-ASSEMBLY-001',
      snapshot,
      run: async () =>
        assertContextAssembly001(snapshot, {
          destinationCode: 'IS',
          constraintIds: ['daily_driving_max_4h'],
          minOpenDecisions: 1,
        }),
    });

    expectTravelContextHarnessPass(result);
  });

  it('fails when user driving constraint missing from contract (negative control)', async () => {
    const snapshot = buildIcelandPlanningContextFixture({
      contract: { constraints: [], conflictSummary: { count: 0, blockingCount: 0 } },
      intent: {
        ...buildIcelandPlanningContextFixture().intent,
        successCriteria: ['每天驾驶不超过4小时'],
      },
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'CONTEXT-ASSEMBLY-001-NEG',
      snapshot,
      run: async () =>
        assertContextAssembly001(snapshot, {
          destinationCode: 'IS',
          constraintIds: ['daily_driving_max_4h'],
        }),
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('contract_has_constraint_daily_driving_max_4h'))).toBe(
      true,
    );
  });
});
