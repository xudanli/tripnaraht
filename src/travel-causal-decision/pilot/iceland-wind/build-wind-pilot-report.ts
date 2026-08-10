/**
 * Pilot metrics + reconciliation report (Phase Gate item 4).
 * Machine JSON for dashboards; markdown for review boards.
 */

import { toCausalDecisionProductView } from '../../api/to-causal-decision-product-view';
import { evaluateWindPilotSuite } from './evaluate-wind-pilot.util';
import type { IcelandWindPilotEvidence } from './wind-pilot.types';
import { countByArchetype } from './wind-pilot-case.registry';

export const ICELAND_WIND_PILOT_METRICS_SCHEMA =
  'tripnara.iceland_wind_pilot_metrics@v1' as const;

export interface WindPilotCaseMetricsRow {
  caseId: string;
  archetype: string;
  titleZh: string;
  ok: boolean;
  errors: string[];
  missProbability?: number;
  interventionDeadline?: string;
  recommendationOptionId?: string;
  finalReconciliation: string;
  lifecycleStatus: string;
  productHeadline: string;
  statusMessage?: string;
  highRoof?: boolean;
  windMps: number;
  windGustMps?: number;
}

export interface WindPilotMetricsReport {
  schema: typeof ICELAND_WIND_PILOT_METRICS_SCHEMA;
  generatedAt: string;
  ok: boolean;
  suite: {
    caseCount: number;
    singleRootCardRate: number;
    recommendedValidationPassRate: number;
    deadlineBeforeIrreparableRate: number;
    incompleteObsUnobservableRate: number;
    applyNotAutoConfirmRate: number;
  };
  byArchetype: Record<string, { count: number; passCount: number }>;
  cases: WindPilotCaseMetricsRow[];
  errors: string[];
}

export function buildWindPilotMetricsReport(
  cases: IcelandWindPilotEvidence[],
  generatedAt = new Date().toISOString(),
): WindPilotMetricsReport {
  const suite = evaluateWindPilotSuite(cases);
  const byArchetypeRaw = countByArchetype(cases);
  const byArchetype: Record<string, { count: number; passCount: number }> = {};

  for (const [arch, count] of Object.entries(byArchetypeRaw)) {
    const archCases = cases.filter((c) => c.archetype === arch);
    const passCount = archCases.filter((c) => {
      const r = suite.caseReports.find((x) => x.caseId === c.caseId);
      return r?.ok;
    }).length;
    byArchetype[arch] = { count, passCount };
  }

  const rows: WindPilotCaseMetricsRow[] = cases.map((c) => {
    const report = suite.caseReports.find((x) => x.caseId === c.caseId);
    const product = toCausalDecisionProductView({
      decision: c.decision,
      problemId: c.caseId,
      lifecycleOverride:
        c.finalReconciliation === 'UNOBSERVABLE'
          ? 'AWAITING_OBSERVATION'
          : c.finalReconciliation === 'CONFIRMED' ||
              c.finalReconciliation === 'PARTIAL' ||
              c.finalReconciliation === 'DISPROVED'
            ? 'RECONCILED'
            : undefined,
    });
    const miss =
      c.decision.baselineOutcome.metrics?.iceland_miss_prob ??
      (c.decision.baselineOutcome.completionProbability != null
        ? 1 - c.decision.baselineOutcome.completionProbability
        : undefined);

    return {
      caseId: c.caseId,
      archetype: c.archetype,
      titleZh: c.titleZh,
      ok: report?.ok ?? false,
      errors: report?.errors ?? [],
      missProbability:
        typeof miss === 'number' ? Math.round(miss * 1000) / 1000 : undefined,
      interventionDeadline: c.decision.temporalForecast.interventionDeadline,
      recommendationOptionId: c.decision.recommendation?.optionId,
      finalReconciliation: c.finalReconciliation,
      lifecycleStatus: product.lifecycleStatus,
      productHeadline: product.headline,
      statusMessage: product.statusMessage,
      highRoof: c.factSnapshot.highRoof,
      windMps: c.factSnapshot.windMps,
      windGustMps: c.factSnapshot.windGustMps,
    };
  });

  return {
    schema: ICELAND_WIND_PILOT_METRICS_SCHEMA,
    generatedAt,
    ok: suite.ok,
    suite: suite.metrics,
    byArchetype,
    cases: rows,
    errors: suite.errors,
  };
}

export function renderWindPilotReportMarkdown(report: WindPilotMetricsReport): string {
  const lines: string[] = [
    '# Iceland Wind Causal Decision — Pilot Metrics',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Suite OK: **${report.ok ? 'PASS' : 'FAIL'}**`,
    `- Cases: ${report.suite.caseCount}`,
    '',
    '## Gate metrics',
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| recommendedValidationPassRate | ${report.suite.recommendedValidationPassRate} |`,
    `| deadlineBeforeIrreparableRate | ${report.suite.deadlineBeforeIrreparableRate} |`,
    `| incompleteObsUnobservableRate | ${report.suite.incompleteObsUnobservableRate} |`,
    `| applyNotAutoConfirmRate | ${report.suite.applyNotAutoConfirmRate} |`,
    '',
    '## By archetype',
    '',
    `| Archetype | Count | Pass |`,
    `| --- | --- | --- |`,
  ];

  for (const [arch, v] of Object.entries(report.byArchetype)) {
    lines.push(`| ${arch} | ${v.count} | ${v.passCount} |`);
  }

  lines.push('', '## Cases', '');
  for (const c of report.cases) {
    const miss =
      c.missProbability != null ? `${Math.round(c.missProbability * 100)}%` : '—';
    lines.push(
      `### ${c.caseId} ${c.ok ? '✓' : '✗'}`,
      `- ${c.titleZh}`,
      `- wind ${c.windMps} m/s` +
        (c.windGustMps != null ? ` (gust ${c.windGustMps})` : '') +
        (c.highRoof ? ' · highRoof' : ''),
      `- miss≈${miss} · deadline ${c.interventionDeadline ?? '—'}`,
      `- rec ${c.recommendationOptionId ?? '—'} · recon ${c.finalReconciliation} · ${c.lifecycleStatus}`,
      `- headline: ${c.productHeadline}`,
    );
    if (c.statusMessage) lines.push(`- status: ${c.statusMessage}`);
    if (c.errors.length) lines.push(`- errors: ${c.errors.join('; ')}`);
    lines.push('');
  }

  if (report.errors.length) {
    lines.push('## Suite errors', '');
    for (const e of report.errors) lines.push(`- ${e}`);
    lines.push('');
  }

  return lines.join('\n');
}
