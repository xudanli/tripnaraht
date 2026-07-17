#!/usr/bin/env npx tsx
/**
 * ETA-L2-CANARY-01 — emit empty canary dashboard + rule adjudication skeleton.
 *
 *   npm run lab:eta-l2-canary-dashboard
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TravelEtaCanaryDashboardService } from '../../services/travel-eta-canary-dashboard.service';

const OUT = join(process.cwd(), 'src/transport/ops/lab/.out');

function main(): number {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const dash = new TravelEtaCanaryDashboardService();
  const snapshot = dash.buildSnapshot({ stage: 'selected_trips' });
  const adjudication = dash.adjudicateAdjustmentRules([]);

  writeFileSync(
    join(OUT, 'canary-dashboard-snapshot.json'),
    JSON.stringify(snapshot, null, 2) + '\n',
  );
  writeFileSync(
    join(OUT, 'rule-adjudication.json'),
    JSON.stringify(adjudication, null, 2) + '\n',
  );

  console.log(
    JSON.stringify(
      {
        snapshotPath: 'src/transport/ops/lab/.out/canary-dashboard-snapshot.json',
        adjudicationPath: 'src/transport/ops/lab/.out/rule-adjudication.json',
        snapshot,
        adjudication,
      },
      null,
      2,
    ),
  );
  return 0;
}

process.exit(main());
