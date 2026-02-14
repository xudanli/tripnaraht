// src/agent/controllers/gate.controller.ts

/**
 * Gate Controller
 *
 * 演示如何集成 Zod 校验 Pipe 到 NestJS Controller
 *
 * 安全加固：
 * - 使用 ZodValidationPipe 校验入参
 * - Agent 输出自动校验
 * - 错误响应标准化
 */

import { Controller, Post, Body, Logger, InternalServerErrorException } from '@nestjs/common';
import { TripPlanRequestSchema, validateGateResult } from '../validation/trip-plan.schema';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { TripPlanRequest, GateResult } from '../interfaces/trip-plan.interface';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';

@Controller('gate')
export class GateController {
  private readonly logger = new Logger(GateController.name);

  constructor(private readonly gatekeeperAgent: ClaudeGatekeeperAgentService) {}

  /**
   * POST /gate/evaluate
   *
   * 评估行程计划是否应该存在（Should-Exist Gate）
   *
   * 安全加固：
   * - 使用 ZodValidationPipe 在入口校验请求
   * - 校验 Agent 输出符合 GateResult 合同
   * - 所有错误都被捕获并标准化
   *
   * @param request TripPlanRequest (已通过 zod 校验)
   * @returns GateResult
   */
  @Post('evaluate')
  async evaluateGate(
    @Body(new ZodValidationPipe(TripPlanRequestSchema)) request: TripPlanRequest
  ): Promise<GateResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`[${request.request_id}] Evaluating gate for trip: ${JSON.stringify(request, null, 2)}`);

      // 调用 Agent
      const result = await this.gatekeeperAgent.evaluateGate(request, {}, {
        request_id: request.request_id,
        current_step: 'GATE_EVAL',
      } as any);

      // 校验 Agent 输出
      const validation = validateGateResult(result);
      if (!validation.success) {
        this.logger.error(
          `[${request.request_id}] Invalid GateResult from agent`,
          validation.error.errors
        );
        throw new InternalServerErrorException(
          'Agent produced invalid output: ' + validation.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ')
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[${request.request_id}] Gate evaluation completed in ${duration}ms. Result: ${result.gate_result}`
      );

      return validation.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[${request.request_id}] Gate evaluation failed after ${duration}ms`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }

  /**
   * POST /gate/batch-evaluate
   *
   * 批量评估多个行程计划
   *
   * 安全加固：
   * - 对数组中的每个请求进行校验
   * - 返回成功和失败的结果
   *
   * @param requests TripPlanRequest[] (已通过 zod 校验)
   * @returns { results: GateResult[], errors: Error[] }
   */
  @Post('batch-evaluate')
  async batchEvaluateGate(
    @Body(new ZodValidationPipe(TripPlanRequestSchema.array())) requests: TripPlanRequest[]
  ): Promise<{
    results: GateResult[];
    errors: Array<{ request_id: string; error: string }>;
  }> {
    this.logger.log(`Batch evaluating ${requests.length} gate requests`);

    const results: GateResult[] = [];
    const errors: Array<{ request_id: string; error: string }> = [];

    // 并行处理所有请求（使用 Promise.all）
    const promises = requests.map(async (request) => {
      try {
        const result = await this.evaluateGate(request);
        results.push(result);
      } catch (error) {
        errors.push({
          request_id: request.request_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(promises);

    return { results, errors };
  }

  /**
   * POST /gate/dry-run
   *
   * 干运行：校验请求但不执行实际的 Gate 评估
   *
   * 用途：
   * - 测试请求格式是否正确
   * - 返回校验错误而不执行计算
   *
   * @param request TripPlanRequest
   * @returns { valid: true, request: TripPlanRequest }
   */
  @Post('dry-run')
  dryRunValidation(
    @Body(new ZodValidationPipe(TripPlanRequestSchema)) request: TripPlanRequest
  ): { valid: true; request: TripPlanRequest } {
    this.logger.log(`Dry run validation passed for request: ${request.request_id}`);
    return { valid: true, request };
  }
}
