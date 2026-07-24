/**
 * Import Execution Risk Package V1 knowledge into Prisma.
 *
 * Usage:
 *   npm run seed:execution-risk-knowledge
 *   npm run seed:execution-risk-knowledge -- --dry-run
 */

import { PrismaClient } from '@prisma/client';
import {
  EXECUTION_RISK_KNOWLEDGE_VERSION_ID,
  EXECUTION_RISK_PACKAGE_ROOT,
} from '../src/trips/execution-risk-center/knowledge/execution-risk-knowledge.mappers';
import {
  loadPackageCapabilityRows,
  loadPackageCausalChainRows,
  loadPackageDefinitionRows,
  loadPackageImportCounts,
  loadPackageInterventionActionRows,
  loadPackageMappingRows,
  loadPackageSeverityRuleRows,
} from '../src/trips/execution-risk-center/knowledge/execution-risk-knowledge.loader';

const prisma = new PrismaClient();
const VERSION_ID = EXECUTION_RISK_KNOWLEDGE_VERSION_ID;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const counts = loadPackageImportCounts();

  console.log(
    `Execution Risk knowledge import ${VERSION_ID}: ${JSON.stringify(counts)}, dryRun=${dryRun}`,
  );

  if (dryRun) {
    console.log('[dry-run] Would upsert knowledge version and rows');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.executionRiskKnowledgeVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    await tx.executionRiskKnowledgeVersion.upsert({
      where: { id: VERSION_ID },
      create: {
        id: VERSION_ID,
        packageVersion: '1.0.0',
        status: 'DRAFT',
        isActive: true,
        sourcePath: EXECUTION_RISK_PACKAGE_ROOT,
        rowCounts: counts,
        activatedAt: new Date(),
      },
      update: {
        packageVersion: '1.0.0',
        status: 'DRAFT',
        isActive: true,
        sourcePath: EXECUTION_RISK_PACKAGE_ROOT,
        rowCounts: counts,
        activatedAt: new Date(),
      },
    });

    await tx.executionRiskDefinition.deleteMany({ where: { knowledgeVersionId: VERSION_ID } });
    await tx.executionRiskSeverityRule.deleteMany({ where: { knowledgeVersionId: VERSION_ID } });
    await tx.executionRiskCausalChain.deleteMany({ where: { knowledgeVersionId: VERSION_ID } });
    await tx.executionRiskInterventionAction.deleteMany({
      where: { knowledgeVersionId: VERSION_ID },
    });
    await tx.executionRiskCodeMapping.deleteMany({ where: { knowledgeVersionId: VERSION_ID } });

    const capabilityByCode = new Map(
      loadPackageCapabilityRows().map((row) => [row.knowledgeCode, row]),
    );

    for (const row of loadPackageDefinitionRows()) {
      const capability = capabilityByCode.get(row.knowledgeCode);
      await tx.executionRiskDefinition.create({
        data: {
          id: `${VERSION_ID}:${row.knowledgeCode}`,
          knowledgeVersionId: VERSION_ID,
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
          id: row.ruleId,
          knowledgeVersionId: VERSION_ID,
          knowledgeCode: row.knowledgeCode,
          payload: row,
        },
      });
    }

    for (const row of loadPackageCausalChainRows()) {
      await tx.executionRiskCausalChain.create({
        data: {
          id: row.chainId,
          knowledgeVersionId: VERSION_ID,
          knowledgeCode: row.knowledgeCode,
          payload: row,
        },
      });
    }

    for (const row of loadPackageInterventionActionRows()) {
      await tx.executionRiskInterventionAction.create({
        data: {
          id: row.actionCode,
          knowledgeVersionId: VERSION_ID,
          actionCategory: row.actionCategory,
          payload: row,
        },
      });
    }

    for (const row of loadPackageMappingRows()) {
      await tx.executionRiskCodeMapping.create({
        data: {
          id: `${VERSION_ID}:${row.knowledgeCode}`,
          knowledgeVersionId: VERSION_ID,
          canonicalCode: row.canonicalCode,
          knowledgeCode: row.knowledgeCode,
          riskType: row.riskType,
          sourceAliases: row.sourceAliases,
          isRootCause: row.isRootCause,
          status: row.status,
        },
      });
    }
  });

  console.log(`✓ Imported execution risk knowledge v${VERSION_ID}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
