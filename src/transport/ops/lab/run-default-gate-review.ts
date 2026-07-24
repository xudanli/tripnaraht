#!/usr/bin/env npx tsx
/**
 * ETA-L2-CANARY-01 — Default Gate Review for promote to iceland_canary_5%.
 *
 * Reads optional JSON snapshot from:
 *   src/transport/ops/lab/.out/canary-dashboard-snapshot.json
 * or builds an empty/low-sample snapshot (expects NO_GO / hold until VALID samples exist).
 *
 *   npm run lab:eta-l2-default-gate-review
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TravelEtaCanaryDashboardSnapshotV1 } from '../travel-eta-l2-canary.gate';
import { evaluateIcelandDefaultGateReview } from '../travel-eta-l2-canary.gate';
import { TravelEtaCanaryDashboardService } from '../../services/travel-eta-canary-dashboard.service';

const OUT = join(process.cwd(), 'src/transport/ops/lab/.out');

function loadSnapshot(): TravelEtaCanaryDashboardSnapshotV1 | undefined {
  const p = join(OUT, 'canary-dashboard-snapshot.json');
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as TravelEtaCanaryDashboardSnapshotV1;
  } catch {
    return undefined;
  }
}

function main(): number {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const dash = new TravelEtaCanaryDashboardService();
  const snapshot =
    loadSnapshot() ??
    dash.buildSnapshot({
      stage: 'selected_trips',
      authoritativeTripCount: 0,
      authoritativeSegmentCount: 0,
      dem20mHitRate: null,
      requiredTerrainCoverage: null,
      safety: {
        closedScheduledCount: 0,
        twoWdOnForced4WdCount: 0,
        requiredTerrainSkippedCount: 0,
        unknownProviderAuthoritativeCount: 0,
        killSwitchRollbackFailures: 0,
      },
    });

  const review = dash.reviewPromotionToCanary5pct({ snapshot });
  const icelandDefault = evaluateIcelandDefaultGateReview({ snapshot });

  const outPath = join(OUT, 'default-gate-review.json');
  const payload = {
    selectedTripsToCanary5pct: review,
    icelandDefaultReference: icelandDefault,
    snapshotSummary: {
      validActualSampleCount: snapshot.validActualSampleCount,
      baseMaeMin: snapshot.baseMaeMin,
      planningMaeMin: snapshot.planningMaeMin,
      maeImprovementRatio: snapshot.maeImprovementRatio,
      safety: snapshot.safety,
    },
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify(payload, null, 2));

  // Exit 0 even on NO_GO — review artifact is the deliverable; use --require-go to fail
  if (process.argv.includes('--require-go') && review.recommendNextStage !== 'iceland_canary_5%') {
    return 1;
  }
  return 0;
}

process.exit(main());
