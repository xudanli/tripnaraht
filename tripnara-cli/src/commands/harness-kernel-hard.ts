import { Command } from "commander";
import { getConfig } from "../infra/config";
import {
  fetchHarnessAdminDiagnostics,
  formatHarnessDiagnosticsSummary,
  formatKernelHardStatusLine,
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
    console.error(
      "Requires --token or TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN / ADMIN_DIAGNOSTICS_TOKEN",
    );
    return null;
  }
  return { apiBase, token: token.trim() };
}

export function registerHarnessKernelHardCommands(harness: Command): void {
  const kernelHard = harness
    .command("kernel-hard")
    .description("Kernel hard gate ops (shadow metrics + sign-off readiness)");

  kernelHard
    .command("status")
    .description("Fetch admin diagnostics kernel_hard snapshot")
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
          console.log(JSON.stringify(snap, null, 2));
          return;
        }
        console.log(formatKernelHardStatusLine(snap));
        console.log("");
        console.log(formatHarnessDiagnosticsSummary(snap));
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });
}
