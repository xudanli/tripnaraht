import { Command } from "commander";
import { getConfig } from "../infra/config";
import {
  fetchHarnessAdminDiagnostics,
  formatHarnessDiagnosticsSummary,
  formatLlmRoutingStatusLine,
  formatShadowHarnessStatusLine,
} from "../core/harness-admin-diagnostics.util";

function resolveAdminAuth(opts: { apiBase?: string; token?: string }) {
  const config = getConfig();
  const apiBase = opts.apiBase ?? config.apiBase;
  const token =
    opts.token ??
    process.env.TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN ??
    process.env.ADMIN_DIAGNOSTICS_TOKEN;
  if (!apiBase || !token?.trim()) return null;
  return { apiBase, token: token.trim() };
}

export function registerHarnessShadowHarnessCommands(harness: Command): void {
  const shadowHarness = harness
    .command("shadow-harness")
    .description("Post-phase shadow Harness metrics (HARNESS_SHADOW_AFTER_PHASE)");

  shadowHarness
    .command("status")
    .description("Fetch admin diagnostics shadow_harness snapshot")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print shadow_harness JSON", false)
    .action(async (opts: { apiBase?: string; token?: string; json?: boolean }) => {
      const auth = resolveAdminAuth(opts);
      if (!auth) {
        console.error("Requires --api-base + --token");
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics(auth);
        if (opts.json) {
          console.log(JSON.stringify(snap.shadow_harness ?? snap, null, 2));
          return;
        }
        console.log(formatShadowHarnessStatusLine(snap));
        console.log("");
        console.log(formatHarnessDiagnosticsSummary(snap));
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });
}

export function registerHarnessLlmRoutingCommands(harness: Command): void {
  const routing = harness.command("llm-routing").description("Multi-model cost / provider breakdown");

  routing
    .command("status")
    .description("Fetch admin diagnostics llm_routing provider share (7d)")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print llm_routing JSON", false)
    .action(async (opts: { apiBase?: string; token?: string; json?: boolean }) => {
      const auth = resolveAdminAuth(opts);
      if (!auth) {
        console.error("Requires --api-base + --token");
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics(auth);
        if (opts.json) {
          console.log(JSON.stringify(snap.llm_routing ?? snap, null, 2));
          return;
        }
        if (!snap.llm_routing) {
          console.log("llm_routing: (unavailable — LLM DB / HarnessLlmRoutingDiagnosticsService)");
          return;
        }
        console.log(formatLlmRoutingStatusLine(snap));
        console.log("");
        for (const row of snap.llm_routing.providers) {
          console.log(
            `${row.provider.padEnd(12)} cost_usd=${row.cost_usd.toFixed(6)} share=${row.share_pct.toFixed(1)}% tokens=${row.tokens} calls=${row.calls}`,
          );
        }
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });
}
