import type { HarnessShadowCheckSnapshot } from '../../../decision/kernel/harness-shadow-metrics.collector';
import {
  parseHarnessShadowAfterPhaseEnabled,
  parseHarnessShadowConsecutiveThreshold,
} from '../../../decision/kernel/harness-kernel-hard-mode.util';

export const HARNESS_SHADOW_HARNESS_ADMIN_SCHEMA = 'tripnara.shadow_harness_admin@v1' as const;

export interface HarnessShadowHarnessAdminSnapshotV1 {
  schemaId: typeof HARNESS_SHADOW_HARNESS_ADMIN_SCHEMA;
  version: 1;
  enabled: boolean;
  metrics_disabled: boolean;
  shadow_after_phase: boolean;
  consecutive_success_count: number;
  consecutive_threshold: number;
  shadow_checks_total: number;
  non_pass_checks_total: number;
  non_pass_rate: number;
  by_stage_status: Record<string, number>;
  ops_readiness: {
    ready: boolean;
    blockers: string[];
  };
}

function countNonPassChecks(byStageStatus: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(byStageStatus)) {
    const status = key.split('|').pop() ?? '';
    if (status !== 'PASSED' && status !== 'REPAIRED') {
      n += count;
    }
  }
  return n;
}

export function buildHarnessShadowHarnessAdminSnapshot(params: {
  metrics: HarnessShadowCheckSnapshot;
  env?: NodeJS.ProcessEnv;
}): HarnessShadowHarnessAdminSnapshotV1 {
  const env = params.env ?? process.env;
  const shadowAfterPhase = parseHarnessShadowAfterPhaseEnabled(env);
  const metricsDisabled = env.HARNESS_SHADOW_METRICS_DISABLED?.trim() === '1';
  const threshold = parseHarnessShadowConsecutiveThreshold(env);
  const nonPass = countNonPassChecks(params.metrics.by_stage_status);
  const total = params.metrics.shadow_checks_total;
  const nonPassRate = total > 0 ? nonPass / total : 0;

  const blockers: string[] = [];
  if (metricsDisabled) blockers.push('HARNESS_SHADOW_METRICS_DISABLED');
  if (!shadowAfterPhase) blockers.push('HARNESS_SHADOW_AFTER_PHASE_off');
  if (total === 0) blockers.push('no_shadow_checks_recorded');

  return {
    schemaId: HARNESS_SHADOW_HARNESS_ADMIN_SCHEMA,
    version: 1,
    enabled: shadowAfterPhase && !metricsDisabled,
    metrics_disabled: metricsDisabled,
    shadow_after_phase: shadowAfterPhase,
    consecutive_success_count: params.metrics.consecutive_success_count,
    consecutive_threshold: threshold,
    shadow_checks_total: total,
    non_pass_checks_total: nonPass,
    non_pass_rate: Math.round(nonPassRate * 10_000) / 10_000,
    by_stage_status: params.metrics.by_stage_status,
    ops_readiness: {
      ready: blockers.length === 0 && total > 0,
      blockers,
    },
  };
}
