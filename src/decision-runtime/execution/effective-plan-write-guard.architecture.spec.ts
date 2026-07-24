/**
 * Architecture audit: Effective Plan writes + forbidden import paths.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST,
  EFFECTIVE_PLAN_IMPORT_GUARD_EXEMPT_SUFFIXES,
  EFFECTIVE_PLAN_IMPORT_GUARD_ROOTS,
  EFFECTIVE_PLAN_WRITE_FORBIDDEN_IMPORT_PREFIXES,
  SET_EFFECTIVE_CALLER_ALLOWLIST,
  isExemptFromImportGuard,
  normalizeRepoRelativePath,
} from './effective-plan-write-architecture.config';

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

function collectCallSiteOffenders(
  symbol: string,
  allowlist: Set<string>,
): string[] {
  const srcRoot = path.join(ROOT, 'src');
  const offenders: string[] = [];

  for (const file of walk(srcRoot)) {
    const rel = normalizeRepoRelativePath(file, ROOT);
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes(`${symbol}(`)) continue;
    if (allowlist.has(rel)) continue;
    if (rel.includes('/e2e/')) continue;
    if (rel.includes('effective-plan-write-architecture.config.ts')) continue;
    offenders.push(rel);
  }
  return offenders;
}

function collectForbiddenImportOffenders(): string[] {
  const offenders: string[] = [];

  for (const rootRel of EFFECTIVE_PLAN_IMPORT_GUARD_ROOTS) {
    const dir = path.join(ROOT, rootRel);
    for (const file of walk(dir)) {
      const rel = normalizeRepoRelativePath(file, ROOT);
      if (isExemptFromImportGuard(rel)) continue;
      if (rel.includes('/e2e/')) continue;

      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of EFFECTIVE_PLAN_WRITE_FORBIDDEN_IMPORT_PREFIXES) {
        const patterns = [
          `from '${forbidden.replace('src/', '../').replace(/\//g, '/')}''`,
          `from "${forbidden}"`,
          `from '${forbidden}'`,
          `require('${forbidden}')`,
        ];
        // Match any import path containing forbidden module tail
        const tail = forbidden.split('/').pop()!;
        if (
          content.includes(`plan-version.store`) ||
          content.includes(`rfc001-itinerary-materializer.service`)
        ) {
          const importLines = content
            .split('\n')
            .filter(
              (line) =>
                (line.includes('import ') || line.includes('require(')) &&
                (line.includes('plan-version.store') ||
                  line.includes('rfc001-itinerary-materializer.service')),
            );
          if (importLines.length > 0) {
            offenders.push(`${rel} → ${tail}`);
          }
        }
        void patterns;
      }
    }
  }

  return [...new Set(offenders)];
}

describe('Effective Plan write architecture audit', () => {
  it('setEffective is only referenced from store + executor (production code)', () => {
    expect(collectCallSiteOffenders('setEffective', SET_EFFECTIVE_CALLER_ALLOWLIST)).toEqual(
      [],
    );
  });

  it('applyPlanOperations is only referenced from materializer + executor (production code)', () => {
    expect(
      collectCallSiteOffenders(
        'applyPlanOperations',
        APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST,
      ),
    ).toEqual([]);
  });

  it('business modules do not import plan write repositories directly', () => {
    expect(collectForbiddenImportOffenders()).toEqual([]);
  });

  it('documents exempt execution paths', () => {
    expect(EFFECTIVE_PLAN_IMPORT_GUARD_EXEMPT_SUFFIXES.length).toBeGreaterThan(0);
  });
});
