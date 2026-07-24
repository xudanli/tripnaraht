import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatHarnessDiagnosticsSummary,
  formatKernelHardStatusLine,
  formatLlmRoutingStatusLine,
  formatShadowGraderStatusLine,
  formatShadowHarnessStatusLine,
  type HarnessAdminDiagnosticsSnapshot,
} from "./harness-admin-diagnostics.util";

const sample: HarnessAdminDiagnosticsSnapshot = {
  shadow_checks_total: 12,
  consecutive_success_count: 5,
  by_stage_status: { "RESEARCH|PASSED": 10, "VERIFY|BLOCKED": 2 },
  kernel_hard: {
    enabled: false,
    shadow_after_phase: true,
    shadow_strict: false,
    consecutive_success_count: 5,
    consecutive_threshold: 100,
    sign_off_eligible: false,
    ops_readiness: {
      ready: false,
      blockers: ["consecutive_5_lt_100"],
    },
  },
  shadow_grader: {
    enabled: true,
    active_shadow_version: "shadow-task-a",
    in_flight_count: 1,
    trajectory_capture_enabled: true,
    ops_readiness: {
      ready: true,
      blockers: [],
      grader_enabled: true,
      trajectory_capture_enabled: true,
    },
    registrations: [],
    aggregate: {
      sampleCount: 42,
      shadowWinRate: 0.55,
      promotionReady: false,
      promotionBlockers: ["samples_42_lt_1000"],
      productionSafetyPassRate: 0.98,
      shadowSafetyPassRate: 0.92,
    },
  },
  shadow_harness: {
    enabled: true,
    shadow_after_phase: true,
    shadow_checks_total: 12,
    non_pass_rate: 0.1667,
    consecutive_success_count: 5,
    consecutive_threshold: 100,
    ops_readiness: { ready: true, blockers: [] },
  },
  llm_routing: {
    source: "db",
    series_days: 7,
    total_cost_usd: 1.234567,
    providers: [
      { provider: "openai", cost_usd: 0.8, tokens: 1000, calls: 10, share_pct: 64.8 },
      { provider: "anthropic", cost_usd: 0.434567, tokens: 500, calls: 5, share_pct: 35.2 },
    ],
  },
};

test("formatKernelHardStatusLine", () => {
  const line = formatKernelHardStatusLine(sample);
  assert.match(line, /sign_off_eligible=false/);
  assert.match(line, /consecutive=5\/100/);
});

test("formatShadowGraderStatusLine", () => {
  const line = formatShadowGraderStatusLine(sample);
  assert.match(line, /enabled=true/);
  assert.match(line, /trajectory=true/);
  assert.match(line, /ops_ready=true/);
  assert.match(line, /win_rate=55.0%/);
  assert.match(line, /samples=42/);
});

test("formatShadowHarnessStatusLine", () => {
  const line = formatShadowHarnessStatusLine(sample);
  assert.match(line, /enabled=true/);
  assert.match(line, /checks=12/);
  assert.match(line, /non_pass_rate=16.7%/);
  assert.match(line, /ops_ready=true/);
});

test("formatLlmRoutingStatusLine", () => {
  const line = formatLlmRoutingStatusLine(sample);
  assert.match(line, /source=db/);
  assert.match(line, /days=7/);
  assert.match(line, /providers=2/);
});

test("formatHarnessDiagnosticsSummary includes harness counters", () => {
  const text = formatHarnessDiagnosticsSummary(sample);
  assert.match(text, /shadow_checks_total=12/);
  assert.match(text, /kernel_hard /);
  assert.match(text, /shadow_harness /);
  assert.match(text, /llm_routing /);
  assert.match(text, /by_stage_status/);
});
