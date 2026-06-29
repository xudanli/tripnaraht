import { Command } from "commander";
import { execSync } from "node:child_process";
import path from "node:path";
import { getConfig } from "../infra/config";
import {
  fetchHarnessAdminDiagnostics,
  formatHarnessDiagnosticsSummary,
  formatQualityLoopStatusLine,
} from "../core/harness-admin-diagnostics.util";

function resolveAdminAuth(opts: { apiBase?: string; token?: string }): {
  apiBase: string;
  token: string;
} | null {
  const config = getConfig();
  const apiBase = opts.apiBase ?? config.apiBase;
  const token =
    opts.token ??
    process.env.TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN ??
    process.env.ADMIN_DIAGNOSTICS_TOKEN;
  if (!apiBase) {
    console.error("Requires --api-base or TRIPNARA_API_BASE");
    return null;
  }
  if (!token?.trim()) {
    console.error("Requires --token or ADMIN_DIAGNOSTICS_TOKEN");
    return null;
  }
  return { apiBase, token: token.trim() };
}

export function registerHarnessQualityCommands(harness: Command): void {
  const quality = harness
    .command("quality")
    .description("Online quality loop (L1 smoke + decision-closure golden)");

  quality
    .command("status")
    .description("Fetch admin diagnostics quality_loop snapshot")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print full diagnostics JSON", false)
    .action(async (opts: { apiBase?: string; token?: string; json?: boolean }) => {
      const auth = resolveAdminAuth(opts);
      if (!auth) {
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics(auth);
        if (opts.json) {
          console.log(JSON.stringify(snap.quality_loop ?? snap, null, 2));
          return;
        }
        if (!snap.quality_loop) {
          console.log("quality_loop: (unavailable — HarnessQualityLoopDiagnosticsService not wired)");
          return;
        }
        console.log(formatQualityLoopStatusLine(snap));
        console.log("");
        console.log(formatHarnessDiagnosticsSummary(snap));
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  quality
    .command("run")
    .description("Run L1 smoke + decision-closure batch locally (writes last-run.json)")
    .option("--json", "print script JSON result only", false)
    .action((opts: { json?: boolean }) => {
      const root = path.resolve(__dirname, "../../..");
      try {
        const out = execSync("bash scripts/run-harness-quality-loop.sh", {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
          env: process.env,
        });
        if (opts.json) {
          console.log(out.trim());
        } else {
          console.log(out.trim());
          console.log("(report: artifacts/harness-quality-loop/last-run.json)");
        }
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        const text = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
        console.error(text.slice(-1200));
        process.exitCode = 1;
      }
    });
}
