import type { Prisma, PrismaClient } from '@prisma/client';
import {
  EXECUTION_RISK_PACKAGE_ROOT,
} from './execution-risk-knowledge.mappers';
import {
  loadPackageCapabilityRows,
  loadPackageCausalChainRows,
  loadPackageDefinitionRows,
  loadPackageImportCounts,
  loadPackageInterventionActionRows,
  loadPackageMappingRows,
  loadPackageSeverityRuleRows,
} from './execution-risk-knowledge.loader';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ImportKnowledgeVersionInput {
  versionId: string;
  packageVersion: string;
  status: string;
  sourcePath?: string;
  /** When true, deactivate other versions and set this one active */
  activate?: boolean;
}

export interface ImportKnowledgeVersionResult {
  versionId: string;
  packageVersion: string;
  status: string;
  isActive: boolean;
  sourcePath: string;
  rowCounts: Record<string, number>;
}

export function buildKnowledgeVersionId(packageVersion: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const safe = packageVersion.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 16);
  return `erv_${safe}_${stamp}`.slice(0, 32);
}

export async function importExecutionRiskKnowledgeVersion(
  tx: Tx,
  input: ImportKnowledgeVersionInput,
): Promise<ImportKnowledgeVersionResult> {
  const sourcePath = input.sourcePath ?? EXECUTION_RISK_PACKAGE_ROOT;
  const counts = loadPackageImportCounts();
  const versionId = input.versionId;
  const activate = input.activate === true;

  if (activate) {
    await tx.executionRiskKnowledgeVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  await tx.executionRiskKnowledgeVersion.upsert({
    where: { id: versionId },
    create: {
      id: versionId,
      packageVersion: input.packageVersion,
      status: input.status,
      isActive: activate,
      sourcePath,
      rowCounts: counts,
      activatedAt: activate ? new Date() : null,
    },
    update: {
      packageVersion: input.packageVersion,
      status: input.status,
      isActive: activate,
      sourcePath,
      rowCounts: counts,
      activatedAt: activate ? new Date() : null,
    },
  });

  await tx.executionRiskDefinition.deleteMany({ where: { knowledgeVersionId: versionId } });
  await tx.executionRiskSeverityRule.deleteMany({ where: { knowledgeVersionId: versionId } });
  await tx.executionRiskCausalChain.deleteMany({ where: { knowledgeVersionId: versionId } });
  await tx.executionRiskInterventionAction.deleteMany({
    where: { knowledgeVersionId: versionId },
  });
  await tx.executionRiskCodeMapping.deleteMany({ where: { knowledgeVersionId: versionId } });

  const capabilityByCode = new Map(
    loadPackageCapabilityRows().map((row) => [row.knowledgeCode, row]),
  );

  for (const row of loadPackageDefinitionRows()) {
    const capability = capabilityByCode.get(row.knowledgeCode);
    await tx.executionRiskDefinition.create({
      data: {
        id: `${versionId}:${row.knowledgeCode}`.slice(0, 64),
        knowledgeVersionId: versionId,
        canonicalCode: row.canonicalCode,
        knowledgeCode: row.knowledgeCode,
        riskType: row.riskType,
        displayName: row.displayName,
        definition: row.definition,
        isRootCause: row.isRootCause,
        sourceAliases: row.sourceAliases,
        status: row.status,
        since: row.since ?? null,
        generationMode: capability?.generationMode ?? null,
        capabilityStatus: capability?.capabilityStatus ?? null,
      },
    });
  }

  for (const row of loadPackageSeverityRuleRows()) {
    await tx.executionRiskSeverityRule.create({
      data: {
        id: `${versionId}:${row.ruleId}`.slice(0, 128),
        knowledgeVersionId: versionId,
        knowledgeCode: row.knowledgeCode,
        payload: row as object,
      },
    });
  }

  for (const row of loadPackageCausalChainRows()) {
    await tx.executionRiskCausalChain.create({
      data: {
        id: `${versionId}:${row.chainId}`.slice(0, 64),
        knowledgeVersionId: versionId,
        knowledgeCode: row.knowledgeCode,
        payload: row as object,
      },
    });
  }

  for (const row of loadPackageInterventionActionRows()) {
    await tx.executionRiskInterventionAction.create({
      data: {
        id: `${versionId}:${row.actionCode}`.slice(0, 128),
        knowledgeVersionId: versionId,
        actionCategory: row.actionCategory,
        payload: row as object,
      },
    });
  }

  for (const row of loadPackageMappingRows()) {
    await tx.executionRiskCodeMapping.create({
      data: {
        id: `${versionId}:${row.knowledgeCode}`.slice(0, 64),
        knowledgeVersionId: versionId,
        canonicalCode: row.canonicalCode,
        knowledgeCode: row.knowledgeCode,
        riskType: row.riskType,
        sourceAliases: row.sourceAliases,
        isRootCause: row.isRootCause,
        status: row.status,
      },
    });
  }

  return {
    versionId,
    packageVersion: input.packageVersion,
    status: input.status,
    isActive: activate,
    sourcePath,
    rowCounts: counts,
  };
}
