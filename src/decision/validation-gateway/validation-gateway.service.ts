import { Injectable, Logger, Optional } from '@nestjs/common';
import type { VerificationIssue } from '../kernel/decision-state.types';
import { DecisionOsSloService } from '../slo/decision-os-slo.service';
import type {
  ValidationGatewayRunInput,
  ValidationGatewayRunResult,
  ValidationStageRunner,
} from './validation-gateway.types';
import type {
  ValidationGatewayStageId,
  ValidationRunMetric,
  ValidationStageMetric,
} from '../slo/decision-os-slo.types';

/**
 * VERIFY 单一门禁：编排各验证阶段、产出可审计 envelope、写入 SLO。
 *
 * Sprint 1：由 VerifyExecutor 调用 `runStages`；后续 Sprint 2 将 KPU / PhysicalValidator 注册为 stage。
 */
@Injectable()
export class ValidationGatewayService {
  private readonly logger = new Logger(ValidationGatewayService.name);

  constructor(@Optional() private readonly slo?: DecisionOsSloService) {}

  /**
   * 顺序执行各 stage runner，聚合 issues 并记录 SLO。
   */
  async runStages(
    input: ValidationGatewayRunInput,
    stages: Array<{ stageId: ValidationGatewayStageId; run: ValidationStageRunner }>,
  ): Promise<ValidationGatewayRunResult> {
    const started = Date.now();
    let issues: VerificationIssue[] = [];
    let confidenceDelta = 0;
    const stageMetrics: ValidationStageMetric[] = [];

    for (const { stageId, run } of stages) {
      const t0 = Date.now();
      const before = issues.length;
      try {
        const out = await run({ dso: input.dso, ctx: input.ctx, issues, confidenceDelta });
        issues = out.issues;
        confidenceDelta = out.confidenceDelta;
        stageMetrics.push(
          DecisionOsSloService.buildStageMetric({
            stageId,
            durationMs: Date.now() - t0,
            issuesBefore: before,
            issuesAfter: issues.length,
            issues,
            skipped: out.skipped,
            error: out.error,
          }),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[ValidationGateway] stage ${stageId} failed: ${msg}`);
        stageMetrics.push(
          DecisionOsSloService.buildStageMetric({
            stageId,
            durationMs: Date.now() - t0,
            issuesBefore: before,
            issuesAfter: issues.length,
            issues,
            error: msg,
          }),
        );
      }
    }

    const hasFatal = issues.some((i) => i.class === 'FATAL');
    const hasConflict = issues.some((i) => i.class === 'CONFLICT');
    const passed = !hasFatal && !hasConflict;
    const durationMs = Date.now() - started;

    const metric: ValidationRunMetric = {
      requestId: input.ctx.requestId,
      tripId: input.ctx.tripPlanRequest?.trip_id ?? null,
      runAt: new Date().toISOString(),
      durationMs,
      stages: stageMetrics,
      totalIssues: issues.length,
      hasFatal,
      hasConflict,
      confidenceDelta,
      passed,
      outcome: DecisionOsSloService.deriveValidationOutcome(hasFatal, hasConflict),
    };

    if (input.recordSlo !== false && this.slo) {
      this.slo.recordValidation(metric);
    }

    this.logger.debug(
      `[ValidationGateway] run requestId=${input.ctx.requestId} passed=${passed} stages=${stageMetrics.length} issues=${issues.length}`,
    );

    return {
      issues,
      confidenceDelta,
      passed,
      hasFatal,
      hasConflict,
      stages: stageMetrics,
      durationMs,
      metric,
    };
  }
}
