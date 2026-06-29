/**
 * 影子 Harness 指标（Kernel 单点）：内存 Counter / Gauge + 结构化日志，供 ELK / CloudWatch / 未来 Prometheus 抓取。
 *
 * 语义对齐拍板：
 * - Counter 等价：`tripnara_harness_shadow_checks_total`（按 kernel_phase + status 分桶，进程内累计）。
 * - Gauge 等价：`tripnara_harness_consecutive_success_count`（连续「影子 PASSED/REPAIRED」次数）。
 *   遇 `BLOCKED`、校验/grader 任一 **L3**、或其它非通过态时清零（较「仅 L3/BLOCK」略严，避免 L2 失败误累积）。
 *
 * 不设 DSO/DB 持久化。关闭：`HARNESS_SHADOW_METRICS_DISABLED=1`。
 * 连续成功阈值提示：`HARNESS_SHADOW_CONSECUTIVE_THRESHOLD`（默认 100），仅打日志，不自动开启硬门；硬切换用手动 `HARNESS_KERNEL_HARD=1`。
 *
 * HTTP 快照（运维 curl）：`GET /api/admin/diagnostics/harness`（见 `HarnessDiagnosticsAdminController`），
 * 需 `ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1` + `ADMIN_DIAGNOSTICS_TOKEN` + 对应 Header。
 * 响应含 `shadow_grader` 段（active shadow + aggregate win_rate / promotion_blockers）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { HarnessStepRunStatus } from '../../harness/tracing/harness-trace.types';
import type { HarnessValidationResult } from '../../harness/contracts/validation.types';
import type { HarnessGraderResult } from '../../harness/inferential/harness-inferential-grader.interface';

export interface HarnessShadowCheckSnapshot {
  shadow_checks_total: number;
  consecutive_success_count: number;
  by_stage_status: Record<string, number>;
}

@Injectable()
export class HarnessShadowMetricsCollector {
  private readonly logger = new Logger(HarnessShadowMetricsCollector.name);
  private readonly disabled = process.env.HARNESS_SHADOW_METRICS_DISABLED === '1';

  /** 进程内单调递增，等价 Prometheus counter 的本地近似 */
  private shadowChecksTotal = 0;
  /** key: `${kernel_phase}|${status}` */
  private readonly byStageStatus = new Map<string, number>();
  /** 连续「影子通过」次数（Gauge 语义） */
  private consecutiveSuccessCount = 0;

  getSnapshot(): HarnessShadowCheckSnapshot {
    return {
      shadow_checks_total: this.shadowChecksTotal,
      consecutive_success_count: this.consecutiveSuccessCount,
      by_stage_status: Object.fromEntries(this.byStageStatus.entries()),
    };
  }

  getConsecutiveSuccessCount(): number {
    return this.consecutiveSuccessCount;
  }

  /**
   * 在 `applyShadowHarnessPostPhase` 拿到 `runStep` 结果后调用一次。
   */
  recordShadowCheck(params: {
    kernel_phase: string;
    harness_step: string;
    status: HarnessStepRunStatus;
    validation_results: HarnessValidationResult[];
    grader_results?: HarnessGraderResult[];
    request_id?: string;
  }): void {
    if (this.disabled) return;

    const { kernel_phase, harness_step, status, validation_results, grader_results, request_id } = params;

    this.shadowChecksTotal += 1;
    const bucketKey = `${kernel_phase}|${status}`;
    this.byStageStatus.set(bucketKey, (this.byStageStatus.get(bucketKey) ?? 0) + 1);

    const hasL3Validation = validation_results.some((r) => !r.passed && r.severity === 'L3');
    const hasL3Grader = grader_results?.some((g) => !g.passed && g.severity === 'L3') ?? false;
    const hasL3 = hasL3Validation || hasL3Grader;
    const blockLevel = status === 'BLOCKED';

    const prevConsecutive = this.consecutiveSuccessCount;
    const passedShadow = status === 'PASSED' || status === 'REPAIRED';
    if (blockLevel || hasL3) {
      this.consecutiveSuccessCount = 0;
    } else if (passedShadow) {
      this.consecutiveSuccessCount += 1;
    } else {
      this.consecutiveSuccessCount = 0;
    }

    const violations = validation_results.filter((v) => !v.passed);
    const thresholdRaw = process.env.HARNESS_SHADOW_CONSECUTIVE_THRESHOLD?.trim();
    const threshold = Math.max(1, Number(thresholdRaw ?? '100') || 100);

    const payload = {
      tripnara_metric: 'harness_shadow_check',
      tripnara_harness_shadow_checks_total: this.shadowChecksTotal,
      tripnara_harness_consecutive_success_count: this.consecutiveSuccessCount,
      kernel_phase,
      harness_step,
      status,
      violations_count: violations.length,
      violations_codes: violations.map((v) => v.code).filter(Boolean),
      request_id: request_id ?? '',
    };

    this.logger.log(JSON.stringify(payload));

    if (this.consecutiveSuccessCount >= threshold && prevConsecutive < threshold) {
      this.logger.log(
        JSON.stringify({
          tripnara_metric: 'harness_shadow_consecutive_threshold',
          tripnara_harness_consecutive_success_count: this.consecutiveSuccessCount,
          threshold,
          hint: 'Eligible to enable hard gate via HARNESS_KERNEL_HARD=1 after operational sign-off; do not auto-enable in production without review.',
        }),
      );
    }
  }
}
