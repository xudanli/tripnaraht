/**
 * F2：Executor 纯度启发式扫描 — 禁止 persistence / HTTP context 渗入 stage executor
 * 路径：src/agent/execution 下 *-executor.service.ts；若存在则包含 src/decision/stages 下 ts
 * 配置：.tripnara-guardrails/executor-purity.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONFIG = path.join(REPO_ROOT, '.tripnara-guardrails/executor-purity.json');
const STRICT = process.env.GUARDRAILS_STRICT === '1';

function rg(args: string[]): { out: string; ok: boolean } {
  const r = spawnSync('rg', args, { encoding: 'utf8' });
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { out: '', ok: false };
  }
  return { out: (r.stdout || '').trim(), ok: true };
}

function main(): void {
  const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) as {
    forbiddenImportPatterns?: string[];
  };
  const patterns = raw.forbiddenImportPatterns ?? [];
  if (patterns.length === 0) {
    console.log('[guardrails] No forbiddenImportPatterns in executor-purity.json');
    process.exit(0);
  }

  const argsBase = ['--glob', '*.ts', '--glob', '!*.spec.ts', '-n'];
  for (const p of patterns) {
    argsBase.push('-e', p);
  }

  const hits: string[] = [];

  const execDir = path.join(REPO_ROOT, 'src/agent/execution');
  if (fs.existsSync(execDir)) {
    const a = [...argsBase, '--glob', '*-executor.service.ts', execDir];
    const r1 = rg(a);
    if (!r1.ok) {
      console.warn('[guardrails] ripgrep (rg) not found; skip executor purity scan');
      process.exit(0);
    }
    if (r1.out) hits.push(`[src/agent/execution/*-executor.service.ts]\n${r1.out}`);
  }

  const stagesDir = path.join(REPO_ROOT, 'src/decision/stages');
  if (fs.existsSync(stagesDir)) {
    const a = [...argsBase, stagesDir];
    const r2 = rg(a);
    if (r2.out) hits.push(`[src/decision/stages]\n${r2.out}`);
  }

  if (hits.length) {
    console.error('[guardrails] Executor purity: possible forbidden imports/context:\n');
    console.error(hits.join('\n---\n'));
    console.error('\nSee docs/TRIPNARA_ENGINEERING_GUARDRAILS.md §6 / .tripnara-guardrails/executor-purity.json');
    if (STRICT) process.exit(1);
    console.warn('\n[guardrails] Non-strict mode: exit 0 (set GUARDRAILS_STRICT=1 to fail CI)');
  } else {
    console.log('[guardrails] Executor purity smoke: no heuristic hits');
  }
  process.exit(0);
}

main();
