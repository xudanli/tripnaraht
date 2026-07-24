#!/usr/bin/env npx tsx
/**
 * Validate and refresh Decision Semantics contract manifest.
 *
 * Usage:
 *   npx tsx scripts/generate-decision-semantics-contracts.ts
 *   npm run contracts:decision-semantics
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACT_VERSION = '1.6.1';
const SOURCE_TYPES = path.join(
  process.cwd(),
  'src/trips/decision-semantics/types/decision-semantics.types.ts',
);
const CONTRACT_INDEX = path.join(
  process.cwd(),
  'src/generated/decision-semantics-contracts/index.ts',
);
const MANIFEST_OUT = path.join(
  process.cwd(),
  'src/generated/decision-semantics-contracts/manifest.json',
);

const REQUIRED_TYPE_EXPORTS = [
  'DecisionProblem',
  'ConstraintAssertion',
  'AffectedScope',
  'DecisionOption',
  'TradeoffDimension',
  'DecisionAuthority',
  'TripMutationSet',
  'DecisionRecord',
  'DecisionOutcomeValidation',
  'DecisionLedgerRefs',
  'ExperienceOutcome',
  'RepairCommand',
  'ExecutionCapability',
  'DecisionExecutionStatus',
  'DecisionCenterOverview',
  'DecisionExecutionStatusResponse',
];

const REQUIRED_ENUM_EXPORTS = [
  'ConstraintEnforcement',
  'ConstraintNature',
  'TradeoffDimensionKey',
  'OutcomeValidationVerdict',
  'DecisionExecutionMode',
  'ObservedOutcomeSource',
];

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertFileExists(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function assertExportsListed(indexContent: string, names: string[], kind: string): void {
  const missing = names.filter((name) => !indexContent.includes(name));
  if (missing.length) {
    throw new Error(`Contract index missing ${kind} exports: ${missing.join(', ')}`);
  }
}

function main(): void {
  assertFileExists(SOURCE_TYPES, 'source types');
  assertFileExists(CONTRACT_INDEX, 'contract index');

  const indexContent = fs.readFileSync(CONTRACT_INDEX, 'utf8');
  assertExportsListed(indexContent, REQUIRED_TYPE_EXPORTS, 'type');
  assertExportsListed(indexContent, REQUIRED_ENUM_EXPORTS, 'enum');

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      typesFile: 'src/trips/decision-semantics/types/decision-semantics.types.ts',
      sha256: sha256File(SOURCE_TYPES),
    },
    entryPoints: {
      primary: 'src/generated/decision-semantics-contracts/index.ts',
      alias: 'src/generated/decision-semantics-api.ts',
    },
    requiredTypeExports: REQUIRED_TYPE_EXPORTS,
    requiredEnumExports: REQUIRED_ENUM_EXPORTS,
  };

  fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true });
  fs.writeFileSync(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Decision Semantics contracts OK (v${CONTRACT_VERSION})`);
  console.log(`  manifest: ${path.relative(process.cwd(), MANIFEST_OUT)}`);
  console.log(`  source sha256: ${manifest.source.sha256.slice(0, 12)}…`);
}

main();
