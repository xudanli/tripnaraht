import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';

/**
 * 将已闭合的内存 Harness trace 导出为 JSON（Evaluation Harness ↔ Kernel 落盘关联）。
 *
 * **语义**：导出是增强能力；失败时只打日志并返回 `null`，**不抛错**，不阻断 `route_and_run`。
 *
 * 环境变量：
 * - **`HARNESS_TRACE_EXPORT_DIR`**：非空时，在 trace finalize 后落盘。相对路径则相对 `process.cwd()`。
 * - **默认路径**：`<dir>/<YYYY-MM-DD>/<safeTraceId>.json`（日期取 `trace.endedAt` 的 UTC 日历日，便于归档）。
 * - **`HARNESS_TRACE_EXPORT_FLAT=1`**：扁平 `<dir>/<safeTraceId>.json`（旧行为 / 最短路径）。
 *
 * Payload 保持最小：`{ exportedAt, trace }`（`trace` 为已闭合的内存 HarnessTrace）。
 */
@Injectable()
export class HarnessTraceFilesystemExportService {
  private readonly logger = new Logger(HarnessTraceFilesystemExportService.name);

  constructor(private readonly recorder: HarnessTraceRecorderService) {}

  private safeFileBase(traceId: string): string {
    const s = traceId.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return s.length ? s : 'trace';
  }

  private utcDateFolder(isoEndedAt: string): string {
    const d = isoEndedAt.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
  }

  private exportFlatLayout(): boolean {
    const v = process.env.HARNESS_TRACE_EXPORT_FLAT?.trim();
    return v === '1' || String(v).toLowerCase() === 'true';
  }

  /**
   * 将已 finalize 的 trace 落盘；返回相对 `process.cwd()` 的 POSIX 路径，失败返回 `null`。
   */
  exportClosedTraceIfConfigured(traceId: string): string | null {
    const rawDir = process.env.HARNESS_TRACE_EXPORT_DIR?.trim();
    if (!rawDir) return null;

    const trace = this.recorder.getTrace(traceId);
    if (!trace) {
      this.logger.warn(`[HarnessTraceExport] skip: no in-memory trace for traceId=${traceId}`);
      return null;
    }
    if (!trace.endedAt) {
      this.logger.warn(`[HarnessTraceExport] skip: trace not finalized yet traceId=${traceId}`);
      return null;
    }

    try {
      const absDir = path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
      const targetDir = this.exportFlatLayout()
        ? absDir
        : path.join(absDir, this.utcDateFolder(trace.endedAt));
      fs.mkdirSync(targetDir, { recursive: true });
      const file = path.join(targetDir, `${this.safeFileBase(traceId)}.json`);
      const body = {
        exportedAt: new Date().toISOString(),
        trace,
      };
      fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
      const rel = path.relative(process.cwd(), file);
      const posix = rel.split(path.sep).join('/');
      this.logger.log(`[HarnessTraceExport] wrote ${posix}`);
      return posix;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[HarnessTraceExport] failed (non-fatal) traceId=${traceId}: ${msg}`);
      return null;
    }
  }
}
