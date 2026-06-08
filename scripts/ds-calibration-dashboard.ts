/**
 * DS 校准仪表盘：ScoreRisk golden + decision-closure gate + 可选 POMDP / narrative drift log 摘要。
 */
import * as fs from 'node:fs';
import { COUNTRY_DECISION_CLOSURE_FIXTURES } from '../src/trips/decision/evaluation/e2e-cases/registry';
import {
  assertScoreRiskCalibrationGate,
  buildScoreRiskCalibrationReport,
} from '../src/trips/decision/tot/score-risk-calibration.util';
import { runDecisionClosureGate } from './lib/decision-closure-gate';
import { buildNarrativeDriftLogReport } from './lib/narrative-drift-log.util';

type PomdpMetricEvent = {
  type: string;
  countryCode?: string;
  refinementEffective?: boolean;
  weightJSDivergence?: number;
};

function parsePomdpEvents(logPath: string): PomdpMetricEvent[] {
  const raw = fs.readFileSync(logPath, 'utf8');
  const events: PomdpMetricEvent[] = [];
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('[POMDP_METRIC]');
    if (idx < 0) continue;
    const jsonStart = line.indexOf('{', idx);
    if (jsonStart < 0) continue;
    try {
      events.push(JSON.parse(line.slice(jsonStart)) as PomdpMetricEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

function summarizePomdp(events: PomdpMetricEvent[]) {
  const applied = events.filter((e) => e.type === 'POMDP_REFINEMENT_APPLIED').length;
  const skipped = events.filter((e) => e.type === 'POMDP_REFINEMENT_SKIPPED').length;
  const effective = events.filter((e) => e.refinementEffective).length;
  const jsValues = events
    .map((e) => e.weightJSDivergence)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const jsP90 =
    jsValues.length > 0
      ? jsValues.sort((a, b) => a - b)[Math.min(jsValues.length - 1, Math.ceil(0.9 * jsValues.length) - 1)]
      : undefined;
  return {
    totalEvents: events.length,
    applied,
    skipped,
    effective,
    weightJSDivergenceP90: jsP90,
    calibrateScript: 'npm run calibrate:pomdp-thresholds -- <log-file>',
  };
}

function parseArgs(): { pomdpLog?: string; narrativeDriftLog?: string } {
  const args = process.argv.slice(2);
  const pomdpIdx = args.indexOf('--pomdp-log');
  const driftIdx = args.indexOf('--narrative-drift-log');
  const out: { pomdpLog?: string; narrativeDriftLog?: string } = {};
  if (pomdpIdx >= 0 && args[pomdpIdx + 1]) {
    out.pomdpLog = args[pomdpIdx + 1];
  } else if (process.env.POMDP_METRICS_LOG) {
    out.pomdpLog = process.env.POMDP_METRICS_LOG;
  }
  if (driftIdx >= 0 && args[driftIdx + 1]) {
    out.narrativeDriftLog = args[driftIdx + 1];
  } else if (process.env.NARRATIVE_DRIFT_METRICS_LOG_FILE) {
    out.narrativeDriftLog = process.env.NARRATIVE_DRIFT_METRICS_LOG_FILE;
  }
  return out;
}

function main(): void {
  const { pomdpLog, narrativeDriftLog } = parseArgs();
  const scoreRisk = buildScoreRiskCalibrationReport();
  const scoreRiskErrors = assertScoreRiskCalibrationGate(scoreRisk);
  const closure = runDecisionClosureGate(COUNTRY_DECISION_CLOSURE_FIXTURES);

  const dashboard = {
    generatedAt: new Date().toISOString(),
    contractVersion: 'ds-calibration-dashboard/v1',
    environment: {
      PHYSICAL_EVIDENCE_GATE: process.env.PHYSICAL_EVIDENCE_GATE ?? 'warn',
      DECISION_LOG_STRICT_WRITE: process.env.DECISION_LOG_STRICT_WRITE ?? '0',
    },
    scoreRisk,
    decisionClosure: {
      fixtures: COUNTRY_DECISION_CLOSURE_FIXTURES.length,
      passed: closure.passed,
      failed: closure.failed,
      results: closure.results,
    },
    pomdp: pomdpLog && fs.existsSync(pomdpLog) ? summarizePomdp(parsePomdpEvents(pomdpLog)) : undefined,
    narrativeDrift:
      narrativeDriftLog && fs.existsSync(narrativeDriftLog)
        ? buildNarrativeDriftLogReport(narrativeDriftLog)
        : undefined,
  };

  console.log(JSON.stringify(dashboard, null, 2));

  const errors: string[] = [...scoreRiskErrors];
  if (closure.failed > 0) {
    errors.push(`decision-closure gate failed=${closure.failed}`);
  }
  if (errors.length > 0) {
    console.error('ds-calibration-dashboard FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.error(
    `ds-calibration-dashboard: OK scoreRisk=${scoreRisk.scenarios.length}+${scoreRisk.countryClosureScenarios.length}+${scoreRisk.replayClosureScenarios.length} closure=${closure.passed}/${COUNTRY_DECISION_CLOSURE_FIXTURES.length}`,
  );
}

main();
