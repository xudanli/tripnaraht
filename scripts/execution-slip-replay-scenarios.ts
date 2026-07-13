#!/usr/bin/env npx tsx
/**
 * Slice 3 DB Replay — assessor-only scenarios (Replay A–E).
 * Does not mutate DB; validates expected gates before staging sign-off.
 *
 * Usage: npx tsx scripts/execution-slip-replay-scenarios.ts
 */
import {
  assessExecutionScheduleFeasibility,
} from '../src/trips/guardian-decision-core/assessment/execution-slip-assessor.util';
import { evaluateShortenCandidateFeasible } from '../src/trips/guardian-decision-core/adapters/execution-slip-repair-candidate.adapter';
import type { PoiExecutionWindow } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';

const WINDOW: PoiExecutionWindow = {
  poiId: 'poi_b',
  activityId: 'activity-b',
  lastEntryAt: '16:00',
  closesAt: '18:00',
  timezone: 'Atlantic/Reykjavik',
  sourceProvider: 'replay',
  confidence: 1,
};

const PLANNED_DEPART = '2026-07-12T13:00:00.000Z';
const TRAVEL = 103;

function baseInput(observedAt: string, remainingStay: number) {
  return {
    observation: {
      activityId: 'activity-a',
      plannedDepartAt: PLANNED_DEPART,
      observedAt,
      stillAtPoi: true,
    },
    currentActivity: {
      activityId: 'activity-a',
      plannedDepartAt: PLANNED_DEPART,
      travelDurationMinutes: 0,
      remainingStayMinutes: remainingStay,
      dayIndex: 0,
    },
    nextActivity: {
      activityId: 'activity-b',
      plannedDepartAt: '2026-07-12T16:00:00.000Z',
      travelDurationMinutes: TRAVEL,
      remainingStayMinutes: 0,
      dayIndex: 0,
    },
    travelDurationMinutes: TRAVEL,
    nextWindow: WINDOW,
  };
}

type ReplayResult = { id: string; pass: boolean; detail: string };

function run(): ReplayResult[] {
  const out: ReplayResult[] = [];

  // Replay A — slight delay, ETA 15:45
  const a = assessExecutionScheduleFeasibility(
    baseInput('2026-07-12T13:10:00.000Z', 32),
  );
  out.push({
    id: 'Replay-A-slight-delay',
    pass: a.result === 'STILL_FEASIBLE' && !a.infeasible,
    detail: `${a.result} projected=${a.projectedEta}`,
  });

  // Replay B — window miss ETA 16:18
  const b = assessExecutionScheduleFeasibility(
    baseInput('2026-07-12T13:35:00.000Z', 60),
  );
  out.push({
    id: 'Replay-B-window-missed',
    pass: b.result === 'WINDOW_MISSED' && b.infeasible,
    detail: `${b.result} projected=${b.projectedEta}`,
  });

  // Replay C — shorten 25min feasible
  const cOk = evaluateShortenCandidateFeasible({
    observationAt: '2026-07-12T13:35:00.000Z',
    remainingStayMinutes: 60,
    shortenMinutes: 25,
    travelDurationMinutes: TRAVEL,
    nextWindow: WINDOW,
  });
  out.push({
    id: 'Replay-C-shorten-feasible',
    pass: cOk,
    detail: `shorten25 accepted=${cOk}`,
  });

  // Replay D — shorten 10min rejected
  const dOk = evaluateShortenCandidateFeasible({
    observationAt: '2026-07-12T13:35:00.000Z',
    remainingStayMinutes: 60,
    shortenMinutes: 10,
    travelDurationMinutes: TRAVEL,
    nextWindow: WINDOW,
  });
  out.push({
    id: 'Replay-D-shorten-rejected',
    pass: !dOk,
    detail: `shorten10 rejected=${!dOk}`,
  });

  // Replay E — no lastEntryAt → UNKNOWN, not infeasible
  const e = assessExecutionScheduleFeasibility({
    ...baseInput('2026-07-12T13:35:00.000Z', 60),
    nextWindow: null,
  });
  out.push({
    id: 'Replay-E-no-window',
    pass: e.result === 'UNKNOWN' && !e.infeasible,
    detail: `${e.result} gate=${e.gate}`,
  });

  return out;
}

function main() {
  const results = run();
  let failed = 0;
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) failed += 1;
    console.log(`[${mark}] ${r.id}: ${r.detail}`);
  }
  if (failed > 0) process.exit(1);
  console.log('\nAll execution-slip replay scenarios PASS');
}

main();
