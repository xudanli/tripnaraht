#!/usr/bin/env npx ts-node
/**
 * route_and_run 全链路评测：把响应 observability 收束为 `traceRefs`（见 `traceRefFromRouteAndRunObservability`）。
 *
 * 服务端须同时开启（与 Harness trace 落盘一致）：
 * - `HARNESS_RECORD_TRACE=1`
 * - `HARNESS_TRACE_EXPORT_DIR=artifacts/trace`（或任意可写目录）
 *
 * 客户端环境：
 * - `TRIPNARA_API_BASE`：如 `http://127.0.0.1:3000`（无则默认该值）
 * - `TRIPNARA_API_TOKEN`：可选；`route_and_run` 当前为 `@Public()` 时可不传
 * - `EVAL_ROUTE_AND_RUN_TRACE_OUT`：报告输出路径（默认 `artifacts/route-and-run-trace-eval.json`）
 *
 * 退出码：断言失败为 1。
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { buildRunFingerprint, resolveMappingVersionFromEnv } from './lib/harness-run-fingerprint';
import {
  traceRefFromRouteAndRunObservability,
  type HarnessObservabilitySlice,
} from './lib/evaluation-harness-report-refs';

function die(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

async function main() {
  const base = (process.env.TRIPNARA_API_BASE ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const token = process.env.TRIPNARA_API_TOKEN?.trim();
  const outPath =
    process.env.EVAL_ROUTE_AND_RUN_TRACE_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'route-and-run-trace-eval.json');

  const runId = randomUUID();
  const requestId = `trace-eval-${Date.now()}`;
  const caseId = requestId;

  const url = `${base}/api/agent/route_and_run`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = {
    request_id: requestId,
    user_id: 'eval-trace-user',
    message:
      'Plan a minimal 2-day trip to Reykjavik for one traveler. Keep the answer short; focus on having a valid itinerary structure.',
    meta: { run_id: runId },
    options: {
      use_claude_orchestration: true,
      use_state_machine_orchestration: true,
      max_seconds: Math.min(120, Number(process.env.EVAL_ROUTE_AND_RUN_MAX_SECONDS ?? 120)),
      max_steps: 8,
    },
  };

  process.stderr.write(`[eval-route-and-run-trace] POST ${url} meta.run_id=${runId}\n`);

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    die(
      `[eval-route-and-run-trace] fetch failed: ${msg}\n` +
        `  Start API (e.g. npm run dev) with server env:\n` +
        `    HARNESS_RECORD_TRACE=1 HARNESS_TRACE_EXPORT_DIR=artifacts/trace`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    die(`[eval-route-and-run-trace] HTTP ${res.status}: ${text.slice(0, 2000)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    die('[eval-route-and-run-trace] response is not JSON');
  }

  const root = json as Record<string, unknown>;
  const obs = root.observability as HarnessObservabilitySlice | undefined;
  const exportPath =
    obs && typeof obs.harness_trace_export_path === 'string' ? obs.harness_trace_export_path.trim() : '';

  if (!exportPath) {
    die(
      '[eval-route-and-run-trace] missing observability.harness_trace_export_path.\n' +
        '  On the API process set:\n' +
        '    HARNESS_RECORD_TRACE=1\n' +
        '    HARNESS_TRACE_EXPORT_DIR=artifacts/trace\n' +
        '  (optional HARNESS_TRACE_EXPORT_FLAT=1 for flat filenames)\n' +
        `  observability keys present: ${obs ? Object.keys(obs).join(', ') : '(none)'}`,
    );
  }

  const traceRef = traceRefFromRouteAndRunObservability(caseId, runId, obs);
  if (!traceRef.path || !String(traceRef.path).trim()) {
    die(`[eval-route-and-run-trace] traceRefs.path empty after mapping: ${JSON.stringify(traceRef)}`);
  }

  const absArtifact = path.isAbsolute(traceRef.path) ? traceRef.path : path.join(process.cwd(), traceRef.path);
  if (!fs.existsSync(absArtifact)) {
    die(
      `[eval-route-and-run-trace] trace file missing on disk: ${absArtifact}\n` +
        `  (response path was ${traceRef.path})`,
    );
  }

  const runFingerprint = buildRunFingerprint({
    caseId,
    caseCount: 1,
    corpus: 'route-and-run:trace-eval',
    configForHash: { eval: 'route-and-run-trace', apiBase: base },
    mappingVersion: resolveMappingVersionFromEnv(),
    seed: null,
    runId,
    schemaVersions: { evaluationHarnessTraceLink: 'v1' },
  });

  const report = {
    kind: 'route-and-run-trace-eval',
    generatedAt: new Date().toISOString(),
    runFingerprint,
    traceRefs: [traceRef],
    responseSlice: {
      request_id: root.request_id,
      result_status: (root.result as Record<string, unknown> | undefined)?.['status'],
      harness_active_trace_id: obs?.harness_active_trace_id ?? null,
      harness_trace_export_path: exportPath,
      evaluation_run_id: obs?.evaluation_run_id ?? null,
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `[eval-route-and-run-trace] OK\n  trace: ${exportPath}\n  report: ${outPath}\n`,
  );
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
