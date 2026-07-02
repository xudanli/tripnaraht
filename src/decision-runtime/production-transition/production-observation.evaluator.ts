/**
 * Evaluates production observation window — time + six metric categories.
 */

import {
  PRODUCTION_OBSERVATION_THRESHOLDS,
  type ObservationDisposition,
  type ProductionObservationCategory,
} from './production-observation.catalog';
import { summarizeTriggerWiring } from '../trigger/decision-trigger-wiring.catalog';
import type { ProductionObservationSupplement } from './production-observation-supplement.types';

export interface ProductionObservationTimeWindow {
  elapsedDays: number;
  requiredDays: number;
  timePass: boolean;
  selectiveClosureAt: string | null;
  archivedDays?: number;
  observationStartedAt?: string | null;
}

export interface ProductionObservationRuntimeSnapshot {
  triggerWiring?: ReturnType<typeof summarizeTriggerWiring>;
  constraintShadowMetrics?: {
    comparedTotal: number;
    divergedTotal: number;
    byDivergenceKind: Record<string, number>;
  };
  mode?: string;
  constraintGatewayMode?: string;
  effectivePlanWriteGuard?: boolean;
}

export interface ProductionObservationMetricResult {
  metricId: string;
  label: string;
  category: ProductionObservationCategory;
  zeroTolerance: boolean;
  disposition: ObservationDisposition;
  detail: string;
  value?: number | string | boolean;
}

export interface ProductionObservationReport {
  schemaId: 'tripnara.production_observation_report@v1';
  generatedAt: string;
  timeWindow: ProductionObservationTimeWindow;
  overallDisposition: ObservationDisposition;
  categories: Record<
    ProductionObservationCategory,
    { disposition: ObservationDisposition; metricCount: number; failCount: number }
  >;
  metrics: ProductionObservationMetricResult[];
  bypassEntryPoints: Array<{ id: string; label: string; mode: string }>;
  blockers: string[];
  nextActions: string[];
}

function categorySummary(
  metrics: ProductionObservationMetricResult[],
  category: ProductionObservationCategory,
): { disposition: ObservationDisposition; metricCount: number; failCount: number } {
  const subset = metrics.filter((m) => m.category === category);
  const failCount = subset.filter((m) => m.disposition === 'FAIL').length;
  const incompleteCount = subset.filter((m) => m.disposition === 'INCOMPLETE').length;

  let disposition: ObservationDisposition = 'PASS';
  if (failCount > 0) disposition = 'FAIL';
  else if (incompleteCount > 0) disposition = 'INCOMPLETE';
  else if (subset.some((m) => m.disposition === 'PASS_WITH_CONDITIONS')) {
    disposition = 'PASS_WITH_CONDITIONS';
  }

  return { disposition, metricCount: subset.length, failCount };
}

function overallDisposition(
  time: ProductionObservationTimeWindow,
  metrics: ProductionObservationMetricResult[],
): ObservationDisposition {
  if (metrics.some((m) => m.disposition === 'FAIL')) return 'FAIL';
  if (!time.timePass || metrics.some((m) => m.disposition === 'INCOMPLETE')) {
    return 'INCOMPLETE';
  }
  if (metrics.some((m) => m.disposition === 'PASS_WITH_CONDITIONS')) {
    return 'PASS_WITH_CONDITIONS';
  }
  return 'PASS';
}

function zeroCountDisposition(
  count: number | undefined,
  collectionHint: string,
): { disposition: ObservationDisposition; detail: string; value?: number } {
  if (count === undefined) {
    return { disposition: 'INCOMPLETE', detail: collectionHint };
  }
  return {
    disposition: count === 0 ? 'PASS' : 'FAIL',
    detail: count === 0 ? '= 0' : `${count} occurrences`,
    value: count,
  };
}

export function evaluateProductionObservation(
  timeWindow: ProductionObservationTimeWindow,
  runtime?: ProductionObservationRuntimeSnapshot,
  supplement?: ProductionObservationSupplement,
): ProductionObservationReport {
  const wiring = runtime?.triggerWiring ?? summarizeTriggerWiring();
  const shadow = runtime?.constraintShadowMetrics;
  const overlay = supplement?.metricsOverlay;
  const archLint = supplement?.architectureLint;
  const writeGuard =
    runtime?.effectivePlanWriteGuard ?? supplement?.effectivePlanWriteGuard ?? false;
  const metrics: ProductionObservationMetricResult[] = [];

  const notWired = wiring.entries.filter((e) => e.mode === 'not_wired');
  const lineageOnly = wiring.entries.filter((e) => e.mode === 'lineage_only');

  for (const threshold of PRODUCTION_OBSERVATION_THRESHOLDS) {
    let disposition: ObservationDisposition = 'INCOMPLETE';
    let detail = threshold.collectionHint;
    let value: number | string | boolean | undefined;

    switch (threshold.metricId) {
      case 'trigger.gateway-coverage-pct':
        if (typeof overlay?.trigger?.gatewayCoveragePct === 'number') {
          value = overlay.trigger.gatewayCoveragePct;
          const dispatchNote =
            overlay.trigger.dispatchTotal !== undefined
              ? `; ${overlay.trigger.dispatchTotal} gateway dispatches`
              : '';
          disposition =
            overlay.trigger.gatewayCoveragePct >= 90 ? 'PASS' : 'PASS_WITH_CONDITIONS';
          detail = `Production coverage ${overlay.trigger.gatewayCoveragePct}%${dispatchNote}`;
        } else {
          value = wiring.dispatchCoveragePct;
          if (lineageOnly.length === 0 && notWired.length === 0) {
            disposition = 'PASS_WITH_CONDITIONS';
            detail = `Catalog ${wiring.dispatchWired}/${wiring.total} dispatch wired; production request volume metrics pending`;
          } else {
            disposition = 'INCOMPLETE';
            detail = `Catalog formal wiring ${wiring.dispatchCoveragePct}% (${wiring.dispatchWired} dispatch + ${wiring.lineageOnly} lineage); production request coverage requires metrics`;
          }
        }
        break;

      case 'trigger.bypass-requests':
        value = notWired.length + lineageOnly.length;
        if (notWired.length > 0) {
          disposition = 'FAIL';
          detail = `${notWired.length} catalog not_wired entries`;
        } else if (lineageOnly.length > 0) {
          disposition = 'PASS_WITH_CONDITIONS';
          detail = `${lineageOnly.length} lineage_only remain — verify production volume`;
        } else {
          disposition = 'PASS';
          detail = '0 catalog bypass entries (12/12 dispatch)';
        }
        break;

      case 'constraint.legacy-pass-canonical-block': {
        const count =
          shadow?.byDivergenceKind?.LEGACY_PASS_CANONICAL_BLOCK ??
          shadow?.byDivergenceKind?.legacy_pass_canonical_block ??
          undefined;
        if (count === undefined) {
          disposition = shadow ? 'PASS' : 'INCOMPLETE';
          detail = shadow
            ? 'No LEGACY_PASS_CANONICAL_BLOCK in snapshot'
            : threshold.collectionHint;
          value = count;
        } else {
          value = count;
          disposition = count === 0 ? 'PASS' : 'FAIL';
          detail = `${count} occurrences`;
        }
        break;
      }

      case 'constraint.block-winner': {
        const blockWinner = overlay?.constraint?.blockWinnerCount;
        if (blockWinner !== undefined) {
          ({ disposition, detail, value } = zeroCountDisposition(
            blockWinner,
            threshold.collectionHint,
          ));
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'executor.non-executor-effective-write':
        if (archLint) {
          value = archLint.executorBypassCount;
          if (!archLint.pass || archLint.executorBypassCount > 0) {
            disposition = 'FAIL';
            detail = `architecture lint executorBypass=${archLint.executorBypassCount}`;
          } else {
            disposition = 'PASS';
            detail = 'architecture lint: 0 setEffective/applyPlanOperations bypass';
          }
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;

      case 'executor.shadow-effective-write': {
        const runtimeShadowWrites = overlay?.executor?.shadowEffectiveWriteCount;
        if (runtimeShadowWrites !== undefined) {
          ({ disposition, detail, value } = zeroCountDisposition(
            runtimeShadowWrites,
            threshold.collectionHint,
          ));
        } else if (writeGuard && archLint?.pass) {
          disposition = 'PASS_WITH_CONDITIONS';
          detail = 'Write guard enabled + architecture lint pass; runtime counter pending';
          value = true;
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'executor.duplicate-execute': {
        const dup = overlay?.executor?.duplicateExecuteCount;
        if (dup !== undefined) {
          ({ disposition, detail, value } = zeroCountDisposition(dup, threshold.collectionHint));
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'authorization.unauthorized-execute': {
        const count = overlay?.authorization?.unauthorizedExecuteCount;
        if (count !== undefined) {
          ({ disposition, detail, value } = zeroCountDisposition(count, threshold.collectionHint));
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'authorization.expired-still-executed': {
        const count = overlay?.authorization?.expiredStillExecutedCount;
        if (count !== undefined) {
          ({ disposition, detail, value } = zeroCountDisposition(count, threshold.collectionHint));
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'monitoring.duplicate-decision-runs': {
        const dup = overlay?.monitoring?.duplicateDecisionRunCount;
        if (dup !== undefined) {
          value = dup;
          disposition = dup === 0 ? 'PASS' : 'PASS_WITH_CONDITIONS';
          detail = dup === 0 ? '= 0' : `${dup} duplicate runs — review trend`;
        } else {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        }
        break;
      }

      case 'latency.p95-growth': {
        const growth = overlay?.latency?.p95GrowthPct;
        if (growth === null || growth === undefined) {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        } else {
          value = growth;
          disposition = 'PASS_WITH_CONDITIONS';
          detail = `P95 growth ${growth}% — requires signed acceptable`;
        }
        break;
      }

      case 'latency.gateway-error-rate': {
        const rate = overlay?.latency?.gatewayErrorRatePct;
        if (rate === undefined) {
          disposition = 'INCOMPLETE';
          detail = threshold.collectionHint;
        } else {
          value = rate;
          disposition = rate < 1 ? 'PASS' : 'FAIL';
          detail = `${rate}% gateway errors`;
        }
        break;
      }

      default:
        disposition = 'INCOMPLETE';
    }

    metrics.push({
      metricId: threshold.metricId,
      label: threshold.label,
      category: threshold.category,
      zeroTolerance: threshold.zeroTolerance,
      disposition,
      detail,
      value,
    });
  }

  const categories = {
    trigger: categorySummary(metrics, 'trigger'),
    constraint: categorySummary(metrics, 'constraint'),
    authorization: categorySummary(metrics, 'authorization'),
    executor: categorySummary(metrics, 'executor'),
    monitoring: categorySummary(metrics, 'monitoring'),
    latency: categorySummary(metrics, 'latency'),
  };

  const overall = overallDisposition(timeWindow, metrics);
  const blockers: string[] = [];
  if (!timeWindow.timePass) {
    const archived = timeWindow.archivedDays;
    const archiveNote =
      archived !== undefined
        ? ` · archived ${archived}/${timeWindow.requiredDays}d`
        : '';
    blockers.push(
      `observation-time: ${timeWindow.elapsedDays.toFixed(1)}/${timeWindow.requiredDays}d${archiveNote}`,
    );
  }
  for (const m of metrics) {
    if (m.disposition === 'FAIL') blockers.push(m.metricId);
  }
  for (const [cat, summary] of Object.entries(categories)) {
    if (summary.disposition === 'INCOMPLETE') {
      blockers.push(`metrics-incomplete:${cat}`);
    }
  }

  const nextActions: string[] = [];
  if (!timeWindow.timePass) {
    nextActions.push('Continue daily/weekly production-observation:report during observation window');
    if (lineageOnly.length === 0 && notWired.length === 0) {
      nextActions.push(
        'Catalog trigger wiring 12/12 dispatch — enable production SHADOW metrics collection',
      );
    }
  }
  if (lineageOnly.length > 0) {
    nextActions.push(
      `Run trigger-bypass-priority for ranked wire targets (top: ${lineageOnly
        .slice(0, 3)
        .map((e) => e.id)
        .join(', ')})`,
    );
  }
  if (overall === 'INCOMPLETE') {
    if (!overlay) {
      nextActions.push(
        'Export Prometheus/ledger/APM → artifacts/production-observation/production-metrics.json (template: config/decision-runtime/production-metrics.template.json)',
      );
    } else {
      nextActions.push('Enable SHADOW metrics on production selective env; export to dashboard');
    }
  }
  if (overall === 'PASS' && timeWindow.timePass) {
    nextActions.push('Run: CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30 npm run p4-production-flip:advisory');
  }

  return {
    schemaId: 'tripnara.production_observation_report@v1',
    generatedAt: new Date().toISOString(),
    timeWindow,
    overallDisposition: overall,
    categories,
    metrics,
    bypassEntryPoints: [...notWired, ...lineageOnly].map((e) => ({
      id: e.id,
      label: e.label,
      mode: e.mode,
    })),
    blockers,
    nextActions,
  };
}
