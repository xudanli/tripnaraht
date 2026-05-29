#!/usr/bin/env npx tsx
/**
 * 从 E2E Case 注册表导出 SkillEvolver replay-cases JSON
 *
 *   npx tsx scripts/export-e2e-to-skill-evolver-replay.ts
 *   npx tsx scripts/export-e2e-to-skill-evolver-replay.ts --ids iceland-highlands-001,iceland-highlands-dem-missing-001
 *   npx tsx scripts/export-e2e-to-skill-evolver-replay.ts --all-td
 */
import * as fs from 'fs';
import * as path from 'path';
import { getTdReplayFixturesForRun } from '../src/trips/decision/evaluation/e2e-cases/registry';
import { e2eCaseToReplayFixture } from '../src/agent/training/skill-evolver/utils/e2e-case-replay-export.util';

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir =
    process.env.SKILL_EVOLVER_BASE_PATH?.trim()
      ? path.join(process.env.SKILL_EVOLVER_BASE_PATH, 'replay-cases')
      : path.join(process.cwd(), 'data/skill-evolver/replay-cases');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let cases = getTdReplayFixturesForRun();
  if (args.ids && typeof args.ids === 'string') {
    const want = new Set(args.ids.split(',').map((s) => s.trim()));
    cases = cases.filter((c) => want.has(c.id));
  } else if (!args.all_td) {
    // 默认导出 smoke 子集
    const smokeIds = [
      'iceland-highlands-001',
      'iceland-highlands-dem-missing-001',
      'iceland-ring-road-001',
      'iceland-storm-icecave-failure-001',
    ];
    cases = cases.filter((c) => smokeIds.includes(c.id));
  }

  const index: Array<{ caseId: string; source_e2e_case_id: string; file: string }> = [];

  for (const e2e of cases) {
    const fixture = e2eCaseToReplayFixture(e2e);
    const file = path.join(outDir, `${fixture.caseId}.json`);
    fs.writeFileSync(file, JSON.stringify(fixture, null, 2), 'utf-8');
    index.push({
      caseId: fixture.caseId,
      source_e2e_case_id: fixture.source_e2e_case_id,
      file: path.relative(process.cwd(), file),
    });
    process.stdout.write(`[export] ${e2e.id} -> ${file}\n`);
  }

  const indexPath = path.join(outDir, 'index.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), cases: index }, null, 2),
    'utf-8',
  );
  process.stdout.write(`[export] index -> ${indexPath} (${index.length} cases)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
