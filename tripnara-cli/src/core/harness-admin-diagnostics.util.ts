/**
 * CLI：Harness admin diagnostics / shadow grader 快照解析与格式化。
 */

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

export interface HarnessAdminDiagnosticsSnapshot {
  shadow_checks_total: number;
  consecutive_success_count: number;
  by_stage_status: Record<string, number>;
  kernel_hard: {
    enabled: boolean;
    shadow_after_phase: boolean;
    shadow_strict: boolean;
    consecutive_success_count: number;
    consecutive_threshold: number;
    sign_off_eligible: boolean;
    ops_readiness: {
      ready: boolean;
      blockers: string[];
    };
  };
  shadow_grader: HarnessShadowGraderDiagnosticsSnapshot | null;
  cost_governance?: {
    token_quota_enabled: boolean;
    user_daily_limit: number;
    org_daily_limit: number;
    global_daily_limit: number;
    session_token_cap: number;
  } | null;
  cost_history?: {
    schemaId: 'tripnara.harness_cost_history@v1';
    version: 1;
    source: 'db' | 'partial' | 'unavailable';
    series_days: number;
    daily_buckets: Array<{
      date: string;
      total_cost_usd: number;
      total_tokens: number;
      calls: number;
    }>;
    today: {
      utc_date: string;
      global_tokens_used: number | null;
      global_tokens_limit: number;
      llm_cost_usd: number | null;
    };
    alerts: Array<{
      code: string;
      severity: 'warn' | 'critical';
      message: string;
    }>;
  } | null;
  quality_loop?: {
    schemaId: 'tripnara.harness_quality_loop@v1';
    version: 1;
    context_lint_enabled: boolean;
    context_lint_strict: boolean;
    quality_sample_rate: number;
    l1_suite_id: string;
    l1_baseline_pinned: boolean;
    l1_path_fingerprint_baseline: string | null;
    decision_closure_fixture_count: number;
    badcase_catalog_entries: number;
    last_run: {
      overall_passed: boolean;
      finished_at: string;
    } | null;
    ops_readiness: {
      ready: boolean;
      blockers: string[];
    };
  } | null;
  shadow_harness?: {
    enabled: boolean;
    shadow_after_phase: boolean;
    shadow_checks_total: number;
    non_pass_rate: number;
    consecutive_success_count: number;
    consecutive_threshold: number;
    ops_readiness: { ready: boolean; blockers: string[] };
  } | null;
  llm_routing?: {
    source: "db" | "unavailable";
    series_days: number;
    total_cost_usd: number;
    providers: Array<{
      provider: string;
      cost_usd: number;
      tokens: number;
      calls: number;
      share_pct: number;
    }>;
  } | null;
}

export async function fetchHarnessAdminDiagnostics(params: {
  apiBase: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<HarnessAdminDiagnosticsSnapshot> {
  const base = params.apiBase.replace(/\/$/, "");
  const url = `${base}/api/admin/diagnostics/harness`;
  const fetchFn = params.fetchImpl ?? fetch;
  const res = await fetchFn(url, {
    headers: {
      "x-tripnara-admin-diagnostics-token": params.token,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Harness diagnostics HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as HarnessAdminDiagnosticsSnapshot;
}

export async function registerHarnessShadowGraderAdapter(params: {
  apiBase: string;
  token: string;
  taskId: string;
  adapterPath: string;
  vllmAdapterName?: string;
  baselineProductionVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  success: boolean;
  shadow_version: string;
  lora_loaded: boolean;
  ops_readiness: HarnessShadowGraderDiagnosticsSnapshot["ops_readiness"] | null;
}> {
  const base = params.apiBase.replace(/\/$/, "");
  const url = `${base}/api/admin/diagnostics/harness/shadow-grader/register`;
  const fetchFn = params.fetchImpl ?? fetch;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "x-tripnara-admin-diagnostics-token": params.token,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      task_id: params.taskId,
      adapter_path: params.adapterPath,
      ...(params.vllmAdapterName ? { vllm_adapter_name: params.vllmAdapterName } : {}),
      ...(params.baselineProductionVersion
        ? { baseline_production_version: params.baselineProductionVersion }
        : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shadow grader register HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as {
    success: boolean;
    shadow_version: string;
    lora_loaded: boolean;
    ops_readiness: HarnessShadowGraderDiagnosticsSnapshot["ops_readiness"] | null;
  };
}

export function formatShadowHarnessStatusLine(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const sh = snap.shadow_harness;
  if (!sh) return "shadow_harness: (unavailable)";
  return [
    `enabled=${sh.enabled}`,
    `checks=${sh.shadow_checks_total}`,
    `non_pass_rate=${(sh.non_pass_rate * 100).toFixed(1)}%`,
    `consecutive=${sh.consecutive_success_count}/${sh.consecutive_threshold}`,
    `ops_ready=${sh.ops_readiness.ready}`,
    sh.ops_readiness.blockers.length ? `blockers=${sh.ops_readiness.blockers.join(",")}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatLlmRoutingStatusLine(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const lr = snap.llm_routing;
  if (!lr) return "llm_routing: (unavailable)";
  return [
    `source=${lr.source}`,
    `days=${lr.series_days}`,
    `total_cost_usd=${lr.total_cost_usd.toFixed(6)}`,
    `providers=${lr.providers.length}`,
  ].join(" ");
}

export function formatQualityLoopStatusLine(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const ql = snap.quality_loop;
  if (!ql) return "quality_loop: (unavailable)";
  const parts = [
    `lint=${ql.context_lint_enabled}/${ql.context_lint_strict}`,
    `sample_rate=${ql.quality_sample_rate}`,
    `l1_baseline=${ql.l1_baseline_pinned}`,
    `closure_fixtures=${ql.decision_closure_fixture_count}`,
    `badcases=${ql.badcase_catalog_entries}`,
    `ops_ready=${ql.ops_readiness.ready}`,
  ];
  if (ql.last_run) {
    parts.push(`last_run=${ql.last_run.overall_passed ? "pass" : "fail"}@${ql.last_run.finished_at}`);
  }
  if (ql.ops_readiness.blockers.length) {
    parts.push(`blockers=${ql.ops_readiness.blockers.join(",")}`);
  }
  return parts.join(" ");
}

export function formatKernelHardStatusLine(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const kh = snap.kernel_hard;
  if (!kh) return "kernel_hard: (unavailable)";
  const parts = [
    `enabled=${kh.enabled}`,
    `shadow_after_phase=${kh.shadow_after_phase}`,
    `shadow_strict=${kh.shadow_strict}`,
    `consecutive=${kh.consecutive_success_count}/${kh.consecutive_threshold}`,
    `sign_off_eligible=${kh.sign_off_eligible}`,
    `ops_ready=${kh.ops_readiness.ready}`,
  ];
  if (kh.ops_readiness.blockers.length) {
    parts.push(`blockers=${kh.ops_readiness.blockers.join(",")}`);
  }
  return parts.join(" ");
}

export function formatShadowGraderStatusLine(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const sg = snap.shadow_grader;
  if (!sg) return "shadow_grader: (not available — TrainingModule / grader not wired)";
  const parts = [
    `enabled=${sg.enabled}`,
    `trajectory=${sg.trajectory_capture_enabled}`,
    `active=${sg.active_shadow_version ?? "none"}`,
    `in_flight=${sg.in_flight_count}`,
    `ops_ready=${sg.ops_readiness?.ready ?? "?"}`,
  ];
  if (sg.aggregate) {
    parts.push(`samples=${sg.aggregate.sampleCount}`);
    parts.push(`win_rate=${(sg.aggregate.shadowWinRate * 100).toFixed(1)}%`);
    parts.push(`promotion_ready=${sg.aggregate.promotionReady}`);
    if (sg.aggregate.promotionBlockers.length) {
      parts.push(`blockers=${sg.aggregate.promotionBlockers.join(",")}`);
    }
  } else {
    parts.push("aggregate=(no samples)");
  }
  return parts.join(" ");
}

export function formatCostGovernanceStatusLine(
  cg: NonNullable<HarnessAdminDiagnosticsSnapshot["cost_governance"]>,
): string {
  return [
    `enabled=${cg.token_quota_enabled}`,
    `user_daily=${cg.user_daily_limit || "off"}`,
    `org_daily=${cg.org_daily_limit || "off"}`,
    `global_daily=${cg.global_daily_limit || "off"}`,
    `session_cap=${cg.session_token_cap || "off"}`,
  ].join(" ");
}

export function formatHarnessDiagnosticsSummary(
  snap: HarnessAdminDiagnosticsSnapshot,
): string {
  const lines = [
    `harness shadow_checks_total=${snap.shadow_checks_total}`,
    `harness consecutive_success=${snap.consecutive_success_count}`,
    `kernel_hard ${formatKernelHardStatusLine(snap)}`,
    `shadow_grader ${formatShadowGraderStatusLine(snap)}`,
  ];
  if (snap.cost_governance) {
    lines.push(`cost_governance ${formatCostGovernanceStatusLine(snap.cost_governance)}`);
  }
  if (snap.cost_history) {
    lines.push(
      `cost_history source=${snap.cost_history.source} buckets=${snap.cost_history.daily_buckets.length} alerts=${snap.cost_history.alerts.length}`,
    );
  }
  if (snap.quality_loop) {
    lines.push(`quality_loop ${formatQualityLoopStatusLine(snap)}`);
  }
  if (snap.shadow_harness) {
    lines.push(`shadow_harness ${formatShadowHarnessStatusLine(snap)}`);
  }
  if (snap.llm_routing) {
    lines.push(`llm_routing ${formatLlmRoutingStatusLine(snap)}`);
  }
  const stages = Object.entries(snap.by_stage_status ?? {});
  if (stages.length) {
    lines.push("by_stage_status:");
    for (const [k, v] of stages.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines.join("\n");
}
