/**
 * Seed CountryProfile V2 from data/country-profiles/*.v2.json
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/seed-country-profile-v2.ts [IS]
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  parseAndValidateV2Seed,
  seedV2ToPrismaUpdate,
} from '../src/countries/country-profile-v2.mapper';

async function main(): Promise<void> {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : ['IS'];
  const prisma = new PrismaClient();
  const dataDir = path.join(process.cwd(), 'data', 'country-profiles');

  for (const code of codes) {
    const file = path.join(dataDir, `${code.toUpperCase()}.v2.json`);
    if (!fs.existsSync(file)) {
      console.error(`Missing seed file: ${file}`);
      process.exitCode = 1;
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const seed = parseAndValidateV2Seed(raw);
    const payload = seedV2ToPrismaUpdate(seed);

    await prisma.countryProfile.upsert({
      where: { isoCode: payload.isoCode },
      create: payload,
      update: payload,
    });
    console.log(`✅ CountryProfile V2 upserted: ${payload.isoCode}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
