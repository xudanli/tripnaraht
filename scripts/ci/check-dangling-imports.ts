#!/usr/bin/env npx tsx
/**
 * Static check: dangling relative imports (default: src/agent loadability scope).
 * Catches C018-class failures before freeze / CI merge.
 *
 * Usage:
 *   npx tsx scripts/ci/check-dangling-imports.ts
 *   npx tsx scripts/ci/check-dangling-imports.ts --scope=agent
 *   npx tsx scripts/ci/check-dangling-imports.ts --scope=all   # noisy; advisory
 *
 * Exit 1 on dangling imports in scoped trees.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const scopeArg = process.argv.find((a) => a.startsWith('--scope='))?.split('=')[1] ?? 'agent';

const SCOPES: Record<string, string[]> = {
  agent: ['src/agent'],
  freeze: [
    'src/agent',
    'src/decision/kernel',
    'src/decision-runtime/gateway',
    'src/decision-runtime/solver/lab',
  ],
  all: ['src'],
};

const roots = (SCOPES[scopeArg] ?? SCOPES.agent).map((r) => path.join(ROOT, r));
const IMPORT_RE = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;

/** Skip known non-TS / template / generated stubs */
function skipImportSpec(spec: string): boolean {
  if (spec.endsWith('.js')) return true;
  if (spec.includes('template.fixture')) return true;
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (
      /\.(ts|tsx)$/.test(ent.name) &&
      !ent.name.endsWith('.d.ts') &&
      !ent.name.endsWith('.spec.ts') &&
      !ent.name.endsWith('.spec.tsx')
    )
      out.push(p);
  }
  return out;
}

function resolveImport(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const files = roots.flatMap((r) => walk(r));
const dangling: Array<{ file: string; spec: string }> = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    if (skipImportSpec(spec)) continue;
    if (resolveImport(file, spec) == null) {
      dangling.push({ file: path.relative(ROOT, file), spec });
    }
  }
}

// Hard assert: trip-id merge must not dangle on iceland-self-drive
const mergePath = path.join(ROOT, 'src/agent/utils/route-and-run-trip-id-merge.util.ts');
const mergeSrc = fs.readFileSync(mergePath, 'utf8');
if (mergeSrc.includes('iceland-self-drive/utils/iceland-memory-shell-trip-id')) {
  console.error(
    '[check-dangling-imports] FAIL — route-and-run-trip-id-merge still imports iceland-self-drive util (C018)',
  );
  process.exit(1);
}

if (dangling.length) {
  console.error(
    `[check-dangling-imports] FAIL — scope=${scopeArg} — ${dangling.length} dangling relative import(s):`,
  );
  for (const d of dangling.slice(0, 40)) {
    console.error(`  ${d.file} → ${d.spec}`);
  }
  if (dangling.length > 40) console.error(`  … +${dangling.length - 40} more`);
  process.exit(1);
}

console.log(
  `[check-dangling-imports] OK — scope=${scopeArg} scanned ${files.length} files, 0 dangling; C018 import path clear`,
);
