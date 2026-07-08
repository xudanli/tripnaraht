#!/usr/bin/env npx tsx
/**
 * Validate RFC-001 Phase 0 contract manifest.
 *
 * Usage:
 *   npm run contracts:rfc001-phase0
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACT_VERSION = '0.1.0';
const CONTRACTS_DIR = path.join(
  process.cwd(),
  'src/trips/guardian-decision-core/contracts',
);
const MANIFEST_OUT = path.join(
  process.cwd(),
  'src/generated/rfc001-phase0-contracts/manifest.json',
);

const REQUIRED_FILES = [
  'entity-ref.types.ts',
  'world-state.types.ts',
  'decision-problem.types.ts',
  'plan-operation.types.ts',
  'guardian-outputs.types.ts',
  'decision-workspace.types.ts',
  'authorization.types.ts',
  'decision-record.types.ts',
  'plan-version.types.ts',
  'index.ts',
  'schemas/rfc001-phase0.schemas.ts',
];

const REQUIRED_EXPORTS = [
  'WorldStateAssertion',
  'Rfc001DecisionProblem',
  'DecisionWorkspace',
  'Rfc001ConstraintAssertion',
  'Rfc001LoadAssessment',
  'Rfc001RepairCandidate',
  'Rfc001DecisionRecord',
  'PlanVersion',
  'AuthorizationRequirement',
  'RFC001_PHASE0_CONTRACT_VERSION',
];

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex');
}

function main(): void {
  for (const rel of REQUIRED_FILES) {
    const full = path.join(CONTRACTS_DIR, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`Missing contract file: ${rel}`);
    }
  }

  const allContent = REQUIRED_FILES.map((rel) =>
    fs.readFileSync(path.join(CONTRACTS_DIR, rel), 'utf8'),
  ).join('\n');
  const missing = REQUIRED_EXPORTS.filter(
    (name) => !allContent.includes(`interface ${name}`) && !allContent.includes(`export const ${name}`),
  );
  if (missing.length) {
    throw new Error(`Contract index missing exports: ${missing.join(', ')}`);
  }

  const fileHashes: Record<string, string> = {};
  for (const rel of REQUIRED_FILES) {
    fileHashes[rel] = sha256File(path.join(CONTRACTS_DIR, rel));
  }

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    rfc: 'RFC-001',
    phase: 0,
    generatedAt: new Date().toISOString(),
    ironRule:
      'Only Decision Core may form DecisionRecord; only authorized DecisionRecord may change Effective Plan.',
    files: fileHashes,
    requiredExports: REQUIRED_EXPORTS,
  };

  fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true });
  fs.writeFileSync(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`RFC-001 Phase 0 contracts OK (${CONTRACT_VERSION})`);
  console.log(`Manifest: ${MANIFEST_OUT}`);
}

main();
