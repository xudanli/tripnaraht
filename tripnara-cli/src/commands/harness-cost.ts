import { Command } from "commander";
import { getConfig } from "../infra/config";
import {
  fetchHarnessAdminDiagnostics,
  formatHarnessDiagnosticsSummary,
} from "../core/harness-admin-diagnostics.util";

function formatCostGovernanceLine(
  cg: NonNullable<Awaited<ReturnType<typeof fetchHarnessAdminDiagnostics>>["cost_governance"]>,
): string {
  return [
    `enabled=${cg.token_quota_enabled}`,
    `user_daily=${cg.user_daily_limit || "off"}`,
    `org_daily=${cg.org_daily_limit || "off"}`,
    `global_daily=${cg.global_daily_limit || "off"}`,
    `session_cap=${cg.session_token_cap || "off"}`,
  ].join(" ");
}

function formatCostHistoryLine(
  hist: NonNullable<Awaited<ReturnType<typeof fetchHarnessAdminDiagnostics>>["cost_history"]>,
): string {
  const today = hist.today;
  const alertSummary =
    hist.alerts.length > 0
      ? hist.alerts.map((a) => `${a.severity}:${a.code}`).join(",")
      : "none";
  return [
    `source=${hist.source}`,
    `days=${hist.series_days}`,
    `buckets=${hist.daily_buckets.length}`,
    `today_tokens=${today.global_tokens_used ?? "?"}/${today.global_tokens_limit || "off"}`,
    `today_cost_usd=${today.llm_cost_usd ?? "?"}`,
    `alerts=${alertSummary}`,
  ].join(" ");
}

function printCostHistoryTable(
  hist: NonNullable<Awaited<ReturnType<typeof fetchHarnessAdminDiagnostics>>["cost_history"]>,
): void {
  if (!hist.daily_buckets.length) {
    console.log("(no daily buckets — enable LLM DB logging)");
    return;
  }
  console.log("date       cost_usd   tokens   calls");
  for (const b of hist.daily_buckets) {
    console.log(
      `${b.date}  ${b.total_cost_usd.toFixed(6).padStart(9)}  ${String(b.total_tokens).padStart(7)}  ${String(b.calls).padStart(5)}`,
    );
  }
}

export function registerHarnessCostCommands(harness: Command): void {
  const cost = harness.command("cost").description("Harness cost / token quota diagnostics");

  cost
    .command("status")
    .description("Fetch admin diagnostics cost_governance limits (same auth as harness diagnostics)")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print full diagnostics JSON", false)
    .action(async (opts: { apiBase?: string; token?: string; json?: boolean }) => {
      const config = getConfig();
      const apiBase = opts.apiBase ?? config.apiBase;
      const token =
        opts.token ??
        process.env.TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN ??
        process.env.ADMIN_DIAGNOSTICS_TOKEN;
      if (!apiBase || !token?.trim()) {
        console.error("Requires --api-base + --token (or env TRIPNARA_API_BASE / ADMIN_DIAGNOSTICS_TOKEN)");
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics({ apiBase, token: token.trim() });
        if (opts.json) {
          console.log(JSON.stringify(snap, null, 2));
          return;
        }
        if (!snap.cost_governance) {
          console.log("cost_governance: (unavailable — AgenticTokenQuotaService not wired)");
          return;
        }
        console.log(`cost_governance ${formatCostGovernanceLine(snap.cost_governance)}`);
        console.log("");
        console.log(formatHarnessDiagnosticsSummary(snap));
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  cost
    .command("history")
    .description("Fetch cost_history_v1 daily series + alerts from admin diagnostics")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--days <n>", "series window (server default 7)", "7")
    .option("--json", "print cost_history JSON only", false)
    .action(async (opts: { apiBase?: string; token?: string; days?: string; json?: boolean }) => {
      const config = getConfig();
      const apiBase = opts.apiBase ?? config.apiBase;
      const token =
        opts.token ??
        process.env.TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN ??
        process.env.ADMIN_DIAGNOSTICS_TOKEN;
      if (!apiBase || !token?.trim()) {
        console.error("Requires --api-base + --token (or env TRIPNARA_API_BASE / ADMIN_DIAGNOSTICS_TOKEN)");
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics({ apiBase, token: token.trim() });
        const hist = snap.cost_history;
        if (!hist) {
          console.log("cost_history: (unavailable — HarnessCostDiagnosticsService / LLM DB not wired)");
          return;
        }
        if (opts.json) {
          console.log(JSON.stringify(hist, null, 2));
          return;
        }
        console.log(`cost_history ${formatCostHistoryLine(hist)}`);
        console.log("");
        printCostHistoryTable(hist);
        if (hist.alerts.length) {
          console.log("");
          console.log("alerts:");
          for (const a of hist.alerts) {
            console.log(`  [${a.severity}] ${a.code}: ${a.message}`);
          }
        }
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });
}
