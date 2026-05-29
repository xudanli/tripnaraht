#!/usr/bin/env npx tsx
/**
 * 校验 SkillEvolver 技能是否符合 agentskills.io 规范
 *
 *   npm run skill-evolver:validate-agent-skills
 *   npm run skill-evolver:validate-agent-skills -- --export-only
 */
import * as fs from 'fs';
import * as path from 'path';
import { validateAllRegisteredSkills } from '../src/agent/training/skill-evolver/utils/agent-skills-export.util';
import {
  skillIdToAgentSkillsName,
  validateExportedAgentSkillsFile,
} from '../src/agent/training/skill-evolver/utils/agent-skills-compat.util';

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
  const basePath =
    (typeof args.base === 'string' ? args.base : undefined) ??
    process.env.SKILL_EVOLVER_BASE_PATH?.trim() ??
    path.join(process.cwd(), 'data/skill-evolver');

  let errorCount = 0;
  let warnCount = 0;

  const sourceResults = validateAllRegisteredSkills(basePath);
  for (const { skillId, issues } of sourceResults) {
    for (const i of issues) {
      const line = `[${i.severity}] ${skillId}: ${i.rule} — ${i.message}`;
      if (i.severity === 'error') {
        process.stderr.write(`${line}\n`);
        errorCount++;
      } else {
        process.stderr.write(`${line}\n`);
        warnCount++;
      }
    }
  }

  const exportRoot = path.join(basePath, 'agent-skills-export');
  if (args.export_only !== true && fs.existsSync(exportRoot)) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(exportRoot, 'manifest.json'), 'utf-8'),
    ) as { skills: Array<{ tripnaraSkillId: string; agentSkillsName: string; skillMdPath: string }> };

    for (const row of manifest.skills) {
      if (!fs.existsSync(row.skillMdPath)) {
        process.stderr.write(`[error] missing export ${row.skillMdPath}\n`);
        errorCount++;
        continue;
      }
      const raw = fs.readFileSync(row.skillMdPath, 'utf-8');
      const dirName = path.basename(path.dirname(row.skillMdPath));
      const issues = validateExportedAgentSkillsFile(raw, row.skillMdPath, dirName);
      if (skillIdToAgentSkillsName(row.tripnaraSkillId) !== dirName) {
        process.stderr.write(
          `[error] ${row.tripnaraSkillId}: export dir name mismatch ${dirName}\n`,
        );
        errorCount++;
      }
      for (const i of issues) {
        if (i.severity === 'error') errorCount++;
        else warnCount++;
        process.stderr.write(`[${i.severity}] export/${dirName}: ${i.message}\n`);
      }
    }
  }

  process.stdout.write(
    `[validate] done errors=${errorCount} warnings=${warnCount}\n`,
  );
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
