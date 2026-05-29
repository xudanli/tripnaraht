#!/usr/bin/env npx tsx
/**
 * 导出 SkillEvolver 技能为 agentskills.io 目录结构
 *
 *   npm run skill-evolver:export-agent-skills
 *   npm run skill-evolver:export-agent-skills -- --out .cursor/skills-export
 *   npm run skill-evolver:export-agent-skills -- --ids api_calling,country_pack.IS
 */
import * as path from 'path';
import { exportSkillsToAgentSkillsFormat } from '../src/agent/training/skill-evolver/utils/agent-skills-export.util';

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
  const exportRoot =
    typeof args.out === 'string' ? path.resolve(args.out) : path.join(basePath, 'agent-skills-export');
  const skillIds =
    typeof args.ids === 'string' ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const result = exportSkillsToAgentSkillsFormat({ basePath, exportRoot, skillIds });

  for (const r of result.records) {
    process.stdout.write(`[export] ${r.tripnaraSkillId} -> ${r.exportDir}/SKILL.md\n`);
  }

  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  for (const w of warnings) {
    process.stderr.write(`[warn] ${w.rule}: ${w.message}\n`);
  }
  process.stdout.write(
    `[export] ${result.records.length} skills -> ${result.exportRoot} (manifest.json)\n`,
  );
  process.stdout.write(
    `[export] Cursor/Claude: add folder to skills path or symlink ${result.exportRoot}/*\n`,
  );

  if (errors.length) {
    for (const e of errors) process.stderr.write(`[error] ${e.rule}: ${e.message}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
