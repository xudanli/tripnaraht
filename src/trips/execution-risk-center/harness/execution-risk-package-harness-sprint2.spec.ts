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
import { resolveAffectedMembersScope } from '../utils/execution-risk-member.util';
import { AffectedMembersScope } from '../../../generated/execution-risk-contracts';

describe('Execution Risk Package Harness Sprint 2 (plans + member scope + adjustment DTO)', () => {
  const harness = loadPackageHarnessFile();
  const { knowledge, enrichment } = createHarnessKnowledgeStackFromSnapshot();

  const scenarios = harness.scenarios.filter((s) =>
    (PACKAGE_HARNESS_SCENARIO_IDS_ALL as readonly string[]).includes(s.scenarioId),
  );

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s: three-plan structure (AC-008)',
    async (scenarioId, scenario) => {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      const failures = assertPlanExpectations(scenario, result);
      if (failures.length > 0) {
        throw new Error(`${scenarioId} plan failures:\n${failures.join('\n')}`);
      }
    },
    30_000,
  );

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s: member scope consistency (AC-009)',
    async (scenarioId, scenario) => {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      const failures = assertMemberScopeExpectations(scenario, result);
      if (failures.length > 0) {
        throw new Error(`${scenarioId} member scope failures:\n${failures.join('\n')}`);
      }
    },
    30_000,
  );

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s: adjustment queue item projection',
    async (scenarioId, scenario) => {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      const failures = [
        ...assertScenarioExpectations(scenario, result),
        ...assertAdjustmentQueueExpectations(scenario, result),
      ];
      if (failures.length > 0) {
        throw new Error(`${scenarioId} adjustment failures:\n${failures.join('\n')}`);
      }
    },
    30_000,
  );

  it('SH-ENV-001: environment risk uses ALL_MEMBERS scope (AC-009)', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ENV-001')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
    expect(result.affectedMembersScope).toBe('ALL_MEMBERS');
    expect(result.memberImpacts).toHaveLength(0);
    const item = result.adjustmentItems[0];
    expect(item?.affectedMembersScope).toBe(AffectedMembersScope.ALL_MEMBERS);
  });

  it('SH-SCHED-005: wind vs illness clusters have independent member scopes (AC-009)', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-SCHED-005')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);

    const windCluster = result.clusters.find((c) => c.primaryKnowledgeCode === 'ENV-WIND-01');
    const illnessCluster = result.clusters.find((c) => c.primaryKnowledgeCode === 'MEMBER-INJURY-01');
    expect(windCluster).toBeDefined();
    expect(illnessCluster).toBeDefined();

    const windScope = resolveAffectedMembersScope({
      cluster: windCluster!,
      risks: result.activeRisks,
    });
    const illnessScope = resolveAffectedMembersScope({
      cluster: illnessCluster!,
      risks: result.activeRisks,
    });

    expect(windScope).toBe(AffectedMembersScope.ALL_MEMBERS);
    expect(illnessScope).toBe(AffectedMembersScope.FOCUSED);
    expect(illnessCluster!.affectedMemberIds).toContain('M-002');
  });
});
