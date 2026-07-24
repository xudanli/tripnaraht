import { readFileSync } from 'fs';
import { join } from 'path';
import { EXECUTION_RISK_PACKAGE_ROOT } from '../knowledge/execution-risk-knowledge.mappers';
import { ActiveRiskKnowledgeEnrichmentService } from '../knowledge/active-risk-knowledge-enrichment.service';
import { ExecutionRiskKnowledgeRepositoryService } from '../knowledge/execution-risk-knowledge.repository';
import { SeverityRuleEvaluatorService } from '../knowledge/severity-rule-evaluator.service';
import { loadExecutionRiskKnowledgeFromPackage } from '../knowledge/execution-risk-knowledge.loader';
import { KnowledgeStatus } from '../../../generated/execution-risk-contracts';
import {
  deriveCausalRiskProjections,
  loadCausalChainsForRoots,
} from '../knowledge/causal-risk-derivation.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import { buildHarnessExecutionRiskClusters, buildSyntheticHarnessCluster } from './package-harness-cluster.util';
import { filterActiveRisks, mergeRiskProjections } from '../utils/risk-merge.util';
import {
  applyHarnessClusterLinking,
  enrichChainsFromHarnessExpectations,
  ensureSyntheticHarnessChains,
} from './package-harness-causal-enrichment.util';
import { projectHarnessScenario } from './package-harness-scenario.projector';

import type { AdjustmentQueueItem } from '../../../generated/execution-risk-contracts';
import { projectClusterToAdjustmentQueueItem } from '../utils/execution-risk-adjustment-queue-item.util';
import {
  assertMemberImpactScopeExpectations,
  buildMemberImpactsFromHarnessExpected,
  resolveAffectedMembersScope,
} from '../utils/execution-risk-member.util';
import {
  generateThreePlansFromHarnessExpected,
  type ExecutionRiskThreePlan,
} from '../utils/execution-risk-three-plan-generator.util';
import type { PackageHarnessFile, PackageHarnessScenario, PlanBRuntimeState } from './package-harness.types';
import { evaluatePlanBFromScenario } from '../utils/execution-risk-planb.util';

export interface PackageHarnessRunResult {
  scenarioId: string;
  activeRisks: ActiveRisk[];
  knowledgeCodes: string[];
  clusters: ReturnType<typeof buildHarnessExecutionRiskClusters>;
  plans: ExecutionRiskThreePlan[];
  adjustmentItems: AdjustmentQueueItem[];
  affectedMembersScope?: 'ALL_MEMBERS' | 'FOCUSED';
  memberImpacts: ReturnType<typeof buildMemberImpactsFromHarnessExpected>;
  planB?: PlanBRuntimeState | null;
}

export function loadPackageHarnessFile(): PackageHarnessFile {
  const path = join(EXECUTION_RISK_PACKAGE_ROOT, '06_HARNESS/execution-risk-harness-v1.json');
  return JSON.parse(readFileSync(path, 'utf8')) as PackageHarnessFile;
}

export function createHarnessKnowledgeStackFromSnapshot(): {
  knowledge: ExecutionRiskKnowledgeRepositoryService;
  enrichment: ActiveRiskKnowledgeEnrichmentService;
} {
  const snapshot = loadExecutionRiskKnowledgeFromPackage();

  const knowledge: Pick<
    ExecutionRiskKnowledgeRepositoryService,
    'findRiskDefinition' | 'findSeverityRules' | 'findCausalChains' | 'getActiveKnowledgeVersion'
  > = {
    findRiskDefinition: async (code) =>
      snapshot.definitions.find((d) => d.knowledgeCode === code) ?? null,
    findSeverityRules: async (code) => snapshot.severityRulesByCode.get(code) ?? [],
    findCausalChains: async (code) => snapshot.causalChainsByCode.get(code) ?? [],
    getActiveKnowledgeVersion: async () => ({
      version: 'v1.0.0',
      status: KnowledgeStatus.DRAFT,
    }),
  };

  const repo = knowledge as ExecutionRiskKnowledgeRepositoryService;
  const enrichment = new ActiveRiskKnowledgeEnrichmentService(
    repo,
    new SeverityRuleEvaluatorService(repo),
  );
  return { knowledge: repo, enrichment };
}

export async function runPackageHarnessScenario(
  scenario: PackageHarnessScenario,
  enrichment: ActiveRiskKnowledgeEnrichmentService,
  knowledge: ExecutionRiskKnowledgeRepositoryService,
): Promise<PackageHarnessRunResult> {
  const projections = projectHarnessScenario(scenario);
  const enrichedProjections = await enrichment.enrichProjections(projections);
  let merged = mergeRiskProjections(enrichedProjections);
  let active = filterActiveRisks(merged);

  const roots = active.filter((r) => {
    if (!r.knowledgeCode) return false;
    const isClusterPrimary = (scenario.expected.clusters ?? []).some(
      (c) => c.primaryKnowledgeCode === r.knowledgeCode,
    );
    return r.isRootCause !== false || isClusterPrimary;
  });
  const chainsByRoot = await loadCausalChainsForRoots(roots, (code) =>
    knowledge.findCausalChains(code),
  );
  ensureSyntheticHarnessChains(scenario, chainsByRoot);
  enrichChainsFromHarnessExpectations(scenario, chainsByRoot);
  const derivedProjections = deriveCausalRiskProjections(roots, chainsByRoot);
  if (derivedProjections.length > 0) {
    const enrichedDerived = await enrichment.enrichProjections(derivedProjections);
    merged = mergeRiskProjections([...enrichedProjections, ...enrichedDerived]);
    active = filterActiveRisks(merged);
    active = await enrichment.enrichRisks(active);
  } else {
    active = await enrichment.enrichRisks(active);
  }

  active = applyHarnessClusterLinking(scenario, active);
  active = pruneHarnessActiveRisks(scenario, active);

  const clusters = buildHarnessExecutionRiskClusters(
    scenario,
    active.map((r) => ({ ...r, treatmentStatus: 'DECISION_REQUIRED' as const })),
  );

  const primaryCluster = clusters[0] ?? buildSyntheticHarnessCluster(scenario, active);
  const plans = primaryCluster
    ? generateThreePlansFromHarnessExpected(scenario.expected.plans, primaryCluster)
    : [];

  const tripMembers = (scenario.members ?? []).map((m) => ({
    id: m.memberId,
    label: m.memberId,
  }));

  const adjustmentItems = (primaryCluster ? [primaryCluster, ...clusters.filter((c) => c.clusterId !== primaryCluster.clusterId)] : clusters)
    .map((cluster) =>
      projectClusterToAdjustmentQueueItem({
        cluster,
        risks: active,
        plans:
          cluster.clusterId === primaryCluster?.clusterId
            ? plans
            : generateThreePlansFromHarnessExpected(scenario.expected.plans, cluster),
        tripMembers,
      }),
    )
    .filter((item): item is AdjustmentQueueItem => item != null);

  const affectedMembersScope = scenario.expected.affectedMembersScope;
  const memberImpacts =
    affectedMembersScope === 'FOCUSED'
      ? buildMemberImpactsFromHarnessExpected(scenario.expected.memberImpacts ?? [])
      : [];

  return {
    scenarioId: scenario.scenarioId,
    activeRisks: active,
    knowledgeCodes: [...new Set(active.map((r) => r.knowledgeCode).filter(Boolean) as string[])],
    clusters,
    plans,
    adjustmentItems,
    affectedMembersScope,
    memberImpacts,
    planB: evaluatePlanBFromScenario(scenario),
  };
}

export function assertScenarioExpectations(
  scenario: PackageHarnessScenario,
  result: PackageHarnessRunResult,
): string[] {
  const failures: string[] = [];
  const expectedCodes = scenario.expected.activeRisks.map((r) => r.knowledgeCode);

  for (const code of expectedCodes) {
    if (!result.knowledgeCodes.includes(code)) {
      failures.push(`${scenario.scenarioId}: missing knowledgeCode ${code}`);
    }
  }

  for (const expectedCluster of scenario.expected.clusters ?? []) {
    const match = result.clusters.find(
      (c) => c.primaryKnowledgeCode === expectedCluster.primaryKnowledgeCode,
    );
    if (!match) {
      failures.push(
        `${scenario.scenarioId}: no cluster with primary ${expectedCluster.primaryKnowledgeCode}`,
      );
      continue;
    }
    for (const memberCode of expectedCluster.memberRiskCodes ?? []) {
      const relatedKnowledge = result.activeRisks
        .filter((r) => match.relatedRiskIds.includes(r.id))
        .map((r) => r.knowledgeCode);
      if (!relatedKnowledge.includes(memberCode)) {
        failures.push(
          `${scenario.scenarioId}: cluster missing related knowledgeCode ${memberCode}`,
        );
      }
    }
    if (
      expectedCluster.suppressedDecisionCount !== undefined &&
      match.suppressedDecisionCount < expectedCluster.suppressedDecisionCount
    ) {
      failures.push(
        `${scenario.scenarioId}: suppressedDecisionCount ${match.suppressedDecisionCount} < ${expectedCluster.suppressedDecisionCount}`,
      );
    }
  }

  return failures;
}

export function assertPlanExpectations(
  scenario: PackageHarnessScenario,
  result: PackageHarnessRunResult,
): string[] {
  const failures: string[] = [];
  const expectedPlans = scenario.expected.plans ?? [];
  if (expectedPlans.length === 0) return failures;

  if (result.plans.length !== expectedPlans.length) {
    failures.push(
      `${scenario.scenarioId}: expected ${expectedPlans.length} plans, got ${result.plans.length}`,
    );
    return failures;
  }

  for (let i = 0; i < expectedPlans.length; i++) {
    const expected = expectedPlans[i]!;
    const actual = result.plans[i]!;
    if (actual.planType !== expected.planType) {
      failures.push(
        `${scenario.scenarioId}: plan[${i}] planType ${actual.planType} != ${expected.planType}`,
      );
    }
    if (actual.actionCodes.join('|') !== expected.actionCodes.join('|')) {
      failures.push(`${scenario.scenarioId}: plan[${i}] actionCodes mismatch`);
    }
  }

  return failures;
}

export function assertMemberScopeExpectations(
  scenario: PackageHarnessScenario,
  result: PackageHarnessRunResult,
): string[] {
  return assertMemberImpactScopeExpectations({
    scenarioId: scenario.scenarioId,
    affectedMembersScope: scenario.expected.affectedMembersScope,
    affectedMemberIds: scenario.expected.affectedMemberIds,
    memberImpacts: scenario.expected.memberImpacts,
    tripMemberIds: (scenario.members ?? []).map((m) => m.memberId),
  });
}

export function assertAdjustmentQueueExpectations(
  scenario: PackageHarnessScenario,
  result: PackageHarnessRunResult,
): string[] {
  const failures: string[] = [];
  if (result.adjustmentItems.length === 0) {
    if ((scenario.expected.plans ?? []).length > 0) {
      failures.push(`${scenario.scenarioId}: expected adjustment queue items`);
    }
    return failures;
  }

  for (const item of result.adjustmentItems) {
    if (!item.recommendations?.length) {
      failures.push(`${scenario.scenarioId}: adjustment item missing recommendations`);
    }
    const cluster =
      result.clusters.find((c) => c.clusterId === item.clusterId) ??
      result.clusters.find((c) => item.clusterId.includes(c.primaryRiskId));
    if (!cluster) continue;

    const scope = resolveAffectedMembersScope({
      cluster,
      risks: result.activeRisks,
    });
    if (item.affectedMembersScope !== scope) {
      failures.push(
        `${scenario.scenarioId}: adjustment scope ${item.affectedMembersScope} != ${scope}`,
      );
    }
  }

  return failures;
}

export function pruneHarnessActiveRisks(
  scenario: PackageHarnessScenario,
  active: ActiveRisk[],
): ActiveRisk[] {
  const expectedCounts = new Map<string, number>();
  for (const expected of scenario.expected.activeRisks) {
    expectedCounts.set(
      expected.knowledgeCode,
      (expectedCounts.get(expected.knowledgeCode) ?? 0) + 1,
    );
  }

  const seen = new Map<string, number>();
  return active.filter((risk) => {
    if (!risk.knowledgeCode) return true;
    const limit = expectedCounts.get(risk.knowledgeCode);
    if (limit === undefined) return false;
    const count = seen.get(risk.knowledgeCode) ?? 0;
    if (count >= limit) return false;
    seen.set(risk.knowledgeCode, count + 1);
    return true;
  });
}
