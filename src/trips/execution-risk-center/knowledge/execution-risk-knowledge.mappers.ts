import { join } from 'path';
import {
  ActiveRiskType,
  AutomationCapability,
  CanonicalRiskDefinition,
  ExecutionMode,
  ExecutionRiskSeverity,
  InterventionAction,
  InterventionActionCategory,
  KnowledgeStatus,
  RiskCausalChain,
  SeverityRule,
  SeverityRuleOperator,
} from '../../../generated/execution-risk-contracts';
import type { RiskCausalChainWithHint } from './causal-risk-derivation.util';

export const EXECUTION_RISK_KNOWLEDGE_VERSION_ID = 'v1.0.0';
export const EXECUTION_RISK_PACKAGE_ROOT = join(
  process.cwd(),
  'docs/TripNARA-Execution-Risk-Backend-Package-V1',
);

export interface PackageRiskDefinitionRow {
  canonicalCode: string;
  knowledgeCode: string;
  riskType: string;
  displayName: Record<string, string>;
  definition: string;
  isRootCause: boolean;
  sourceAliases: string[];
  status: string;
  since?: string;
}

export interface PackageSeverityRuleRow {
  ruleId: string;
  knowledgeCode: string;
  level: string;
  metric: string;
  operator: string;
  minValue?: number;
  maxValue?: number;
  matchValue?: string;
  unit: string;
  conditions?: unknown[];
  priority: number;
  description?: string;
  evidenceIds?: string[];
}

export interface PackageCausalChainRow {
  chainId: string;
  knowledgeCode: string;
  name?: string;
  nodes: Array<{
    nodeId: string;
    knowledgeCode: string;
    nodeType: string;
    description: string;
  }>;
  edges: Array<{
    fromNodeId: string;
    toNodeId: string;
    edgeType: string;
  }>;
  clusterHint?: {
    primaryKnowledgeCode?: string;
    memberRiskCodes?: string[];
    suppressAsIndependent?: string[];
  };
}

export interface PackageInterventionActionRow {
  actionCode: string;
  actionCategory: string;
  name: Record<string, string> | string;
  description: string;
  typicalUseCase: string;
  safetyImpact: number;
  timeImpactMinRange: { min: number; max: number };
  fatigueImpact: number;
  experienceImpact: number;
  budgetImpactDescription?: string;
  bookingImpact: string;
  reversibility: 'YES' | 'PARTIAL' | 'NO';
  userConfirmRequired: boolean;
  aiAutoExecutable: boolean;
  capabilities: string[];
  executionMode: ExecutionMode;
  applicableRiskCodes: string[];
}

export interface PackageCapabilityRow {
  canonicalCode: string;
  knowledgeCode: string;
  generationMode: string;
  capabilityStatus: string;
  severityRuleIds?: string[];
}

export interface ExecutionRiskKnowledgeSnapshot {
  version: string;
  status: KnowledgeStatus;
  definitions: CanonicalRiskDefinition[];
  severityRulesByCode: Map<string, SeverityRule[]>;
  causalChainsByCode: Map<string, RiskCausalChain[]>;
  actionsByCode: Map<string, InterventionAction>;
}

const SEVERITY_LEVEL_MAP: Record<string, ExecutionRiskSeverity> = {
  STOP: ExecutionRiskSeverity.STOP,
  REPLAN: ExecutionRiskSeverity.REPLAN_REQUIRED,
  REPLAN_REQUIRED: ExecutionRiskSeverity.REPLAN_REQUIRED,
  AT_RISK: ExecutionRiskSeverity.AT_RISK,
};

const EDGE_TYPE_MAP: Record<string, RiskCausalChain['edges'][number]['edgeType']> = {
  CAUSES: 'CAUSES',
  AMPLIFIES: 'AMPLIFIES',
  RESOLVES: 'RESOLVES',
  TRIGGERS: 'CAUSES',
};

const ACTION_CATEGORY_MAP: Record<string, InterventionActionCategory> = {
  TIME: InterventionActionCategory.TIME,
  TIMING: InterventionActionCategory.TIME,
  ROUTE: InterventionActionCategory.ROUTE,
  ACTIVITY: InterventionActionCategory.ACTIVITY,
  BOOKING: InterventionActionCategory.BOOKING,
  TEAM: InterventionActionCategory.TEAM,
  TRANSPORT: InterventionActionCategory.TRANSPORT,
  EMERGENCY: InterventionActionCategory.EMERGENCY,
};

export function mapRiskDefinition(
  row: PackageRiskDefinitionRow,
  capability?: PackageCapabilityRow,
): CanonicalRiskDefinition {
  return {
    canonicalCode: row.canonicalCode,
    knowledgeCode: row.knowledgeCode,
    riskType: row.riskType as ActiveRiskType,
    displayName: row.displayName,
    sourceAliases: row.sourceAliases ?? [],
    status: row.status as KnowledgeStatus,
    since: row.since ?? '',
    isRootCause: row.isRootCause,
    ...(capability ? {} : {}),
  };
}

export type MappedSeverityRule = SeverityRule & { matchValue?: string };

export function mapSeverityRule(row: PackageSeverityRuleRow): MappedSeverityRule | null {
  const level = SEVERITY_LEVEL_MAP[row.level];
  if (!level) return null;

  return {
    ruleId: row.ruleId,
    knowledgeCode: row.knowledgeCode,
    level,
    metric: row.metric as SeverityRule['metric'],
    operator: row.operator as SeverityRuleOperator,
    minValue: row.minValue,
    maxValue: row.maxValue,
    unit: row.unit,
    conditions: (row.conditions ?? []) as SeverityRule['conditions'],
    priority: row.priority,
    evidenceIds: row.evidenceIds ?? [],
    matchValue: row.matchValue,
  };
}

export function mapCausalChain(row: PackageCausalChainRow): RiskCausalChainWithHint {
  const nodes = row.nodes.map((node) => ({
    nodeId: node.nodeId,
    knowledgeCode: node.knowledgeCode,
    nodeType: node.nodeType as RiskCausalChain['nodes'][number]['nodeType'],
    description: node.description,
  }));
  const rootCause = nodes.find((n) => n.nodeType === 'ROOT_CAUSE') ?? nodes[0];

  return {
    chainId: row.chainId,
    knowledgeCode: row.knowledgeCode,
    rootCause,
    nodes,
    edges: row.edges.map((edge) => ({
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeType: EDGE_TYPE_MAP[edge.edgeType] ?? 'CAUSES',
    })),
    clusterHint: row.clusterHint,
  };
}

export function mapInterventionAction(row: PackageInterventionActionRow): InterventionAction {
  const name =
    typeof row.name === 'string' ? row.name : row.name.en ?? row.name.zh ?? row.actionCode;

  return {
    actionCode: row.actionCode,
    actionCategory:
      ACTION_CATEGORY_MAP[row.actionCategory] ?? InterventionActionCategory.TIME,
    name,
    description: row.description,
    typicalUseCase: row.typicalUseCase,
    safetyImpact: row.safetyImpact,
    timeImpactMinRange: row.timeImpactMinRange,
    fatigueImpact: row.fatigueImpact,
    experienceImpact: row.experienceImpact,
    budgetImpactDescription: row.budgetImpactDescription,
    bookingImpact: row.bookingImpact,
    reversibility: row.reversibility,
    userConfirmRequired: row.userConfirmRequired,
    aiAutoExecutable: row.aiAutoExecutable,
    capabilities: row.capabilities as AutomationCapability[],
    executionMode: row.executionMode,
    applicableRiskCodes: row.applicableRiskCodes ?? [],
  };
}

export function indexCausalChains(chains: RiskCausalChain[]): Map<string, RiskCausalChain[]> {
  const map = new Map<string, RiskCausalChain[]>();
  for (const chain of chains) {
    const codes = new Set<string>([chain.knowledgeCode]);
    for (const node of chain.nodes) codes.add(node.knowledgeCode);
    for (const code of codes) {
      const list = map.get(code) ?? [];
      list.push(chain);
      map.set(code, list);
    }
  }
  return map;
}

export function indexSeverityRules(rules: SeverityRule[]): Map<string, SeverityRule[]> {
  const map = new Map<string, SeverityRule[]>();
  for (const rule of rules) {
    const list = map.get(rule.knowledgeCode) ?? [];
    list.push(rule);
    map.set(rule.knowledgeCode, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.priority - b.priority);
  }
  return map;
}
