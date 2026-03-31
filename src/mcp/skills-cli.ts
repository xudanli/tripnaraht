#!/usr/bin/env npx tsx
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

type RuntimeMode = 'standalone' | 'nest' | 'nest-fallback';

interface ManifestSkill {
  name: string;
  category: string;
  level?: string;
  description?: string;
  version?: string;
  className?: string;
  sourceFile?: string;
}

interface ManifestPayload {
  total?: number;
  skills: ManifestSkill[];
}

function loadSkillsManifest(): ManifestPayload {
  const candidates = [
    path.join(__dirname, '../skills/generated/skills-manifest.json'),
    path.join(process.cwd(), 'src/skills/generated/skills-manifest.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as ManifestPayload;
    }
  }
  throw new Error(
    '未找到 skills-manifest.json。请先执行: npx tsx scripts/generate-skills-manifest.ts',
  );
}

async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function withRuntimeTag(out: unknown, runtime: RuntimeMode) {
  if (out && typeof out === 'object' && !Array.isArray(out)) {
    return { ...(out as Record<string, unknown>), _runtime: runtime };
  }
  return { result: out, _runtime: runtime };
}

async function tryRunStandaloneSkill(skill: ManifestSkill, input: Record<string, unknown>) {
  if (!skill.sourceFile || !skill.className) {
    throw new Error(`技能 ${skill.name} 缺少 sourceFile/className，无法轻量运行`);
  }
  const absFile = path.join(process.cwd(), skill.sourceFile);
  const mod = await import(pathToFileURL(absFile).href);
  const SkillClass = mod[skill.className];
  if (!SkillClass) {
    throw new Error(`未在 ${skill.sourceFile} 导出 ${skill.className}`);
  }
  const instance = new SkillClass();
  if (typeof instance.execute !== 'function') {
    throw new Error(`类 ${skill.className} 缺少 execute 方法`);
  }
  return instance.execute(input as any);
}

function printUsage() {
  console.log(`Usage:
  npx tsx src/mcp/skills-cli.ts list
  npx tsx src/mcp/skills-cli.ts describe <skillName>
  npx tsx src/mcp/skills-cli.ts run <skillName> < input.json

Notes:
  - 当前仓库使用 manifest 路径（轻量）；_runtime=standalone
  - SKILLS_CLI_VERBOSE_LOG=true 可打印 run path
  - SKILL_RUN_PREFER_NEST=true 在当前仓库会报错（无 Nest fallback 入口）`);
}

async function main() {
  const rest = process.argv.slice(2);
  const cmd = rest[0];
  const name = rest[1];

  if (!cmd || cmd === '-h' || cmd === '--help') {
    printUsage();
    process.exit(0);
  }

  const manifest = loadSkillsManifest();
  const rows = manifest.skills ?? [];

  if (cmd === 'list') {
    const mcpL1 = rows.filter((r) => (r.level ?? 'L1') === 'L1').length;
    console.log(
      JSON.stringify(
        {
          total: rows.length,
          mcpL1,
          source: 'manifest',
          skills: rows.map((r) => ({
            name: r.name,
            level: r.level ?? 'L1',
            category: r.category,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'describe') {
    if (!name) {
      console.error('Missing skill name');
      process.exit(1);
    }
    const row = rows.find((s) => s.name === name);
    if (!row) {
      console.error(`Unknown skill: ${name}`);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          name: row.name,
          description: row.description,
          version: row.version ?? '1.0.0',
          category: row.category,
          level: row.level ?? 'L1',
          sourceFile: row.sourceFile,
          className: row.className,
          source: 'manifest',
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'run') {
    if (!name) {
      console.error('Missing skill name');
      process.exit(1);
    }
    const row = rows.find((s) => s.name === name);
    if (!row) {
      console.error(`Unknown skill: ${name}`);
      process.exit(1);
    }
    if (process.env.SKILL_RUN_PREFER_NEST === 'true') {
      console.error(
        'SKILL_RUN_PREFER_NEST=true 但当前仓库无 Nest fallback 入口（mcp-app.module/skills.module 不存在）。',
      );
      process.exit(1);
    }
    const input = await readStdinJson();
    const out = await tryRunStandaloneSkill(row, input);
    if (process.env.SKILLS_CLI_VERBOSE_LOG === 'true') {
      console.warn(`run path = standalone (${name})`);
    }
    console.log(JSON.stringify(withRuntimeTag(out, 'standalone'), null, 2));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

