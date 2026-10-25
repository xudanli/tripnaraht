import { KnowledgeStatus } from '../../../generated/execution-risk-contracts';
import type {
  CanonicalRiskDefinition,
  InterventionAction,
  RiskCausalChain,
  SeverityRule,
} from '../../../generated/execution-risk-contracts';
import { ActiveRiskKnowledgeEnrichmentService } from './active-risk-knowledge-enrichment.service';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';
import {
  indexCausalChains,
  indexSeverityRules,
  mapCausalChain,
  mapInterventionAction,
  mapRiskDefinition,
  mapSeverityRule,
  type PackageCausalChainRow,
  type PackageInterventionActionRow,
  type PackageRiskDefinitionRow,
  type PackageSeverityRuleRow,
} from './execution-risk-knowledge.mappers';
import { SeverityRuleEvaluatorService } from './severity-rule-evaluator.service';
import {
  assertScenarioExpectations,
  loadPackageHarnessFile,
  runPackageHarnessScenario,
} from '../harness/package-harness.runner';
import { PACKAGE_HARNESS_SCENARIO_IDS_1_10 } from '../harness/package-harness.types';

/** Default smoke set for activate/validate gate (P1). */
export const HARNESS_GATE_SMOKE_IDS = PACKAGE_HARNESS_SCENARIO_IDS_1_10.slice(0, 3);

export interface KnowledgeGateSnapshotInput {
  versionId: string;
  definitions: PackageRiskDefinitionRow[];
  severityRules: PackageSeverityRuleRow[];
  causalChains: PackageCausalChainRow[];
  actions: PackageInterventionActionRow[];
}

export interface HarnessGateResult {
  ran: boolean;
  passed: boolean;
  scenarioIds: string[];
  failures: string[];
  note?: string;
}

export function buildHarnessKnowledgeStackFromGateSnapshot(input: KnowledgeGateSnapshotInput): {
  knowledge: ExecutionRiskKnowledgeRepositoryService;
  enrichment: ActiveRiskKnowledgeEnrichmentService;
} {
  const definitions: CanonicalRiskDefinition[] = input.definitions.map((row) =>
    mapRiskDefinition(row),
  );
  const severityRules = input.severityRules
    .map(mapSeverityRule)
    .filter((rule): rule is SeverityRule => rule !== null);
  const causalChains = input.causalChains.map(mapCausalChain) as RiskCausalChain[];
  const actions = input.actions.map(mapInterventionAction);

  const severityRulesByCode = indexSeverityRules(severityRules);
  const causalChainsByCode = indexCausalChains(causalChains);
  const actionsByCode = new Map<string, InterventionAction>(
    actions.map((action) => [action.actionCode, action]),
  );

  const knowledge: Pick<
    ExecutionRiskKnowledgeRepositoryService,
    | 'findRiskDefinition'
    | 'findSeverityRules'
    | 'findCausalChains'
    | 'findInterventionActions'
    | 'getActiveKnowledgeVersion'
  > = {
    findRiskDefinition: async (code) =>
      definitions.find((d) => d.knowledgeCode === code) ?? null,
    findSeverityRules: async (code) => severityRulesByCode.get(code) ?? [],
    findCausalChains: async (code) => causalChainsByCode.get(code) ?? [],
    findInterventionActions: async (code) => actionsByCode.get(code) ?? null,
    getActiveKnowledgeVersion: async () => ({
      version: input.versionId,
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

export async function runKnowledgeHarnessGate(
  input: KnowledgeGateSnapshotInput,
  scenarioIds: string[] = [...HARNESS_GATE_SMOKE_IDS],
): Promise<HarnessGateResult> {
  const file = loadPackageHarnessFile();
  const selected = file.scenarios.filter((s) => scenarioIds.includes(s.scenarioId));
  if (selected.length === 0) {
    return {
      ran: false,
      passed: false,
      scenarioIds,
      failures: [`No harness scenarios matched: ${scenarioIds.join(',')}`],
      note: 'Harness file missing selected smoke scenarios',
    };
  }

  const { knowledge, enrichment } = buildHarnessKnowledgeStackFromGateSnapshot(input);
  const failures: string[] = [];

  for (const scenario of selected) {
    try {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      failures.push(...assertScenarioExpectations(scenario, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${scenario.scenarioId}: harness threw ${message}`);
    }
  }

  return {
    ran: true,
    passed: failures.length === 0,
    scenarioIds: selected.map((s) => s.scenarioId),
    failures,
    note: failures.length === 0 ? 'Smoke harness gate passed' : 'Smoke harness gate failed',
  };
}
