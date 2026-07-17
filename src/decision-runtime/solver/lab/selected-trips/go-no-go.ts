/**
 * M4-RA-01 go / no-go board before opening selected_trips.
 *
 *   npm run lab:go-no-go
 *   npm run lab:go-no-go -- --strict
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { evaluateOrtToolsAuthorityCanaryGate } from '../ortools-authority-canary.gate';
import { PLANNING_SIGNOFF_ROOT } from '../planning-signoff/load-planning-signoff';
import {
  listPackTripIds,
  PACKS_ROOT,
  validateSelectedTripPack,
} from './validate-selected-trip';

interface CheckRow {
  id: string;
  label: string;
  status: 'GO' | 'NO_GO' | 'WAIT';
  detail: string;
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function main(): Promise<number> {
  const gate = evaluateOrtToolsAuthorityCanaryGate();
  const date = existsSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'))
    ? readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim()
    : '';
  const auth = date
    ? readJson<{
        status?: string;
        approved?: boolean;
        accountability?: Record<string, string>;
      }>(join(PLANNING_SIGNOFF_ROOT, date, 'authority.json'))
    : undefined;
  const drill = date
    ? readJson<{
        status?: string;
        approved?: boolean;
        liveDrill?: boolean;
        harnessPass?: boolean;
      }>(join(PLANNING_SIGNOFF_ROOT, date, 'rollback-drill.json'))
    : undefined;
  const labTokenFile = join(
    PLANNING_SIGNOFF_ROOT,
    '.lab-authority-token.env',
  );
  const stagingTokenFile = join(
    PLANNING_SIGNOFF_ROOT,
    '.staging-authority-token.env',
  );
  const labTokenPresent =
    existsSync(labTokenFile) &&
    readFileSync(labTokenFile, 'utf8').includes('OR_TOOLS_AUTHORITY_TOKEN=');
  const stagingTokenEnv = existsSync(stagingTokenFile)
    ? readFileSync(stagingTokenFile, 'utf8')
    : '';
  const stagingTokenPresent =
    stagingTokenEnv.includes('OR_TOOLS_AUTHORITY_TOKEN=') &&
    /OR_TOOLS_AUTHORITY_ENVIRONMENT=staging/.test(stagingTokenEnv);
  // Prefer explicit process env; fall back to sealed staging token file for board status
  if (
    !process.env.OR_TOOLS_AUTHORITY_TOKEN?.trim() &&
    stagingTokenPresent
  ) {
    for (const line of stagingTokenEnv.split('\n')) {
      const m = line.match(/^(OR_TOOLS_AUTHORITY_(?:TOKEN|TOKEN_SECRET|ENVIRONMENT))=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  }
  const wl = readJson<{ tripIds?: string[] }>(
    join(PLANNING_SIGNOFF_ROOT, 'selected-trips.whitelist.json'),
  );
  const realWhitelist = (wl?.tripIds ?? []).filter(
    (id) => !id.includes('PLACEHOLDER'),
  );

  const REAL_SOURCES = new Set(['staging_export', 'production_export']);
  const ids = listPackTripIds();
  let eligible = 0;
  let realEligible = 0;
  let syntheticEligible = 0;
  for (const id of ids) {
    const report = validateSelectedTripPack(join(PACKS_ROOT, id));
    if (!report.eligible) continue;
    eligible += 1;
    if (report.source && REAL_SOURCES.has(report.source)) {
      realEligible += 1;
    } else {
      syntheticEligible += 1;
    }
  }

  const accountabilityFilled = Boolean(
    auth?.accountability &&
      Object.values(auth.accountability).every(
        (v) => v && !String(v).startsWith('TBD'),
      ),
  );

  const rows: CheckRow[] = [
    {
      id: 'engineering',
      label: 'Engineering gate',
      status: gate.engineeringReady ? 'GO' : 'NO_GO',
      detail: gate.engineeringReady ? 'READY' : 'not ready',
    },
    {
      id: 'product_policy',
      label: 'Product policy document',
      status:
        auth?.status === 'APPROVED' && auth.approved
          ? 'GO'
          : auth?.status === 'READY_FOR_APPROVAL'
            ? 'WAIT'
            : 'NO_GO',
      detail: `authority.json status=${auth?.status ?? 'missing'}`,
    },
    {
      id: 'accountability',
      label: 'Named accountability',
      status: accountabilityFilled ? 'GO' : 'WAIT',
      detail: accountabilityFilled
        ? 'failureOwner/escalation/rollbackOwner set'
        : 'fill accountability.* (no TBD)',
    },
    {
      id: 'rollback_drill_harness',
      label: 'Rollback drill harness (lab)',
      status:
        drill?.harnessPass === true ||
        drill?.status === 'HARNESS_PASS' ||
        (drill?.status === 'PASS' && drill.liveDrill === true)
          ? 'GO'
          : drill?.status === 'FAIL'
            ? 'NO_GO'
            : 'WAIT',
      detail: drill
        ? `rollback-drill.json=${drill.status}`
        : 'npm run lab:run-rollback-drill-harness',
    },
    {
      id: 'rollback_drill_live',
      label: 'Remote staging live drill',
      status:
        drill?.status === 'PASS' && drill.liveDrill === true
          ? 'GO'
          : 'WAIT',
      detail:
        drill?.liveDrill === true
          ? 'live PASS sealed'
          : 'optional for eng preflight; required before public selected_trips traffic',
    },
    {
      id: 'dataset',
      label: 'Real eligible trip packs (≥10)',
      status: realEligible >= 10 ? 'GO' : 'WAIT',
      detail: `${realEligible} real / ${syntheticEligible} synthetic / ${eligible} eligible`,
    },
    {
      id: 'whitelist',
      label: 'Real whitelist tripIds',
      status: realWhitelist.length >= 10 ? 'GO' : 'WAIT',
      detail: `${realWhitelist.length} non-placeholder ids`,
    },
    {
      id: 'token_lab',
      label: 'Lab Authority Token',
      status:
        labTokenPresent || Boolean(process.env.OR_TOOLS_AUTHORITY_TOKEN?.trim())
          ? 'GO'
          : 'WAIT',
      detail: labTokenPresent
        ? '.lab-authority-token.env present (authority.test.json)'
        : process.env.OR_TOOLS_AUTHORITY_TOKEN
          ? 'OR_TOOLS_AUTHORITY_TOKEN set'
          : 'npm run lab:mint-authority-token -- --test-pkg',
    },
    {
      id: 'token_product',
      label: 'Product Authority Token',
      status:
        auth?.status === 'APPROVED' &&
        auth.approved &&
        Boolean(process.env.OR_TOOLS_AUTHORITY_TOKEN?.trim()) &&
        process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT === 'staging'
          ? 'GO'
          : 'WAIT',
      detail: 'Needs product APPROVED authority.json + staging mint',
    },
    {
      id: 'canary_stage',
      label: 'Canary not prematurely open',
      status:
        process.env.OR_TOOLS_AUTHORITATIVE_CANARY === '1'
          ? 'WAIT'
          : 'GO',
      detail:
        process.env.OR_TOOLS_AUTHORITATIVE_CANARY === '1'
          ? 'flag already ON — confirm intentional'
          : 'flag off (expected until go)',
    },
  ];

  const noGo = rows.filter((r) => r.status === 'NO_GO');
  const wait = rows.filter((r) => r.status === 'WAIT');
  const verdict =
    noGo.length > 0 ? 'NO_GO' : wait.length > 0 ? 'HOLD' : 'GO';

  console.log('M4-RA-01 Go / No-Go');
  console.log('==================');
  console.log(`Verdict: ${verdict}`);
  console.log('');
  for (const r of rows) {
    console.log(`[${r.status.padEnd(5)}] ${r.label} — ${r.detail}`);
  }
  console.log('');
  console.log(
    JSON.stringify(
      {
        schemaId: 'tripnara.m4_ra01_go_no_go@v1',
        verdict,
        rows,
        releaseAuthorized: gate.releaseAuthorized,
        next:
          verdict === 'GO'
            ? [
                'OR_TOOLS_CANARY_STAGE=selected_trips',
                'OR_TOOLS_AUTHORITATIVE_CANARY=1',
                'Watch GET .../canary/dashboard hard zeros',
              ]
            : [
                ...noGo.map((r) => `Fix NO_GO: ${r.id}`),
                ...wait.map((r) => `Clear WAIT: ${r.id}`),
              ],
      },
      null,
      2,
    ),
  );

  if (process.argv.includes('--strict') && verdict !== 'GO') return 1;
  return noGo.length > 0 ? 1 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
