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
import { loadPackageImportCounts } from '../src/trips/execution-risk-center/knowledge/execution-risk-knowledge.loader';
import { importExecutionRiskKnowledgeVersion } from '../src/trips/execution-risk-center/knowledge/execution-risk-knowledge-import.util';

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
    await importExecutionRiskKnowledgeVersion(tx, {
      versionId: VERSION_ID,
      packageVersion: '1.0.0',
      status: 'DRAFT',
      sourcePath: EXECUTION_RISK_PACKAGE_ROOT,
      activate: true,
    });
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
