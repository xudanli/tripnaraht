#!/usr/bin/env npx tsx
/**
 * 将 SkillEvolver 进化后的 country_pack Markdown 写入 ReadinessPack.packData
 *
 *   npm run skill-evolver:sync-readiness -- --country IS
 *   npm run skill-evolver:sync-readiness -- --country IS --dry-run
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';
import { mergeSkillEvolverIntoPack } from '../src/agent/training/skill-evolver/utils/sync-country-pack-readiness.util';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function skillEvolverBasePath(): string {
  return (
    process.env.SKILL_EVOLVER_BASE_PATH?.trim() ||
    path.join(process.cwd(), 'data/skill-evolver')
  );
}

function loadEvolvedMarkdown(countryCode: string): string | null {
  const file = path.join(
    skillEvolverBasePath(),
    'artifacts/country-pack/current',
    `${countryCode.toUpperCase()}.md`,
  );
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\r?\n/, '').trim() || null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const countryCode = String(args.country ?? 'IS').toUpperCase();
  const packId = String(args.pack_id ?? 'pack.is.iceland');
  const dryRun = args.dry_run === true || args.dry_run === 'true';

  const markdown = loadEvolvedMarkdown(countryCode);
  if (!markdown) {
    process.stderr.write(
      `No evolved markdown at artifacts/country-pack/current/${countryCode}.md\n`,
    );
    process.exit(1);
  }

  const row = await prisma.readinessPack.findUnique({ where: { packId } });
  if (!row) {
    process.stderr.write(`ReadinessPack not found: ${packId}\n`);
    process.exit(1);
  }

  const pack = row.packData as ReadinessPack;
  const merged = mergeSkillEvolverIntoPack(pack, markdown, countryCode);

  if (dryRun) {
    process.stdout.write(
      `[dry-run] would merge skillEvolver (${markdown.length} chars) into ${packId}\n`,
    );
    return;
  }

  await prisma.readinessPack.update({
    where: { packId },
    data: {
      packData: merged as object,
      updatedAt: new Date(),
    },
  });

  process.stdout.write(
    `Synced skillEvolver markdown -> ReadinessPack ${packId} (${markdown.length} chars)\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
