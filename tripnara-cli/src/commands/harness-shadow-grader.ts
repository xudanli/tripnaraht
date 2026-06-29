import { Command } from "commander";
import { getConfig } from "../infra/config";
import {
  fetchHarnessAdminDiagnostics,
  formatHarnessDiagnosticsSummary,
  registerHarnessShadowGraderAdapter,
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

export function registerHarnessShadowGraderCommands(harness: Command): void {
  const shadowGrader = harness
    .command("shadow-grader")
    .description("Shadow Grader ops (status, register active shadow, list registrations)");

  shadowGrader
    .command("status")
    .description("Fetch GET /api/admin/diagnostics/harness and print shadow_grader aggregate")
    .option("--api-base <url>", "API base URL")
    .option(
      "--token <token>",
      "ADMIN_DIAGNOSTICS_TOKEN (or TRIPNARA_ADMIN_DIAGNOSTICS_TOKEN / ADMIN_DIAGNOSTICS_TOKEN env)",
    )
    .option("--json", "print raw JSON", false)
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
        } else {
          console.log(formatHarnessDiagnosticsSummary(snap));
        }
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  shadowGrader
    .command("list")
    .description("List registered shadow adapters from admin diagnostics snapshot")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print registrations JSON only", false)
    .action(async (opts: { apiBase?: string; token?: string; json?: boolean }) => {
      const auth = resolveAdminAuth(opts);
      if (!auth) {
        process.exitCode = 1;
        return;
      }
      try {
        const snap = await fetchHarnessAdminDiagnostics(auth);
        const regs = snap.shadow_grader?.registrations ?? [];
        if (opts.json) {
          console.log(JSON.stringify(regs, null, 2));
          return;
        }
        if (!regs.length) {
          console.log("(no shadow registrations — use `shadow-grader register`)");
          return;
        }
        console.log("shadow_version          lifecycle      task_id              lora");
        for (const r of regs) {
          console.log(
            `${r.shadow_version.padEnd(22)}  ${r.lifecycle.padEnd(13)}  ${r.task_id.padEnd(19)}  ${r.lora_loaded ? "yes" : "no"}`,
          );
        }
      } catch (e) {
        console.error(String(e instanceof Error ? e.message : e));
        process.exitCode = 1;
      }
    });

  shadowGrader
    .command("register")
    .description("POST admin shadow-grader/register — set ACTIVE shadow adapter for online grading")
    .requiredOption("--task-id <id>", "training task id (shadow-{taskId})")
    .requiredOption("--adapter-path <path>", "LoRA adapter path (host or vLLM mount path)")
    .option("--vllm-adapter-name <name>", "vLLM LoRA adapter name override")
    .option("--baseline-version <version>", "baseline production planner version")
    .option("--api-base <url>", "API base URL")
    .option("--token <token>", "ADMIN_DIAGNOSTICS_TOKEN")
    .option("--json", "print raw JSON response", false)
    .action(
      async (opts: {
        taskId: string;
        adapterPath: string;
        vllmAdapterName?: string;
        baselineVersion?: string;
        apiBase?: string;
        token?: string;
        json?: boolean;
      }) => {
        const auth = resolveAdminAuth(opts);
        if (!auth) {
          process.exitCode = 1;
          return;
        }
        try {
          const result = await registerHarnessShadowGraderAdapter({
            ...auth,
            taskId: opts.taskId,
            adapterPath: opts.adapterPath,
            vllmAdapterName: opts.vllmAdapterName,
            baselineProductionVersion: opts.baselineVersion,
          });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(
            `registered shadow_version=${result.shadow_version} lora_loaded=${result.lora_loaded}`,
          );
          if (result.ops_readiness) {
            console.log(
              `ops_readiness ready=${result.ops_readiness.ready} blockers=${result.ops_readiness.blockers.join(",") || "none"}`,
            );
          }
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exitCode = 1;
        }
      },
    );
}
