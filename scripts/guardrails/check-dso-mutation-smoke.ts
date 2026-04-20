/**
 * Phase A：DSO 直写启发式扫描（非 AST）
 * 读取 .tripnara-guardrails/dso-governance.json 中的 heuristicBannedPatterns
 * 在 src/ 下 grep，排除 state-manager 与测试文件路径。
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONFIG = path.join(REPO_ROOT, '.tripnara-guardrails/dso-governance.json');
const STRICT = process.env.GUARDRAILS_STRICT === '1';

function main(): void {
  const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) as {
    heuristicBannedPatterns?: string[];
  };
  const patterns = raw.heuristicBannedPatterns ?? [];
  if (patterns.length === 0) {
    console.log('[guardrails] No heuristicBannedPatterns in dso-governance.json');
    process.exit(0);
  }

  const rg = spawnSync(
    'rg',
    [
      '--glob',
      '*.ts',
      '--glob',
      '!*.spec.ts',
      '--glob',
      '!**/state-manager.service.ts',
      '-n',
      ...patterns.flatMap((p) => ['-e', p]),
      path.join(REPO_ROOT, 'src'),
    ],
    { encoding: 'utf8' },
  );

  if (rg.error && (rg.error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.warn('[guardrails] ripgrep (rg) not found; skip DSO smoke scan');
    process.exit(0);
  }

  const out = (rg.stdout || '').trim();
  const errOut = (rg.stderr || '').trim();
  if (rg.status !== 0 && !out) {
    if (errOut) console.warn(errOut);
    process.exit(0);
  }

  if (out) {
    console.error('[guardrails] Possible DSO direct mutation patterns detected:\n');
    console.error(out);
    console.error(
      '\nSee docs/TRIPNARA_ENGINEERING_GUARDRAILS.md and .tripnara-guardrails/dso-governance.json',
    );
    if (STRICT) process.exit(1);
    console.warn('\n[guardrails] Non-strict mode: exit 0 (set GUARDRAILS_STRICT=1 to fail CI)');
  } else {
    console.log('[guardrails] DSO mutation smoke: no heuristic hits in src/**/*.ts');
  }
  process.exit(0);
}

main();
