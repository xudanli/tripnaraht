import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  SIGNOFF_CHECKLIST_PATH,
  SIGNOFF_EVIDENCE_DIR,
  SIGNOFF_SECTION0_CHECKS,
  type SignoffCheckId,
} from './tep-signoff-autocheck.constants';

export interface SignoffCheckResult {
  id: SignoffCheckId;
  passed: boolean;
  detail: string;
  skipped?: boolean;
}

export function assertSafeSignoffDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing sign-off autocheck on production DATABASE_URL');
  }
}

export function gitCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runCommand(label: string, command: string): void {
  execSync(command, { stdio: 'inherit', cwd: process.cwd(), env: process.env });
}

export async function runSignoffCheck(
  id: SignoffCheckId,
  opts: { fromCi?: boolean },
): Promise<SignoffCheckResult> {
  switch (id) {
    case 'tep-full':
      if (opts.fromCi) {
        return {
          id,
          passed: false,
          skipped: true,
          detail: 'skipped in --from-ci (run npm run tep:signoff-autocheck without --from-ci)',
        };
      }
      try {
        runCommand('tep-full', 'npm test -- src/trips/tep --no-cache');
        return { id, passed: true, detail: 'npm test -- src/trips/tep PASS' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, passed: false, detail: message };
      }

    case 'pilot-ci':
      if (opts.fromCi) {
        return { id, passed: true, detail: 'tep:pilot-ci completed in this session' };
      }
      try {
        runCommand('pilot-ci', 'npm run tep:pilot-ci');
        return { id, passed: true, detail: 'npm run tep:pilot-ci PASS' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, passed: false, detail: message };
      }

    case 'cert-401-concurrent-mock':
      if (opts.fromCi) {
        return {
          id,
          passed: true,
          detail: 'covered by tep:pilot-ci unit slice (is-cert-writeback.integration.spec.ts)',
        };
      }
      try {
        runCommand(
          '401-concurrent-mock',
          'npm test -- src/trips/tep/certification/is-cert-writeback.integration.spec.ts --no-cache',
        );
        return { id, passed: true, detail: 'is-cert-writeback.integration.spec.ts PASS' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, passed: false, detail: message };
      }

    case 'cert-404-mock':
      if (opts.fromCi) {
        return {
          id,
          passed: true,
          detail: 'covered by tep:pilot-ci unit slice (is-cert-404.integration.spec.ts)',
        };
      }
      try {
        runCommand(
          '404-mock',
          'npm test -- src/trips/tep/certification/is-cert-404.integration.spec.ts --no-cache',
        );
        return { id, passed: true, detail: 'is-cert-404.integration.spec.ts PASS' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, passed: false, detail: message };
      }

    case 'pg-writeback':
      if (opts.fromCi) {
        return {
          id,
          passed: true,
          detail: 'covered by tep:pilot-ci PG slice (test:tep-writeback-pg)',
        };
      }
      if (process.env.TEP_WRITEBACK_PG_E2E !== '1') {
        process.env.TEP_WRITEBACK_PG_E2E = '1';
      }
      try {
        runCommand('pg-writeback', 'npm run test:tep-writeback-pg');
        return { id, passed: true, detail: 'test:tep-writeback-pg PASS' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, passed: false, detail: message };
      }

    case 'tep-repair-executions-table': {
      const prisma = new PrismaClient();
      try {
        await prisma.$connect();
        const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'tep_repair_executions'
        `;
        const exists = rows.length > 0;
        return {
          id,
          passed: exists,
          detail: exists
            ? 'public.tep_repair_executions present'
            : 'table tep_repair_executions not found',
        };
      } finally {
        await prisma.$disconnect();
      }
    }

    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown signoff check ${String(_exhaustive)}`);
    }
  }
}

export function formatSignoffStatus(passed: boolean, dateIso: string, detail: string): string {
  if (passed) {
    return `✅ ${dateIso} · ${detail}`;
  }
  return `⬜ failed ${dateIso} · ${detail.slice(0, 80)}`;
}

/** Replace §0 status cell for rows whose 检查项 column contains rowMatch */
export function patchSignoffChecklistSection0(
  markdown: string,
  updates: Array<{ rowMatch: string; status: string }>,
): string {
  const lines = markdown.split('\n');
  const sectionStart = lines.findIndex((l) => l.startsWith('## 0. 签字前自动化回归'));
  if (sectionStart < 0) {
    throw new Error('SIGNOFF checklist missing §0 header');
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i]?.startsWith('## ')) {
      sectionEnd = i;
      break;
    }
  }

  for (let i = sectionStart; i < sectionEnd; i++) {
    const line = lines[i]!;
    if (!line.startsWith('|') || line.includes('检查项') || line.includes('---')) continue;

    for (const update of updates) {
      if (!line.includes(update.rowMatch)) continue;
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 4) continue;
      // | 检查项 | 期望 | 状态 |  → trailing pipe yields empty last cell
      const statusIndex = cells.at(-1) === '' ? cells.length - 2 : cells.length - 1;
      if (statusIndex < 1) continue;
      cells[statusIndex] = update.status;
      lines[i] = `| ${cells.slice(1, statusIndex + 1).join(' | ')} |`;
      break;
    }
  }

  return lines.join('\n');
}

export function writeSignoffEvidence(input: {
  date: string;
  commit: string;
  fromCi: boolean;
  results: SignoffCheckResult[];
}): string {
  const dir = join(process.cwd(), SIGNOFF_EVIDENCE_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `autocheck-${input.date}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        schemaId: 'tripnara.tep.signoff_autocheck@v1',
        date: input.date,
        commit: input.commit,
        fromCi: input.fromCi,
        results: input.results,
      },
      null,
      2,
    ),
  );
  return path;
}

export async function runAllSignoffChecks(opts: {
  fromCi?: boolean;
  ids?: SignoffCheckId[];
}): Promise<SignoffCheckResult[]> {
  const ids = opts.ids ?? SIGNOFF_SECTION0_CHECKS.map((c) => c.id);
  const results: SignoffCheckResult[] = [];
  for (const id of ids) {
    results.push(await runSignoffCheck(id, { fromCi: opts.fromCi }));
  }
  return results;
}

export function applySignoffResultsToChecklist(results: SignoffCheckResult[]): {
  markdown: string;
  evidencePath: string;
} {
  const date = new Date().toISOString().slice(0, 10);
  const commit = gitCommitSha();
  const checklistPath = join(process.cwd(), SIGNOFF_CHECKLIST_PATH);
  const original = readFileSync(checklistPath, 'utf8');

  const updates = SIGNOFF_SECTION0_CHECKS.map((def) => {
    const result = results.find((r) => r.id === def.id);
    const passed = result?.passed === true;
    const detail =
      result?.detail ??
      (result?.skipped ? 'skipped' : def.description);
    return {
      rowMatch: def.rowMatch,
      status: passed
        ? formatSignoffStatus(true, date, detail)
        : result?.skipped
          ? `⬜ skipped · ${detail}`
          : formatSignoffStatus(false, date, detail),
    };
  });

  const patched = patchSignoffChecklistSection0(original, updates);
  writeFileSync(checklistPath, patched);

  const evidencePath = writeSignoffEvidence({
    date,
    commit,
    fromCi: Boolean(results.some((r) => r.detail.includes('tep:pilot-ci'))),
    results,
  });

  return { markdown: patched, evidencePath };
}
