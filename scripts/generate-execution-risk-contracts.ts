#!/usr/bin/env npx tsx
/**
 * Sync Execution Risk contracts from Package V1 into runtime generated surface.
 *
 * Usage:
 *   npx tsx scripts/generate-execution-risk-contracts.ts
 *   npm run contracts:execution-risk
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACT_VERSION = '1.1.0';
const PACKAGE_SOURCE = path.join(
  process.cwd(),
  'docs/TripNARA-Execution-Risk-Backend-Package-V1/03_CONTRACTS/execution-risk-contracts-v1.ts',
);
const DEST_DIR = path.join(process.cwd(), 'src/generated/execution-risk-contracts');
const DEST_INDEX = path.join(DEST_DIR, 'index.ts');
const MANIFEST_OUT = path.join(DEST_DIR, 'manifest.json');

const REQUIRED_EXPORTS = [
  'AdjustmentItemType',
  'InterventionActionCategory',
  'RiskGenerationMode',
  'RiskCapabilityStatus',
  'AffectedMembersScope',
  'MemberImpactType',
  'KnowledgeStatus',
  'CanonicalRiskDefinition',
  'SeverityRule',
  'RiskCausalChain',
  'InterventionAction',
  'ExecutionRiskKnowledgeRepository',
  'ActiveRiskRefreshService',
  'ActiveRiskQueryService',
  'CanonicalPlanVersionWriter',
  'DecisionLedgerWriter',
];

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function main(): void {
  if (!fs.existsSync(PACKAGE_SOURCE)) {
    throw new Error(`Missing package contract source: ${PACKAGE_SOURCE}`);
  }

  const source = fs.readFileSync(PACKAGE_SOURCE, 'utf8');
  const header = `/**
 * @tripnara/execution-risk-contracts — frozen read surface for Execution Risk Center V1.1.
 * Source of truth: docs/TripNARA-Execution-Risk-Backend-Package-V1/03_CONTRACTS/execution-risk-contracts-v1.ts
 *
 * Regenerate: npm run contracts:execution-risk
 */

`;

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(DEST_INDEX, header + source);

  const indexContent = fs.readFileSync(DEST_INDEX, 'utf8');
  const missing = REQUIRED_EXPORTS.filter((name) => !indexContent.includes(name));
  if (missing.length) {
    throw new Error(`Generated contract missing exports: ${missing.join(', ')}`);
  }

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    sourcePath: 'docs/TripNARA-Execution-Risk-Backend-Package-V1/03_CONTRACTS/execution-risk-contracts-v1.ts',
    sourceSha256: sha256(source),
    outputPath: 'src/generated/execution-risk-contracts/index.ts',
    requiredExports: REQUIRED_EXPORTS,
  };
  fs.writeFileSync(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Execution risk contracts v${CONTRACT_VERSION} synced → ${DEST_INDEX}`);
}

main();
