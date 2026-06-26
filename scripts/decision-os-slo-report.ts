#!/usr/bin/env npx ts-node
/**
 * Decision OS SLO 报告 + 约束验证 baseline
 *
 * 运行:
 *   ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/decision-os-slo-report.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Logger } from '@nestjs/common';
import { DecisionOsSloService } from '../src/decision/slo/decision-os-slo.service';
import { VerifyExecutorService } from '../src/agent/execution/verify-executor.service';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../src/decision/kernel/interfaces/phase-executor.interface';

const logger = new Logger('DecisionOsSloReport');

function compliantItinerary() {
  return {
    request_id: 'slo-bench',
    days: [
      {
        date: '2025-06-01',
        items: [
          {
            id: '1',
            type: 'POI',
            location_ref: { name: 'A' },
            start_window: '09:00',
            end_window: '12:00',
            evidence_refs: [],
            verified: false,
            metadata: { duration_minutes: 180, distance_meters: 3000 },
          },
        ],
      },
    ],
  };
}

function nonCompliantItinerary() {
  return {
    request_id: 'slo-bench-bad',
    days: [
      {
        date: '2025-06-01',
        items: [
          {
            id: '1',
            type: 'WALK',
            location_ref: { name: '徒步超限' },
            start_window: '09:00',
            end_window: '18:00',
            evidence_refs: [],
            verified: false,
            metadata: { duration_minutes: 540, distance_meters: 20000 },
          },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const slo = app.get(DecisionOsSloService);
    const verify = app.get(VerifyExecutorService);
    slo.reset();

    const dso: DecisionState = {
      requestId: 'slo-bench',
      userIntent: { budget: 20000, party: { count: 2, fitnessLevel: 'medium' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'slo-bench' },
    };

    const baseCtx: PhaseExecutorContext = {
      requestId: 'slo-bench',
      researchData: {},
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
      tripPlanRequest: {
        destination: 'IS',
        date_range: { start_date: '2025-06-01', end_date: '2025-06-05' },
        days: 5,
        party: { count: 2 },
        party_profile: { fitness: 'medium' },
      },
    };

    logger.log('━━━ Validation Gateway baseline ━━━');
    const good = await verify.execute(dso, { ...baseCtx, itinerary: compliantItinerary() });
    const bad = await verify.execute(dso, { ...baseCtx, requestId: 'slo-bench-bad', itinerary: nonCompliantItinerary() });

    logger.log(`合规行程 issues=${good.issues.length} confidenceDelta=${good.confidenceDelta}`);
    logger.log(`违规行程 issues=${bad.issues.length} confidenceDelta=${bad.confidenceDelta}`);

    const snap = slo.getSnapshot();
    logger.log('\n━━━ SLO Snapshot ━━━');
    logger.log(JSON.stringify(snap, null, 2));

    const compliantPass = good.issues.length === 0;
    const violationDetected = bad.issues.length > 0;
    logger.log(`\n验收: 合规通过=${compliantPass} 违规检出=${violationDetected} validationPassRate=${snap.validation.passRatePct}%`);

    if (!compliantPass || !violationDetected) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
