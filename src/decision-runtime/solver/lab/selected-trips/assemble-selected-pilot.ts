/**
 * Assemble pilot readiness across all selected-trip packs.
 *
 *   npm run lab:assemble-selected-pilot
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  listPackTripIds,
  PACKS_ROOT,
  validateSelectedTripPack,
} from './validate-selected-trip';
import { APPROVED_PILOT_OPERATIONS } from './schema/types';

async function main(): Promise<number> {
  const ids = listPackTripIds();
  const eligible: string[] = [];
  const blocked: Array<{ tripId: string; reasons: string[] }> = [];
  const byOp: Record<string, string[]> = {
    SHIFT: [],
    SWAP: [],
    SHORTEN: [],
    REROUTE: [],
    OTHER: [],
  };

  for (const tripId of ids) {
    const report = validateSelectedTripPack(join(PACKS_ROOT, tripId));
    const op = (report.intendedOperation ?? 'OTHER').toUpperCase();
    const bucket = (
      APPROVED_PILOT_OPERATIONS as readonly string[]
    ).includes(op)
      ? op
      : 'OTHER';
    if (report.eligible) {
      eligible.push(tripId);
      byOp[bucket].push(tripId);
    } else {
      blocked.push({
        tripId,
        reasons: report.issues
          .filter((i) => i.severity === 'error')
          .map((i) => `${i.code}: ${i.message}`),
      });
    }
  }

  const target = {
    SHIFT: 2,
    SWAP: 2,
    SHORTEN: 2,
    REROUTE: 2,
    reject_or_fallback: 2,
  };

  const summary = {
    schemaId: 'tripnara.selected_pilot_assemble@v1',
    eligible: eligible.length,
    blocked: blocked.length,
    eligibleTripIds: eligible,
    blockedReasons: blocked,
    distribution: {
      SHIFT: byOp.SHIFT.length,
      SWAP: byOp.SWAP.length,
      SHORTEN: byOp.SHORTEN.length,
      REROUTE: byOp.REROUTE.length,
    },
    samplingTarget: target,
    samplingGaps: {
      SHIFT: Math.max(0, target.SHIFT - byOp.SHIFT.length),
      SWAP: Math.max(0, target.SWAP - byOp.SWAP.length),
      SHORTEN: Math.max(0, target.SHORTEN - byOp.SHORTEN.length),
      REROUTE: Math.max(0, target.REROUTE - byOp.REROUTE.length),
    },
    next:
      blocked.length === 0 && eligible.length >= 10
        ? ['Update selected-trips.whitelist.json', 'Product APPROVE authority.json']
        : [
            'npm run lab:export-selected-trip -- --from-gold <scenario>',
            'Fix blocked packs / fill expected-outcome reviews',
          ],
  };

  const outDir = join(
    process.cwd(),
    'artifacts/selected-pilot-assemble',
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'latest.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  console.log(`eligible: ${summary.eligible}`);
  console.log(`blocked: ${summary.blocked}`);
  if (blocked.length) {
    console.log('blocked reasons:');
    for (const b of blocked) {
      console.log(`- ${b.tripId}: ${b.reasons[0] ?? 'unknown'}`);
      for (const r of b.reasons.slice(1)) console.log(`    ${r}`);
    }
  }
  console.log('');
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
