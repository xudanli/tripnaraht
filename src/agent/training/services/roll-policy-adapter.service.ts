// src/agent/training/services/roll-policy-adapter.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PolicyInferenceRequest,
  PolicyInferenceResponse,
} from '../interfaces/training-platform.interface';
import { RollClientService } from './roll-client.service';

/**
 * RollPolicyAdapterService
 *
 * 职责：将 PolicyServiceManagerService 的调用适配到 ROLL Policy-Worker
 *
 * 这是一个适配器模式，允许现有代码通过 PolicyServiceManagerService 接口
 * 调用 ROLL Policy-Worker，实现渐进式迁移。
 */
@Injectable()
export class RollPolicyAdapterService {
  private readonly logger = new Logger(RollPolicyAdapterService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rollClient?: RollClientService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_POLICY_ENABLED') !== false &&
      !!this.rollClient;
    
    this.logger.log(
      `[RollPolicyAdapter] 初始化: enabled=${this.enabled}`,
    );
  }

  /**
   * 策略推理（适配 PolicyServiceManagerService.predict 接口）
   */
  async predict(
    request: PolicyInferenceRequest,
    useFallback: boolean = true,
  ): Promise<PolicyInferenceResponse> {
    if (!this.enabled) {
      throw new Error('ROLL Policy-Worker 未启用');
    }

    this.logger.debug(
      `[RollPolicyAdapter] 策略推理: requestId=${request.request_id}`,
    );

    try {
      // 转换请求格式
      const state = {
        userRequest: request.state.user_request || '',
        origin: typeof request.state.origin === 'string' 
          ? request.state.origin 
          : request.state.origin 
            ? `${(request.state.origin as any).lat},${(request.state.origin as any).lng}`
            : undefined,
        destination: typeof request.state.destination === 'string'
          ? request.state.destination
          : request.state.destination
            ? `${(request.state.destination as any).lat},${(request.state.destination as any).lng}`
            : undefined,
        constraints: request.state.constraints || {},
        preferences: request.state.preferences || {},
      };

      // 调用 ROLL Policy-Worker
      const result = await this.rollClient!.callPolicyWorker(state);

      if (!result.success) {
        throw new Error(result.error || 'Policy-Worker 调用失败');
      }

      // 转换响应格式
      const response: PolicyInferenceResponse = {
        action: result.action || 'ALLOW',
        confidence: result.confidence || 0.8,
        reasoning: result.reasoning,
        model_version: request.model_version || 'roll-v1.0',
        latency_ms: 0, // TODO: 从 Bridge Service 获取实际延迟
        metadata: {
          adjusted_params: result.adjustedParams,
          request_id: request.request_id,
        },
      };

      this.logger.debug(
        `[RollPolicyAdapter] 推理完成: requestId=${request.request_id}, action=${response.action}`,
      );

      return response;
    } catch (error: any) {
      this.logger.warn(
        `[RollPolicyAdapter] 推理失败: requestId=${request.request_id}, error=${error?.message}`,
      );

      // 如果启用回退，返回默认响应
      if (useFallback) {
        return this.getFallbackResponse(request);
      }

      throw error;
    }
  }

  /**
   * 获取回退响应
   */
  private getFallbackResponse(
    request: PolicyInferenceRequest,
  ): PolicyInferenceResponse {
    this.logger.log(
      `[RollPolicyAdapter] 使用回退响应: requestId=${request.request_id}`,
    );

    return {
      action: 'ALLOW',
      confidence: 0.5,
      reasoning: 'ROLL Policy-Worker 不可用，使用默认策略',
      model_version: request.model_version || 'fallback-v1.0',
      latency_ms: 0,
    };
  }
}
