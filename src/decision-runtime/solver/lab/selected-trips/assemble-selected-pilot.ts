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

const REAL_SOURCES = new Set(['staging_export', 'production_export']);

async function main(): Promise<number> {
  const ids = listPackTripIds();
  const eligible: string[] = [];
  const realEligible: string[] = [];
  const syntheticEligible: string[] = [];
  const blocked: Array<{ tripId: string; reasons: string[] }> = [];
  const byOp: Record<string, string[]> = {
    SHIFT: [],
    SWAP: [],
    SHORTEN: [],
    REROUTE: [],
    OTHER: [],
  };
  const rejectOrFallback: string[] = [];

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
      if (report.source && REAL_SOURCES.has(report.source)) {
        realEligible.push(tripId);
      } else {
        syntheticEligible.push(tripId);
      }
      if (
        report.expectation === 'reject' ||
        report.expectation === 'fallback'
      ) {
        rejectOrFallback.push(tripId);
      }
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
    realEligible: realEligible.length,
    syntheticEligible: syntheticEligible.length,
    blocked: blocked.length,
    eligibleTripIds: eligible,
    realEligibleTripIds: realEligible,
    blockedReasons: blocked,
    distribution: {
      SHIFT: byOp.SHIFT.length,
      SWAP: byOp.SWAP.length,
      SHORTEN: byOp.SHORTEN.length,
      REROUTE: byOp.REROUTE.length,
      reject_or_fallback: rejectOrFallback.length,
    },
    samplingTarget: target,
    samplingGaps: {
      SHIFT: Math.max(0, target.SHIFT - byOp.SHIFT.length),
      SWAP: Math.max(0, target.SWAP - byOp.SWAP.length),
      SHORTEN: Math.max(0, target.SHORTEN - byOp.SHORTEN.length),
      REROUTE: Math.max(0, target.REROUTE - byOp.REROUTE.length),
      reject_or_fallback: Math.max(
        0,
        target.reject_or_fallback - rejectOrFallback.length,
      ),
    },
    next:
      blocked.length === 0 && realEligible.length >= 10
        ? [
            'Update selected-trips.whitelist.json',
            'Product APPROVE authority.json',
          ]
        : realEligible.length < 10
          ? [
              'Import ≥10 real deidentified trips (staging_export / production_export)',
              'Synthetic/gold packs only seal mechanism — they do not clear Dataset WAIT',
              'Fill expected-outcome reviews on real packs',
            ]
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

  console.log(`eligible: ${summary.eligible} (real=${summary.realEligible}, synthetic=${summary.syntheticEligible})`);
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
