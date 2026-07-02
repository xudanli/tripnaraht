/**
 * P3 staging validation — replanning policy, event dedup, detector catalog.
 *
 * Usage:
 *   REPLANNING_TRIGGER_POLICY_ENABLED=1 npm run p3-staging:validate
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { summarizeMonitoringDetectorWiring } from '../../src/decision-runtime/trigger/monitoring-detector-wiring.catalog';
import { evaluateReplanningTrigger } from '../../src/decision-runtime/trigger/replanning-trigger.policy';
import {
  inferWorldEventSeverity,
  shouldRunKernelFullReplan,
  toReplanningTriggerDecision,
} from '../../src/decision-runtime/trigger/replanning-trigger-decision.util';
import {
  buildEventFingerprint,
  shouldDedupeEvent,
} from '../../src/decision-runtime/trigger/event-dedup.util';
import { buildDecisionTriggerEvent } from '../../src/decision-runtime/trigger/decision-trigger-event.types';
import {
  inferInTripEventSeverity,
  shouldDelegateFullReplan,
  shouldRunInTripRecovery,
} from '../../src/decision-runtime/trigger/in-trip-replanning.util';
import { buildTriggerCenterView } from '../../src/decision-runtime/trigger/trigger-center.view';
import { isBoundedLnsRepairEnabled } from '../../src/decision-runtime/local-repair/bounded-lns-repair.config';
import { selectBoundedRepairCandidate } from '../../src/decision-runtime/local-repair/bounded-lns-repair.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts/p3-staging-validation');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p3-staging] ${line}`);
}

function runPolicyProbes(): Array<{ id: string; pass: boolean; detail: string }> {
  const saved = process.env.REPLANNING_TRIGGER_POLICY_ENABLED;
  process.env.REPLANNING_TRIGGER_POLICY_ENABLED = '1';

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];

  const monitoringNoOp = evaluateReplanningTrigger({
    tripId: 'p3',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    decisionRecordStale: false,
  });
  probes.push({
    id: 'monitoring-no-stale-no-op',
    pass: monitoringNoOp.action === 'NO_OP',
    detail: monitoringNoOp.action,
  });

  const worldHigh = evaluateReplanningTrigger({
    tripId: 'p3',
    triggerKind: 'WORLD_EVENT',
    eventSeverity: 'HIGH',
    affectsEffectivePlan: true,
    decisionRecordStale: true,
  });
  const worldDecision = toReplanningTriggerDecision(worldHigh, { eventSeverity: 'HIGH' });
  probes.push({
    id: 'world-high-full-replan',
    pass: worldHigh.action === 'FULL_REPLAN' && worldDecision.shouldTrigger,
    detail: worldHigh.action,
  });

  const severity = inferWorldEventSeverity('flight_cancelled');
  probes.push({
    id: 'infer-flight-cancelled-high',
    pass: severity === 'HIGH',
    detail: severity,
  });

  probes.push({
    id: 'kernel-skip-local-repair',
    pass: !shouldRunKernelFullReplan('LOCAL_REPAIR'),
    detail: 'LOCAL_REPAIR skips kernel',
  });

  const fp = buildEventFingerprint({
    tripId: 'p3',
    eventType: 'WEATHER_HAZARD_CHANGED',
    source: 'poll',
  });
  const store = new Map();
  const now = Date.now();
  const first = shouldDedupeEvent(fp, 'MEDIUM', store, now);
  const second = shouldDedupeEvent(fp, 'MEDIUM', store, now + 500);
  probes.push({
    id: 'event-dedup-cooldown',
    pass: !first.dedupe && second.dedupe,
    detail: `second=${second.dedupe}`,
  });

  const event = buildDecisionTriggerEvent({
    eventId: 'ev1',
    eventType: 'ROAD_CLOSED',
    source: 'detector',
    tripId: 'p3',
    severity: 'HIGH',
  });
  probes.push({
    id: 'trigger-event-m1',
    pass: event.schemaId === 'tripnara.decision_trigger_event@v1',
    detail: event.eventType,
  });

  const inTripHigh = evaluateReplanningTrigger({
    tripId: 'p3',
    triggerKind: 'IN_TRIP_DEVIATION',
    eventSeverity: 'HIGH',
  });
  probes.push({
    id: 'in-trip-high-partial-replan',
    pass:
      inTripHigh.action === 'PARTIAL_REPLAN' &&
      shouldRunInTripRecovery(inTripHigh.action),
    detail: inTripHigh.action,
  });

  const inTripLow = evaluateReplanningTrigger({
    tripId: 'p3',
    triggerKind: 'IN_TRIP_DEVIATION',
    eventSeverity: 'LOW',
  });
  probes.push({
    id: 'in-trip-low-local-repair',
    pass:
      inTripLow.action === 'LOCAL_REPAIR' &&
      shouldRunInTripRecovery(inTripLow.action),
    detail: inTripLow.action,
  });

  probes.push({
    id: 'in-trip-delegate-full-replan',
    pass: shouldDelegateFullReplan('FULL_REPLAN') && inferInTripEventSeverity('ROAD_CLOSED') === 'HIGH',
    detail: 'FULL_REPLAN delegated',
  });

  const savedBounded = process.env.BOUNDED_LNS_REPAIR_ENABLED;
  process.env.BOUNDED_LNS_REPAIR_ENABLED = '1';
  probes.push({
    id: 'bounded-lns-flag',
    pass: isBoundedLnsRepairEnabled(),
    detail: 'enabled',
  });
  probes.push({
    id: 'bounded-lns-candidate-select',
    pass:
      selectBoundedRepairCandidate([
        {
          candidateId: 'base',
          label: 'baseline',
          source: 'LEGACY_TRIP_PLANNING',
          plan: {} as never,
          createdAt: new Date().toISOString(),
        },
        {
          candidateId: 'repair',
          label: 'local repair',
          source: 'NEPTUNE_REPAIR',
          plan: {} as never,
          createdAt: new Date().toISOString(),
        },
      ])?.candidateId === 'repair',
    detail: 'NEPTUNE_REPAIR preferred',
  });
  if (savedBounded === undefined) delete process.env.BOUNDED_LNS_REPAIR_ENABLED;
  else process.env.BOUNDED_LNS_REPAIR_ENABLED = savedBounded;

  const triggerCenter = buildTriggerCenterView('p3-probe', []);
  probes.push({
    id: 'trigger-center-m7-view',
    pass: triggerCenter.schemaId === 'tripnara.trigger_center_view@v1',
    detail: `items=${triggerCenter.itemCount}`,
  });

  if (saved === undefined) delete process.env.REPLANNING_TRIGGER_POLICY_ENABLED;
  else process.env.REPLANNING_TRIGGER_POLICY_ENABLED = saved;

  return probes;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log('running P3 unit probes…');
  execSync(
    'npx jest src/decision-runtime/p3-phase/p3-phase-baseline.spec.ts src/decision-runtime/trigger/replanning-trigger.policy.spec.ts src/decision-runtime/trigger/trigger-center.view.spec.ts --runInBand',
    { stdio: 'inherit' },
  );

  const policyProbes = runPolicyProbes();
  const detectorWiring = summarizeMonitoringDetectorWiring();
  const blockers: string[] = [];

  if (policyProbes.some((p) => !p.pass)) {
    blockers.push('replanning policy probes failed');
  }
  if (detectorWiring.wiredCoveragePct < 100) {
    blockers.push('detector wiring incomplete');
  }

  const pass = blockers.length === 0;
  const report = {
    schemaId: 'tripnara.p3_staging_validation@v1',
    generatedAt: new Date().toISOString(),
    pass,
    policyProbes,
    detectorWiring,
    blockers,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} policyProbes=${policyProbes.filter((p) => p.pass).length}/${policyProbes.length}`);

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
