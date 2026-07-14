/**
 * M4-RA-01A Pilot Preflight status board.
 *
 *   npm run lab:pilot-preflight-status
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { listPackTripIds, PACKS_ROOT, validateSelectedTripPack } from './validate-selected-trip';
import { evaluateOrtToolsAuthorityCanaryGate } from '../ortools-authority-canary.gate';

function readAuthorityStatus(): string {
  const p = join(
    process.cwd(),
    'src/decision-runtime/solver/lab/planning-signoff/2026-07-15/authority.json',
  );
  if (!existsSync(p)) return 'MISSING';
  const a = JSON.parse(readFileSync(p, 'utf8')) as {
    status?: string;
    approved?: boolean;
  };
  if (a.approved && (a.status === 'APPROVED' || a.status === 'PASS')) {
    return 'APPROVED';
  }
  return a.status ?? 'UNKNOWN';
}

async function main(): Promise<number> {
  const gate = evaluateOrtToolsAuthorityCanaryGate();
  const ids = listPackTripIds();
  let eligible = 0;
  for (const id of ids) {
    if (validateSelectedTripPack(join(PACKS_ROOT, id)).eligible) eligible += 1;
  }

  const authStatus = readAuthorityStatus();
  const productPolicy =
    authStatus === 'APPROVED'
      ? 'APPROVED'
      : authStatus === 'READY_FOR_APPROVAL' || authStatus === 'DRAFT'
        ? 'READY_FOR_APPROVAL'
        : 'WAIT';

  const dataset =
    eligible >= 10
      ? 'READY'
      : ids.length > 0
        ? `WAIT (${eligible} eligible / ${ids.length} packs — need 10 real)`
        : 'WAIT (no packs)';

  const preflightReady =
    gate.engineeringReady &&
    existsSync(
      join(
        process.cwd(),
        'src/decision-runtime/solver/lab/selected-trips/DATASET_SCHEMA.md',
      ),
    ) &&
    existsSync(
      join(
        process.cwd(),
        'src/decision-runtime/solver/lab/planning-signoff/authority.test.json',
      ),
    );

  const board = {
    schemaId: 'tripnara.m4_ra01a_preflight_status@v1',
    Engineering: gate.engineeringReady ? 'READY' : 'NOT_READY',
    PilotPreflight: preflightReady ? 'READY' : 'NOT_READY',
    ProductPolicy: productPolicy,
    Dataset: dataset,
    Release: gate.releaseAuthorized ? 'AUTHORIZED' : 'BLOCKED',
    notes: [
      'Preflight READY means mechanisms + schema + fault tests exist',
      'Dataset WAIT is expected until 10 real deidentified trips land',
      'Do not APPROVE production authority.json until RA-01B',
    ],
  };

  console.log('M4-RA-01A Pilot Preflight');
  console.log('=========================');
  for (const [k, v] of Object.entries(board)) {
    if (k === 'schemaId' || k === 'notes') continue;
    console.log(`${k}: ${v}`);
  }
  console.log('');
  console.log(JSON.stringify(board, null, 2));
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
