#!/usr/bin/env npx tsx
/**
 * Agent 联调：验证 countryPack.getBlocks 是否带上 SkillEvolver 进化块
 *
 *   npm run agent:country-pack-evolver-smoke
 *   SKILL_EVOLVER_INJECT_COUNTRY_PACK=IS npm run agent:country-pack-evolver-smoke -- --inject
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/prisma/prisma.service';
import { CountryPackGetBlocksSkill } from '../src/skills/country-pack/country-pack-get-blocks.skill';
dotenv.config({ path: path.join(process.cwd(), '.env') });

@Module({
  providers: [
    PrismaService,
    {
      provide: CountryPackGetBlocksSkill,
      useFactory: (prisma: PrismaService) => new CountryPackGetBlocksSkill(prisma),
      inject: [PrismaService],
    },
  ],
})
class AgentCountryPackSmokeModule {}

function parseArgs(argv: string[]): { injectOnly: boolean; dbOnly: boolean } {
  return {
    injectOnly: argv.includes('--inject'),
    dbOnly: argv.includes('--db-only'),
  };
}

async function runOnce(label: string, useInject: boolean): Promise<boolean> {
  if (useInject) {
    process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK = 'IS';
  } else {
    delete process.env.SKILL_EVOLVER_INJECT_COUNTRY_PACK;
  }

  const app = await NestFactory.createApplicationContext(AgentCountryPackSmokeModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    await prisma.$connect();

    const packRow = await prisma.readinessPack.findUnique({
      where: { packId: 'pack.is.iceland' },
      select: { packData: true, updatedAt: true },
    });
    const skillEvolverInDb = !!(packRow?.packData as { skillEvolver?: { markdown?: string } })
      ?.skillEvolver?.markdown;
    const skill = app.get(CountryPackGetBlocksSkill);

    const result = await skill.execute({
      packId: 'IS',
      topics: ['SAFETY', 'ROAD_RULES'],
      phase: 'planning',
    });

    const evolverBlock = result.blocks.find((b) =>
      String(b.key ?? '').includes('SKILL_EVOLVER_COUNTRY_PACK'),
    );
    const text = evolverBlock?.text ?? '';
    const source = (evolverBlock?.data as { source?: string })?.source ?? 'none';
    const hasDem = /dem|高地|DEM/i.test(text);
    const hasReject = /reject|拒绝/i.test(text);

    process.stdout.write(`\n=== ${label} (INJECT=${useInject ? 'IS' : 'off'}) ===\n`);
    process.stdout.write(`  ReadinessPack.skillEvolver in DB: ${skillEvolverInDb}\n`);
    process.stdout.write(`  blocks: ${result.blocks.length}, missingTopics: ${result.missingTopics.join(',') || 'none'}\n`);
    process.stdout.write(`  SkillEvolver block: ${evolverBlock ? 'yes' : 'NO'}\n`);
    if (evolverBlock) {
      process.stdout.write(`  source: ${source}\n`);
      process.stdout.write(`  text preview: ${text.slice(0, 200).replace(/\n/g, ' ')}...\n`);
      process.stdout.write(`  has DEM keywords: ${hasDem}, has REJECT keywords: ${hasReject}\n`);
    }

    return !!evolverBlock && hasDem;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const { injectOnly, dbOnly } = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    process.stderr.write('DATABASE_URL missing — DB path will not work\n');
    process.exit(1);
  }

  let ok = true;
  if (!injectOnly) {
    ok = (await runOnce('DB path (production-like)', false)) && ok;
  }
  if (!dbOnly) {
    ok = (await runOnce('File inject path (dev)', true)) && ok;
  }

  process.stdout.write(ok ? '\n[agent-smoke] PASS\n' : '\n[agent-smoke] FAIL — no SkillEvolver block or missing DEM hints\n');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
