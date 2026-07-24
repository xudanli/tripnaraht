/**
 * Harness on-failure trace → badcase catalog（CLI / cron SSOT）。
 */

import fs from "node:fs";
import path from "node:path";
import { listHarnessTraceFiles, resolveHarnessTraceAbsolutePath } from "./harness-observability.util";

export const HARNESS_BADCASE_CATALOG_SCHEMA = "tripnara.harness_badcase_catalog@v1" as const;

export interface HarnessBadcaseCatalogEntryV1 {
  schemaId: "tripnara.harness_badcase@v1";
  version: 1;
  id: string;
  collected_at: string;
  trace_export_path: string;
  trace_file: string;
  harness_active_trace_id?: string;
  otel_trace_id?: string;
  request_id?: string;
  failed_phase?: string;
  final_status?: string;
  violation_codes: string[];
  file_mtime_ms: number;
  file_size_bytes: number;
}

export interface HarnessBadcaseCatalogV1 {
  schemaId: typeof HARNESS_BADCASE_CATALOG_SCHEMA;
  version: 1;
  updated_at: string;
  export_dir: string;
  entries: HarnessBadcaseCatalogEntryV1[];
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function stableId(traceExportPath: string, traceId?: string): string {
  const base = traceId?.trim() || path.basename(traceExportPath, ".json");
  return base.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 128);
}

/** Parse exported trace JSON `{ exportedAt, trace }` or bare trace object. */
export function extractBadcaseEntryFromTraceFile(params: {
  traceFile: string;
  traceExportPath: string;
  collectedAt?: string;
}): HarnessBadcaseCatalogEntryV1 {
  const abs = path.isAbsolute(params.traceFile)
    ? params.traceFile
    : resolveHarnessTraceAbsolutePath(params.traceFile);
  const stat = fs.statSync(abs);
  const root = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown;
  const rootRec = asRecord(root);
  const trace = asRecord(rootRec?.trace) ?? rootRec;
  const meta = asRecord(trace?.meta);
  const retrofit = asRecord(trace?.onFailureRetrofit);
  const steps = Array.isArray(trace?.steps) ? trace.steps : [];

  const violationCodes = new Set<string>();
  for (const step of steps) {
    const s = asRecord(step);
    const validationResults = Array.isArray(s?.validationResults) ? s.validationResults : [];
    for (const vr of validationResults) {
      const r = asRecord(vr);
      if (r?.passed === false && typeof r.code === "string") violationCodes.add(r.code);
    }
    const failureEvents = Array.isArray(s?.failureEvents) ? s.failureEvents : [];
    for (const fe of failureEvents) {
      const e = asRecord(fe);
      if (typeof e?.code === "string") violationCodes.add(e.code);
    }
  }

  const traceId =
    typeof trace?.traceId === "string"
      ? trace.traceId
      : typeof trace?.id === "string"
        ? trace.id
        : undefined;

  return {
    schemaId: "tripnara.harness_badcase@v1",
    version: 1,
    id: stableId(params.traceExportPath, traceId),
    collected_at: params.collectedAt ?? new Date().toISOString(),
    trace_export_path: params.traceExportPath,
    trace_file: abs,
    harness_active_trace_id: traceId,
    otel_trace_id: typeof meta?.otelTraceId === "string" ? meta.otelTraceId : undefined,
    request_id:
      typeof trace?.requestId === "string"
        ? trace.requestId
        : typeof meta?.requestId === "string"
          ? meta.requestId
          : undefined,
    failed_phase:
      typeof retrofit?.failedPhase === "string"
        ? retrofit.failedPhase
        : typeof trace?.failedPhase === "string"
          ? trace.failedPhase
          : undefined,
    final_status: typeof trace?.finalStatus === "string" ? trace.finalStatus : undefined,
    violation_codes: [...violationCodes].sort(),
    file_mtime_ms: stat.mtimeMs,
    file_size_bytes: stat.size,
  };
}

export function defaultBadcaseCatalogPath(cwd = process.cwd()): string {
  const dir =
    process.env.HARNESS_BADCASE_CATALOG_DIR?.trim() ||
    path.join("artifacts", "harness-badcases");
  return path.isAbsolute(dir) ? path.join(dir, "catalog.json") : path.join(cwd, dir, "catalog.json");
}

export function loadBadcaseCatalog(catalogPath: string): HarnessBadcaseCatalogV1 | null {
  if (!fs.existsSync(catalogPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as HarnessBadcaseCatalogV1;
  if (parsed?.schemaId !== HARNESS_BADCASE_CATALOG_SCHEMA || !Array.isArray(parsed.entries)) {
    return null;
  }
  return parsed;
}

export function saveBadcaseCatalog(catalogPath: string, catalog: HarnessBadcaseCatalogV1): void {
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export function collectHarnessBadcaseCatalog(params: {
  exportDir?: string;
  catalogPath?: string;
  limit?: number;
  cwd?: string;
}): { added: number; updated: number; total: number; catalogPath: string } {
  const cwd = params.cwd ?? process.cwd();
  const exportDirRaw =
    params.exportDir?.trim() ||
    process.env.HARNESS_TRACE_EXPORT_DIR?.trim() ||
    "artifacts/harness-on-failure";
  const exportDir = path.isAbsolute(exportDirRaw)
    ? exportDirRaw
    : path.join(cwd, exportDirRaw);
  const catalogPath = params.catalogPath ?? defaultBadcaseCatalogPath(cwd);
  const limit = params.limit ?? 500;

  const files = listHarnessTraceFiles(exportDir, limit);
  const existing = loadBadcaseCatalog(catalogPath);
  const byId = new Map<string, HarnessBadcaseCatalogEntryV1>();
  for (const e of existing?.entries ?? []) {
    byId.set(e.id, e);
  }

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const absFile of files) {
    const relExport =
      path.relative(cwd, absFile).split(path.sep).join("/") || absFile;
    try {
      const entry = extractBadcaseEntryFromTraceFile({
        traceFile: absFile,
        traceExportPath: relExport,
        collectedAt: now,
      });
      const prev = byId.get(entry.id);
      if (!prev) {
        added += 1;
      } else if (prev.file_mtime_ms !== entry.file_mtime_ms) {
        updated += 1;
      }
      byId.set(entry.id, entry);
    } catch {
      // skip unreadable trace files
    }
  }

  const catalog: HarnessBadcaseCatalogV1 = {
    schemaId: HARNESS_BADCASE_CATALOG_SCHEMA,
    version: 1,
    updated_at: now,
    export_dir: exportDir,
    entries: [...byId.values()].sort((a, b) => b.file_mtime_ms - a.file_mtime_ms),
  };
  saveBadcaseCatalog(catalogPath, catalog);

  return { added, updated, total: catalog.entries.length, catalogPath };
}

export function searchBadcaseEntries(
  catalog: HarnessBadcaseCatalogV1,
  query: string,
): HarnessBadcaseCatalogEntryV1[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.entries;
  return catalog.entries.filter((e) => {
    const hay = [
      e.id,
      e.request_id,
      e.harness_active_trace_id,
      e.otel_trace_id,
      e.failed_phase,
      e.final_status,
      e.trace_export_path,
      ...e.violation_codes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function formatBadcaseEntryLine(e: HarnessBadcaseCatalogEntryV1): string {
  const parts = [
    e.failed_phase ? `phase=${e.failed_phase}` : undefined,
    e.final_status ? `status=${e.final_status}` : undefined,
    e.request_id ? `request=${e.request_id}` : undefined,
    e.otel_trace_id ? `otel=${e.otel_trace_id}` : undefined,
    e.violation_codes.length ? `codes=${e.violation_codes.slice(0, 4).join(",")}` : undefined,
    `path=${e.trace_export_path}`,
  ].filter(Boolean);
  return `${e.id}  ${parts.join("  ")}`;
}
