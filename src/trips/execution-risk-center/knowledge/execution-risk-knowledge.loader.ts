import { readFileSync } from 'fs';
import { join } from 'path';
import { KnowledgeStatus } from '../../../generated/execution-risk-contracts';
import {
  EXECUTION_RISK_KNOWLEDGE_VERSION_ID,
  EXECUTION_RISK_PACKAGE_ROOT,
  ExecutionRiskKnowledgeSnapshot,
  PackageCapabilityRow,
  PackageCausalChainRow,
  PackageInterventionActionRow,
  PackageRiskDefinitionRow,
  PackageSeverityRuleRow,
  indexCausalChains,
  indexSeverityRules,
  mapCausalChain,
  mapInterventionAction,
  mapRiskDefinition,
  mapSeverityRule,
} from './execution-risk-knowledge.mappers';

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(EXECUTION_RISK_PACKAGE_ROOT, relPath), 'utf8')) as T;
}

function parseMappingCsv(csv: string): PackageRiskDefinitionRow[] {
  const lines = csv.trim().split('\n');
  const [, ...rows] = lines;
  return rows.map((line) => {
    const [canonicalCode, knowledgeCode, riskType, sourceAliases, isRootCause, status] =
      line.split(',');
    return {
      canonicalCode,
      knowledgeCode,
      riskType,
      displayName: { en: canonicalCode },
      definition: '',
      isRootCause: isRootCause === 'true',
      sourceAliases: sourceAliases.split(';').filter(Boolean),
      status,
    };
  });
}

export function loadExecutionRiskKnowledgeFromPackage(): ExecutionRiskKnowledgeSnapshot {
  const defsFile = readJson<{ definitions: PackageRiskDefinitionRow[]; status: string }>(
    '04_KNOWLEDGE/risk-definitions-v1.json',
  );
  const rulesFile = readJson<{ rules: PackageSeverityRuleRow[] }>(
    '04_KNOWLEDGE/severity-rules-v1.json',
  );
  const chainsFile = readJson<{ chains: PackageCausalChainRow[] }>(
    '04_KNOWLEDGE/causal-chains-v1.json',
  );
  const actionsFile = readJson<{ actions: PackageInterventionActionRow[] }>(
    '04_KNOWLEDGE/intervention-actions-v1.json',
  );
  const matrixFile = readJson<{ definitions: PackageCapabilityRow[] }>(
    '05_MAPPING/risk-capability-matrix-v1.json',
  );

  const capabilityByCode = new Map(
    matrixFile.definitions.map((row) => [row.knowledgeCode, row]),
  );

  const definitions = defsFile.definitions.map((row) =>
    mapRiskDefinition(row, capabilityByCode.get(row.knowledgeCode)),
  );

  const severityRules = rulesFile.rules
    .map(mapSeverityRule)
    .filter((rule): rule is NonNullable<typeof rule> => rule !== null);

  const causalChains = chainsFile.chains.map(mapCausalChain);
  const actions = actionsFile.actions.map(mapInterventionAction);

  return {
    version: EXECUTION_RISK_KNOWLEDGE_VERSION_ID,
    status: defsFile.status as KnowledgeStatus,
    definitions,
    severityRulesByCode: indexSeverityRules(severityRules),
    causalChainsByCode: indexCausalChains(causalChains),
    actionsByCode: new Map(actions.map((action) => [action.actionCode, action])),
  };
}

export function loadPackageImportCounts(): Record<string, number> {
  const snapshot = loadExecutionRiskKnowledgeFromPackage();
  const chainsFile = readJson<{ chains: unknown[] }>('04_KNOWLEDGE/causal-chains-v1.json');
  const csv = readFileSync(
    join(EXECUTION_RISK_PACKAGE_ROOT, '05_MAPPING/risk-code-mapping-v1.csv'),
    'utf8',
  );
  const mappings = parseMappingCsv(csv);

  return {
    definitions: snapshot.definitions.length,
    severityRules: [...snapshot.severityRulesByCode.values()].reduce(
      (sum, rules) => sum + rules.length,
      0,
    ),
    causalChains: chainsFile.chains.length,
    interventionActions: snapshot.actionsByCode.size,
    codeMappings: mappings.length,
  };
}

export function loadPackageMappingRows(): PackageRiskDefinitionRow[] {
  const csv = readFileSync(
    join(EXECUTION_RISK_PACKAGE_ROOT, '05_MAPPING/risk-code-mapping-v1.csv'),
    'utf8',
  );
  return parseMappingCsv(csv);
}

export function loadPackageDefinitionRows(): PackageRiskDefinitionRow[] {
  return readJson<{ definitions: PackageRiskDefinitionRow[] }>(
    '04_KNOWLEDGE/risk-definitions-v1.json',
  ).definitions;
}

export function loadPackageSeverityRuleRows(): PackageSeverityRuleRow[] {
  return readJson<{ rules: PackageSeverityRuleRow[] }>('04_KNOWLEDGE/severity-rules-v1.json')
    .rules;
}

export function loadPackageCausalChainRows(): PackageCausalChainRow[] {
  return readJson<{ chains: PackageCausalChainRow[] }>('04_KNOWLEDGE/causal-chains-v1.json')
    .chains;
}

export function loadPackageInterventionActionRows(): PackageInterventionActionRow[] {
  return readJson<{ actions: PackageInterventionActionRow[] }>(
    '04_KNOWLEDGE/intervention-actions-v1.json',
  ).actions;
}

export function loadPackageCapabilityRows(): PackageCapabilityRow[] {
  return readJson<{ definitions: PackageCapabilityRow[] }>(
    '05_MAPPING/risk-capability-matrix-v1.json',
  ).definitions;
}
