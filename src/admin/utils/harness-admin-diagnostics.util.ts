import type { HarnessShadowCheckSnapshot } from '../../decision/kernel/harness-shadow-metrics.collector';
import type { HarnessKernelHardDiagnosticsSnapshot } from '../../decision/kernel/harness-kernel-hard-mode.util';
import { buildHarnessKernelHardDiagnosticsSnapshot } from '../../decision/kernel/harness-kernel-hard-mode.util';
import type { HarnessQualityLoopSnapshotV1 } from '../../harness/eval/quality/harness-quality-loop.util';
import type { HarnessShadowHarnessAdminSnapshotV1 } from '../../harness/eval/quality/harness-shadow-harness-diagnostics.util';
import type { LlmRoutingAdminSnapshotV1 } from '../../agent/runtime/harness-llm-routing-observability.util';

export interface HarnessShadowGraderDiagnosticsSnapshot {
  enabled: boolean;
  active_shadow_version: string | null;
  in_flight_count: number;
  trajectory_capture_enabled: boolean;
  ops_readiness: {
    ready: boolean;
    blockers: string[];
    grader_enabled: boolean;
    trajectory_capture_enabled: boolean;
  };
  registrations: Array<{
    shadow_version: string;
    task_id: string;
    lifecycle: string;
    registered_at: string;
    lora_loaded: boolean;
  }>;
  aggregate: {
    sampleCount: number;
    shadowWinRate: number;
    promotionReady: boolean;
    promotionBlockers: string[];
    productionSafetyPassRate: number;
    shadowSafetyPassRate: number;
  } | null;
}

export interface HarnessAdminDiagnosticsSnapshot extends HarnessShadowCheckSnapshot {
  kernel_hard: HarnessKernelHardDiagnosticsSnapshot;
  shadow_grader: HarnessShadowGraderDiagnosticsSnapshot | null;
  cost_governance: {
    token_quota_enabled: boolean;
    user_daily_limit: number;
    org_daily_limit: number;
    global_daily_limit: number;
    session_token_cap: number;
  } | null;
  cost_history: import('../../agent/runtime/harness-cost-history.util').HarnessCostHistoryV1 | null;
  quality_loop: HarnessQualityLoopSnapshotV1 | null;
  shadow_harness: HarnessShadowHarnessAdminSnapshotV1 | null;
  llm_routing: LlmRoutingAdminSnapshotV1 | null;
  decision_state_divergence: {
    counters: Record<string, number>;
    prometheus_text: string;
  } | null;
}

export function buildHarnessAdminDiagnosticsSnapshot(params: {
  harness: HarnessShadowCheckSnapshot;
  shadowGrader: HarnessShadowGraderDiagnosticsSnapshot | null;
  costGovernance?: HarnessAdminDiagnosticsSnapshot['cost_governance'];
  costHistory?: HarnessAdminDiagnosticsSnapshot['cost_history'];
  qualityLoop?: HarnessAdminDiagnosticsSnapshot['quality_loop'];
  shadowHarness?: HarnessAdminDiagnosticsSnapshot['shadow_harness'];
  llmRouting?: HarnessAdminDiagnosticsSnapshot['llm_routing'];
  decisionStateDivergence?: HarnessAdminDiagnosticsSnapshot['decision_state_divergence'];
}): HarnessAdminDiagnosticsSnapshot {
  return {
    ...params.harness,
    kernel_hard: buildHarnessKernelHardDiagnosticsSnapshot({ shadowMetrics: params.harness }),
    shadow_grader: params.shadowGrader,
    cost_governance: params.costGovernance ?? null,
    cost_history: params.costHistory ?? null,
    quality_loop: params.qualityLoop ?? null,
    shadow_harness: params.shadowHarness ?? null,
    llm_routing: params.llmRouting ?? null,
    decision_state_divergence: params.decisionStateDivergence ?? null,
  };
}
