#!/usr/bin/env npx tsx
/**
 * Planning smoke: PILOT-IS-05/07/08/09/10 (planning-period cert scenarios).
 *
 * Prerequisite:
 *   npm run tep:pilot-seed -- --template=planning-all --reset
 *   # or --template=all
 *
 * Usage:
 *   npm run tep:pilot-planning-smoke -- --template=05
 *   npm run tep:pilot-planning-smoke -- --template=planning-all
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import {
  assertSafeDatabase,
  loadProjectEnv,
  parseEnvProfile,
} from './tep-pilot-smoke.util';
import {
  parsePlanningSmokeTemplate,
  runPlanningPilotSmokeBatch,
} from './tep-pilot-planning-smoke.util';

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertSafeDatabase();

  const template = parsePlanningSmokeTemplate(process.argv);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(JSON.stringify(await runPlanningPilotSmokeBatch(prisma, template), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
