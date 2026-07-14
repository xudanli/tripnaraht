/**
 * Seal a rollback-drill evidence artifact after a live (or simulated) drill.
 *
 *   npm run lab:seal-rollback-drill -- --result PASS --operator alice
 *   npm run lab:seal-rollback-drill -- --result FAIL --note "duplicate card seen"
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main(): Promise<number> {
  const result = (argValue('--result') ?? '').toUpperCase();
  if (result !== 'PASS' && result !== 'FAIL' && result !== 'SIMULATED') {
    console.error(
      'Usage: --result PASS|FAIL|SIMULATED [--operator name] [--note text] [--date YYYY-MM-DD]',
    );
    return 1;
  }
  const simulated =
    process.argv.includes('--simulated') || result === 'SIMULATED';
  let date = argValue('--date');
  if (!date) {
    try {
      date = readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim();
    } catch {
      date = new Date().toISOString().slice(0, 10);
    }
  }
  const dir = join(PLANNING_SIGNOFF_ROOT, date);
  mkdirSync(dir, { recursive: true });

  const checklist = [
    'RD-01 selected trip used ortools-repair',
    'RD-02 fault injected',
    'RD-03 canary flag cleared / stage→shadow',
    'RD-04 provider = neptune-repair',
    'RD-05 pending ortools candidates discarded',
    'RD-06 stale evidence candidates void',
    'RD-07 Neptune regenerated (no reuse of old ortools candidate)',
    'RD-08 no duplicate Plan Version',
    'RD-09 no duplicate decision cards',
    'RD-10 this artifact sealed',
  ];

  const status = simulated
    ? 'SIMULATED'
    : result === 'PASS'
      ? 'PASS'
      : 'FAIL';
  const body = {
    schemaId: 'tripnara.planning_signoff.rollback_drill@v1',
    kind: 'rollback_drill',
    status,
    /** Only live PASS counts for go-no-go */
    approved: status === 'PASS',
    liveDrill: !simulated && status === 'PASS',
    approvedAt: new Date().toISOString(),
    approvedBy: argValue('--operator') ?? 'operator-unspecified',
    checklist,
    environment: process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT ?? 'staging',
    note: argValue('--note') ?? '',
    unitTestsHint:
      'npx jest src/decision-runtime/solver/lab/planning-signoff/rollback-fault-injection.spec.ts',
    detail:
      status === 'PASS'
        ? 'Live/staging rollback drill passed — safe to proceed to selected_trips canary'
        : status === 'SIMULATED'
          ? 'Unit/harness simulation only — does NOT satisfy go-no-go'
          : 'Drill failed — do not open OR_TOOLS_AUTHORITATIVE_CANARY',
  };

  const path = join(dir, 'rollback-drill.json');
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  // Keep engineering rollback.json READY; drill is separate evidence
  if (!existsSync(join(dir, 'rollback.json'))) {
    console.warn('warn: engineering rollback.json missing — run lab:seal-planning-signoff');
  }

  console.log(
    JSON.stringify(
      {
        sealed: path.replace(`${process.cwd()}/`, ''),
        status: body.status,
        next:
          status === 'PASS'
            ? [
                'Fill whitelist + product APPROVE authority.json',
                'mint token + OR_TOOLS_CANARY_STAGE=selected_trips',
              ]
            : status === 'SIMULATED'
              ? [
                  'Run live staging drill',
                  'Re-seal with --result PASS --operator <you>',
                ]
              : ['Fix failing RD item', 'Re-run live drill'],
      },
      null,
      2,
    ),
  );
  return status === 'FAIL' ? 1 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
