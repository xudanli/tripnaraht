import {
  assertAdjustmentQueueExpectations,
  assertMemberScopeExpectations,
  assertPlanExpectations,
  assertScenarioExpectations,
  createHarnessKnowledgeStackFromSnapshot,
  loadPackageHarnessFile,
  runPackageHarnessScenario,
} from './package-harness.runner';
import { PACKAGE_HARNESS_SCENARIO_IDS_ALL } from './package-harness.types';
import {
  assertPlanDegradationStructure,
  assertSafetyVetoOnPlans,
  assertStopScenarioPlans,
} from '../utils/execution-risk-plan-safety.util';
import { assertRecoveryCascadeExpectations } from '../utils/execution-risk-recovery-cascade.util';
import { ForbiddenException } from '@nestjs/common';
import {
  assertHarnessAutomationBoundary,
  classifyActionCode,
  guardAutoExternalTransaction,
  ActionAutomationClass,
} from '../utils/execution-risk-automation-boundary.util';

describe('Execution Risk Acceptance Criteria (ER-AC-001 … ER-AC-015)', () => {
  const harness = loadPackageHarnessFile();
  const { knowledge, enrichment } = createHarnessKnowledgeStackFromSnapshot();
  const scenarios = harness.scenarios.filter((s) =>
    (PACKAGE_HARNESS_SCENARIO_IDS_ALL as readonly string[]).includes(s.scenarioId),
  );

  it('ER-AC-001/002: all 20 harness scenarios pass risk + cluster expectations', async () => {
    for (const scenario of scenarios) {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      const failures = assertScenarioExpectations(scenario, result);
      expect(failures).toEqual([]);
    }
  });

  it.each(['SH-ENV-003', 'SH-ENV-004', 'SH-ENV-005', 'SH-ROAD-003', 'SH-ROAD-005'])(
    'ER-AC-003: %s STOP scenarios forbid continue-only minimal plan',
    async (scenarioId) => {
      const scenario = scenarios.find((s) => s.scenarioId === scenarioId)!;
      const failures = assertStopScenarioPlans(
        scenarioId,
        scenario.expected.severityLevel,
        scenario.expected.plans,
      );
      expect(failures).toEqual([]);
    },
  );

  it.each(['SH-ENV-005', 'SH-ROAD-003'])(
    'ER-AC-007: %s safety veto rejects unsafe continue plans under STOP',
    async (scenarioId) => {
      const scenario = scenarios.find((s) => s.scenarioId === scenarioId)!;
      const failures = assertSafetyVetoOnPlans(
        scenarioId,
        scenario.expected.severityLevel,
        scenario.expected.plans,
      );
      expect(failures).toEqual([]);
    },
  );

  it('ER-AC-008/009/015: Sprint-2 plan + scope + degradation structure', async () => {
    for (const scenario of scenarios) {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      expect(assertPlanExpectations(scenario, result)).toEqual([]);
      expect(assertMemberScopeExpectations(scenario, result)).toEqual([]);
      expect(assertPlanDegradationStructure(scenario.scenarioId, scenario.expected.plans)).toEqual(
        [],
      );
    }
  });

  it('ER-AC-010: SH-ENV-001 wind clear cascade paths', () => {
    expect(
      assertRecoveryCascadeExpectations({
        scenarioId: 'SH-ENV-001',
        rootKnowledgeCode: 'ENV-WIND-01',
        derivedKnowledgeCode: 'ROAD-CROSSWIND-01',
        rootCleared: true,
      }),
    ).toEqual([]);
    expect(
      assertRecoveryCascadeExpectations({
        scenarioId: 'SH-ENV-001',
        rootKnowledgeCode: 'ENV-WIND-01',
        derivedKnowledgeCode: 'BOOK-TIME-01',
        rootCleared: true,
      }),
    ).toEqual([]);
  });

  it('ER-AC-010: SH-SCHED-002 missed booking persists after delay clears', () => {
    expect(
      assertRecoveryCascadeExpectations({
        scenarioId: 'SH-SCHED-002',
        rootKnowledgeCode: 'BOOK-ACTIVITY-01',
        derivedKnowledgeCode: 'SCHEDULE-CASCADE-01',
        rootCleared: true,
      }),
    ).toEqual([]);
  });

  it('ER-AC-013: SH-ENV-001 PlanB monitoring when wind near trigger', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ENV-001')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
    expect(result.planB).toBeDefined();
    expect(result.planB!.autoSwitch).toBe(false);
    expect(['IDLE', 'MONITORING', 'TRIGGERED']).toContain(result.planB!.status);
  });

  it('ER-AC-013: SH-ENV-005 PlanB autoSwitch on volcanic escalation', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ENV-005')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
    expect(result.planB?.autoSwitch).toBe(true);
    expect(result.planB?.status).toBe('TRIGGERED');
  });

  it('ER-AC-014: SH-SCHED-003 external transactions require user confirmation', () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-SCHED-003')!;
    expect(assertHarnessAutomationBoundary('SH-SCHED-003', scenario.expected.plans)).toEqual([]);
    const externalCodes = (scenario.expected.plans ?? [])
      .flatMap((p) => p.actionCodes)
      .filter((code) => classifyActionCode(code).actionClass === ActionAutomationClass.EXTERNAL_TRANSACTION);
    expect(externalCodes.length).toBeGreaterThan(0);
    expect(() =>
      guardAutoExternalTransaction({
        actionCodes: externalCodes,
        userConfirmed: false,
        autoSwitch: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('ER-AC-014: SH-ENV-005 evacuation actions are emergency guidance', () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ENV-005')!;
    expect(assertHarnessAutomationBoundary('SH-ENV-005', scenario.expected.plans)).toEqual([]);
    const guidanceCodes = (scenario.expected.plans ?? [])
      .flatMap((p) => p.actionCodes)
      .filter((code) => classifyActionCode(code).actionClass === ActionAutomationClass.EMERGENCY_GUIDANCE);
    expect(guidanceCodes.length).toBeGreaterThan(0);
    expect(() =>
      guardAutoExternalTransaction({
        actionCodes: ['BOOK_ARROWTOWN_MOTEL'],
        userConfirmed: true,
        autoSwitch: true,
      }),
    ).toThrow(ForbiddenException);
  });

  it('ER-AC-004/012: covered by execution-risk-apply.service.spec.ts', () => {
    expect(true).toBe(true);
  });
});
