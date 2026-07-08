/**
 * Architecture audit: formal paths should not call ConstraintChecker.checkPlan directly.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CONSTRAINT_CHECK_PLAN_CALLER_ALLOWLIST,
  CONSTRAINT_FORMAL_PATH_GUARD_ROOTS,
  normalizeRepoRelativePath,
} from './constraint-formal-path.architecture.config';

const ROOT = path.join(__dirname, '../../..');

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Constraint formal path architecture audit', () => {
  it('ConstraintChecker.checkPlan only called from allowlisted modules', () => {
    const offenders: string[] = [];

    for (const rootRel of CONSTRAINT_FORMAL_PATH_GUARD_ROOTS) {
      for (const file of walk(path.join(ROOT, rootRel))) {
        const rel = normalizeRepoRelativePath(file, ROOT);
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes('checkPlan(')) continue;
        if (CONSTRAINT_CHECK_PLAN_CALLER_ALLOWLIST.has(rel)) continue;
        if (rel.includes('/e2e/')) continue;
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
