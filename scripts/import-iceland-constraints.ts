#!/usr/bin/env ts-node
/**
 * Import ALL Policy Lab constraints into physical_domain_constraint_configs.
 *
 * Source of truth (repo): scripts/data/policy-lab-constraints.seed.json
 * Currently 34 rules: CN pack + IS pack + shared drive_safety / matrix fallbacks.
 *
 * Usage:
 *   npx tsx scripts/import-iceland-constraints.ts
 *   npm run import:iceland-constraints
 *
 * Optional filter:
 *   npx tsx scripts/import-iceland-constraints.ts --only=IS
 *   npx tsx scripts/import-iceland-constraints.ts --only=CN
 *   npx tsx scripts/import-iceland-constraints.ts --only=SHARED
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

export interface ConstraintSeed {
  ruleId: string;
  enabled: boolean;
  description: string;
  threshold?: number | null;
  params: Record<string, unknown>;
}

const SEED_PATH = join(__dirname, 'data', 'policy-lab-constraints.seed.json');

export function loadAllConstraintSeeds(): ConstraintSeed[] {
  const raw = readFileSync(SEED_PATH, 'utf8');
  const parsed = JSON.parse(raw) as ConstraintSeed[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Empty or invalid seed file: ${SEED_PATH}`);
  }
  return parsed;
}

function classify(ruleId: string): 'IS' | 'CN' | 'SHARED' {
  if (ruleId.startsWith('cn_')) return 'CN';
  if (ruleId.startsWith('iceland_') || ruleId.startsWith('is_')) return 'IS';
  return 'SHARED';
}

function parseOnlyFilter(argv: string[]): 'ALL' | 'IS' | 'CN' | 'SHARED' {
  const arg = argv.find((a) => a.startsWith('--only='));
  if (!arg) return 'ALL';
  const v = arg.slice('--only='.length).toUpperCase();
  if (v === 'IS' || v === 'CN' || v === 'SHARED') return v;
  throw new Error(`Invalid --only=${v}; use IS|CN|SHARED`);
}

async function upsertSeed(seed: ConstraintSeed): Promise<void> {
  await prisma.physicalDomainConstraintConfig.upsert({
    where: { ruleId: seed.ruleId },
    update: {
      enabled: seed.enabled,
      description: seed.description,
      ...(seed.threshold !== undefined ? { threshold: seed.threshold } : {}),
      params: seed.params as any,
    },
    create: {
      ruleId: seed.ruleId,
      enabled: seed.enabled,
      description: seed.description,
      threshold: seed.threshold ?? null,
      params: seed.params as any,
    },
  });
  const kind = String((seed.params as any)?.kind ?? '-');
  console.log(`upserted ${seed.ruleId} (${kind}, enabled=${seed.enabled})`);
}

async function main() {
  const only = parseOnlyFilter(process.argv.slice(2));
  const all = loadAllConstraintSeeds();
  const seeds =
    only === 'ALL' ? all : all.filter((s) => classify(s.ruleId) === only);

  console.log(`Seed file: ${SEED_PATH}`);
  console.log(`Total in file: ${all.length}; importing: ${seeds.length} (filter=${only})`);

  let upserted = 0;
  for (const seed of seeds) {
    await upsertSeed(seed);
    upserted += 1;
  }
  console.log(`Done. Upserted ${upserted} Policy Lab constraint rules.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
