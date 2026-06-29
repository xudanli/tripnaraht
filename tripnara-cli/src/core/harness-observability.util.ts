import fs from "node:fs";
import path from "node:path";

export interface HarnessTraceObservabilitySlice {
  harness_active_trace_id?: string;
  harness_trace_export_path?: string;
  evaluation_run_id?: string;
  otel_trace_id?: string;
  otel_span_id?: string;
  run_id?: string;
  request_id?: string;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Extract Harness trace pointers from route_and_run JSON (snake_case). */
export function extractHarnessTraceObservability(root: unknown): HarnessTraceObservabilitySlice {
  const r = asRecord(root);
  if (!r) return {};
  const result = asRecord(r.result);
  const payloadObj = asRecord(result?.payload);
  const obs =
    asRecord(r.observability) ??
    asRecord(result?.observability) ??
    asRecord(payloadObj?.observability);
  const meta = asRecord(r.meta);

  return {
    harness_active_trace_id:
      typeof obs?.harness_active_trace_id === "string"
        ? obs.harness_active_trace_id
        : undefined,
    harness_trace_export_path:
      typeof obs?.harness_trace_export_path === "string"
        ? obs.harness_trace_export_path
        : undefined,
    evaluation_run_id:
      typeof obs?.evaluation_run_id === "string" ? obs.evaluation_run_id : undefined,
    otel_trace_id: typeof obs?.otel_trace_id === "string" ? obs.otel_trace_id : undefined,
    otel_span_id: typeof obs?.otel_span_id === "string" ? obs.otel_span_id : undefined,
    run_id: typeof meta?.run_id === "string" ? meta.run_id : undefined,
    request_id: typeof r.request_id === "string" ? r.request_id : undefined,
  };
}

export function resolveHarnessTraceAbsolutePath(
  exportPath: string,
  cwd = process.cwd(),
): string {
  const trimmed = exportPath.trim();
  if (!trimmed) return trimmed;
  return path.isAbsolute(trimmed) ? trimmed : path.join(cwd, trimmed);
}

export function readHarnessTraceJson(exportPath: string, cwd = process.cwd()): unknown {
  const abs = resolveHarnessTraceAbsolutePath(exportPath, cwd);
  if (!fs.existsSync(abs)) {
    throw new Error(`Harness trace file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  return JSON.parse(raw) as unknown;
}

export function listHarnessTraceFiles(dir: string, limit = 15): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((ent) => {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        return fs
          .readdirSync(full)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(full, f));
      }
      return ent.isFile() && ent.name.endsWith(".json") ? [full] : [];
    });
  return entries
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((x) => x.p);
}

export function formatHarnessTraceObservabilityLine(slice: HarnessTraceObservabilitySlice): string {
  const parts = [
    slice.harness_trace_export_path
      ? `export=${slice.harness_trace_export_path}`
      : undefined,
    slice.harness_active_trace_id ? `trace_id=${slice.harness_active_trace_id}` : undefined,
    slice.otel_trace_id ? `otel_trace=${slice.otel_trace_id}` : undefined,
    slice.evaluation_run_id ? `eval_run=${slice.evaluation_run_id}` : undefined,
    slice.run_id ? `run_id=${slice.run_id}` : undefined,
    slice.request_id ? `request_id=${slice.request_id}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "(no harness trace observability)";
}
