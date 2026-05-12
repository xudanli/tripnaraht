// src/chain-of-work/execution/execution-integration.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import {
  classifyOrchestratorFailure,
  type OrchestratorRobustnessMetadata,
} from '../../agent/utils/orchestrator-failure-taxonomy.util';
import type {
  ExecutionPlan,
  ExecutionResult,
  ExecutionRecoveryFeedback,
} from '../interfaces/chain-of-work.interface';
import {
  computeBackoffDelayMs,
  resolveExecutionRecoveryPlan,
  type ExecutionRecoveryPlan,
} from './execution-recovery-policy.util';
import {
  runRouteAndRunBackoffLoop,
  type RouteAndRunBackoffLoopArgs,
  type RouteAndRunBackoffOutcome,
} from '../../agent/utils/route-and-run-recovery.util';

/**
 * 执行集成服务（Phase B）
 *
 * - 基于 I5 `OrchestratorRobustnessMetadata` 驱动澄清 / 退避 / 安全模式分支。
 * - 后续可将真实履约调用包在 {@link executeWithI5Recovery} 中，形成 R-Loop。
 *
 * 说明：`executePlan` 仍为链路基座占位；编排直连由 Agent / route_and_run 逐步接入。
 */
@Injectable()
export class ExecutionIntegrationService {
  private readonly logger = new Logger(ExecutionIntegrationService.name);

  /**
   * 由编排或其它调用点传入 I5 分类结果，得到履约恢复计划（澄清 / 退避 / 安全模式）。
   */
  resolveRecoveryPlan(
    meta: OrchestratorRobustnessMetadata | undefined | null,
    env: NodeJS.ProcessEnv = process.env,
  ): ExecutionRecoveryPlan | null {
    return resolveExecutionRecoveryPlan(meta, env);
  }

  /**
   * 记录策略决策（LLM / ORCHESTRATION → error；其余多为 warn）。
   */
  logRecoveryPlan(plan: ExecutionRecoveryPlan | null, meta?: OrchestratorRobustnessMetadata | null): void {
    if (!plan) return;
    const payload = {
      kind: plan.kind,
      reason: plan.reason,
      failure_domain: meta?.failure_domain,
      failure_code: meta?.failure_code,
      step: meta?.orchestrator_step_at_failure,
      tags: plan.logging.tags,
    };
    if (plan.logging.level === 'error') {
      this.logger.error(`[ExecutionRecovery] ${plan.kind} ${JSON.stringify(payload)}`);
    } else {
      this.logger.warn(`[ExecutionRecovery] ${plan.kind} ${JSON.stringify(payload)}`);
    }
  }

  /**
   * 根据 I5 元数据生成可写入 {@link ExecutionResult.recovery_feedback} 的摘要。
   */
  buildRecoveryFeedback(
    meta: OrchestratorRobustnessMetadata,
    plan: ExecutionRecoveryPlan | null,
    retryAttempts?: number,
  ): ExecutionRecoveryFeedback | undefined {
    if (!plan) return undefined;
    return {
      recovery_kind: plan.kind,
      failure_domain: meta.failure_domain,
      failure_code: meta.failure_code,
      orchestrator_step_at_failure: meta.orchestrator_step_at_failure,
      ...(retryAttempts !== undefined ? { retry_attempts: retryAttempts } : {}),
      reason: plan.reason,
    };
  }

  /**
   * 包装任意异步履约调用：首次失败后按 I5 分类决定是否指数退避重试。
   *
   * - REQUEST_CLARIFICATION / SAFE_MODE：不重试，直接抛出原错误（已由日志记录）。
   * - RETRY_WITH_EXPONENTIAL_BACKOFF：最多执行 plan.backoff.maxAttempts 次尝试（含首次）。
   */
  async executeWithI5Recovery<T>(
    operation: () => Promise<T>,
    options?: {
      /** 覆盖默认：由原始异常推导 I5 */
      classifyError?: (err: unknown) => OrchestratorRobustnessMetadata;
    },
  ): Promise<T> {
    const classify = options?.classifyError ?? ((e: unknown) => classifyOrchestratorFailure(e, {}));

    try {
      return await operation();
    } catch (firstError: unknown) {
      const meta = classify(firstError);
      const plan = resolveExecutionRecoveryPlan(meta, process.env);
      this.logRecoveryPlan(plan, meta);

      if (!plan || plan.kind !== 'RETRY_WITH_EXPONENTIAL_BACKOFF' || !plan.backoff) {
        throw firstError;
      }

      const { maxAttempts } = plan.backoff;
      let lastError: unknown = firstError;

      for (let attempt = 1; attempt < maxAttempts; attempt++) {
        const delayMs = computeBackoffDelayMs(attempt - 1, plan.backoff);
        await this.sleep(delayMs);
        try {
          return await operation();
        } catch (e: unknown) {
          lastError = e;
          const m = classify(e);
          const p = resolveExecutionRecoveryPlan(m, process.env);
          this.logRecoveryPlan(p, m);
          const stillRetry = p?.kind === 'RETRY_WITH_EXPONENTIAL_BACKOFF';
          if (!stillRetry || attempt === maxAttempts - 1) {
            throw e;
          }
        }
      }
      throw lastError;
    }
  }

  /**
   * route_and_run 主编排的指数退避重试（含 RecoveryInvocationContext）。
   * 履约策略与 {@link runRouteAndRunBackoffLoop} 对齐；AgentService 仅负责组装 hooks / exec。
   */
  executeRouteAndRunRecoveryLoop<T>(
    args: RouteAndRunBackoffLoopArgs<T>,
  ): Promise<RouteAndRunBackoffOutcome<T>> {
    return runRouteAndRunBackoffLoop(args);
  }

  /**
   * 执行规划（当前仍为占位成功路径；真实编排接入时请改为 `executeWithI5Recovery` 包裹）。
   */
  async executePlan(plan: ExecutionPlan, _request: TripPlanRequest): Promise<ExecutionResult> {
    this.logger.log(`[ExecutionIntegration] 开始执行规划: execution_id=${plan.draft_id}`);

    const startTime = Date.now();
    const executionId = this.generateUuid();

    const result: ExecutionResult = {
      execution_id: executionId,
      draft_id: plan.draft_id,
      success: true,
      steps: plan.steps.map((step) => ({
        step_id: step.id,
        status: 'completed' as const,
        duration_ms: 1000,
      })),
      trace_info: {
        draft_id: plan.draft_id,
        workflow_id: plan.workflow_id,
        version: plan.version,
        steps: plan.steps.map((step) => ({
          step_id: step.id,
          step_type: step.step_type,
          status: 'completed' as const,
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          duration_ms: 1000,
        })),
        total_duration_ms: Date.now() - startTime,
        total_cost_est_usd: 0.01,
        success: true,
      },
      total_duration_ms: Date.now() - startTime,
      total_cost_est_usd: 0.01,
    };

    this.logger.log(`[ExecutionIntegration] 执行完成: duration=${result.total_duration_ms}ms`);

    return result;
  }

  private generateUuid(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
