import { Injectable, Logger } from '@nestjs/common';
import type {
  HarnessTrace,
  HarnessTraceCorrelationMeta,
  HarnessTraceFinalStatus,
  HarnessTraceStep,
} from './harness-trace.types';

@Injectable()
export class HarnessTraceRecorderService {
  private readonly logger = new Logger(HarnessTraceRecorderService.name);
  private readonly traces = new Map<string, HarnessTrace>();

  /**
   * 在插入新 trace 前按 FIFO 淘汰最旧条目，防止 `HARNESS_RECORD_TRACE=1` 长进程内存膨胀。
   * `HARNESS_TRACE_MAX_ENTRIES`：正整数为上限；未设或 ≤0 表示不限制。
   */
  private evictTracesIfOverLimitBeforeInsert(): void {
    const raw = process.env.HARNESS_TRACE_MAX_ENTRIES?.trim();
    const max = raw == null || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(max) || max < 1) return;
    while (this.traces.size >= max) {
      const oldest = this.traces.keys().next().value;
      if (oldest === undefined) break;
      this.traces.delete(oldest);
    }
  }

  ensureTrace(traceId: string, requestId: string, meta?: HarnessTraceCorrelationMeta): HarnessTrace {
    let t = this.traces.get(traceId);
    if (!t) {
      this.evictTracesIfOverLimitBeforeInsert();
      const mergedMeta =
        meta?.evaluationRunId && String(meta.evaluationRunId).trim()
          ? { evaluationRunId: String(meta.evaluationRunId).trim() }
          : undefined;
      t = {
        traceId,
        requestId,
        startedAt: new Date().toISOString(),
        finalStatus: 'DONE',
        steps: [],
        ...(mergedMeta ? { meta: mergedMeta } : {}),
      };
      this.traces.set(traceId, t);
    } else if (meta?.evaluationRunId && String(meta.evaluationRunId).trim() && !t.meta?.evaluationRunId) {
      t.meta = { ...t.meta, evaluationRunId: String(meta.evaluationRunId).trim() };
    }
    return t;
  }

  appendStep(traceId: string, step: HarnessTraceStep): void {
    const t = this.traces.get(traceId);
    if (!t) return;
    if (t.endedAt != null) {
      this.logger.warn(
        `[HarnessTraceRecorder] appendStep ignored: trace ${traceId} already finalized at ${t.endedAt} (finalStatus=${t.finalStatus}, step=${String(step.step)})`,
      );
      return;
    }
    t.steps.push(step);
  }

  finalize(traceId: string, status: HarnessTraceFinalStatus): void {
    const t = this.traces.get(traceId);
    if (!t) return;
    t.finalStatus = status;
    t.endedAt = new Date().toISOString();
  }

  /**
   * 编排成功/业务终态收口：仅当 trace 尚未写入 `endedAt` 时闭合（harness 失败路径已 `finalize` 的不覆盖）。
   */
  finalizeIfStillOpen(traceId: string, status: HarnessTraceFinalStatus): void {
    const t = this.traces.get(traceId);
    if (!t || t.endedAt != null) return;
    t.finalStatus = status;
    t.endedAt = new Date().toISOString();
  }

  getTrace(traceId: string): HarnessTrace | undefined {
    return this.traces.get(traceId);
  }

  /** 调试 / 运维：当前内存中的 traceId 列表（插入顺序）。 */
  listTraceIds(): readonly string[] {
    return [...this.traces.keys()];
  }

  /** 测试用 */
  clearTrace(traceId: string): void {
    this.traces.delete(traceId);
  }
}
