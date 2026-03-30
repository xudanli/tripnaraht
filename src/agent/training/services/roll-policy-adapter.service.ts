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
  private readonly allowFallback: boolean;
  private readonly fallbackAllowedCodes: string[];

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rollClient?: RollClientService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_POLICY_ENABLED') !== false &&
      !!this.rollClient;
    this.allowFallback = this.getEnvFlag('ROLL_ALLOW_FALLBACK', true);
    this.fallbackAllowedCodes = this.getEnvList(
      'ROLL_FALLBACK_ALLOWED_CODES',
      ['TIMEOUT', 'HTTP_5XX', 'WORKER_UNAVAILABLE'],
    );
    
    this.logger.log(
      `[RollPolicyAdapter] 初始化: enabled=${this.enabled}, allowFallback=${this.allowFallback}, codes=${this.fallbackAllowedCodes.join(',')}`,
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
      const errCode = this.extractErrorCode(error?.message);
      const fallbackAllowedByCode = this.fallbackAllowedCodes.includes(errCode);
      if (useFallback && this.allowFallback && fallbackAllowedByCode) {
        this.logger.warn(
          `[roll_event] event=policy_fallback_used request_id=${request.request_id} code=${errCode} reason="${error?.message ?? 'unknown'}"`,
        );
        return this.getFallbackResponse(request);
      }

      this.logger.error(
        `[roll_event] event=policy_fallback_blocked request_id=${request.request_id} use_fallback=${useFallback} allow_fallback=${this.allowFallback} code=${errCode} allowed_codes=${this.fallbackAllowedCodes.join(',')}`,
      );

      throw error;
    }
  }

  private getEnvFlag(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
      if (v === 'false' || v === '0' || v === 'no') return false;
    }
    return fallback;
  }

  private getEnvList(key: string, fallback: string[]): string[] {
    const value = this.configService.get<string>(key);
    if (!value) return fallback;
    const out = value
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    return out.length > 0 ? out : fallback;
  }

  private extractErrorCode(message?: string): string {
    if (!message) return 'UNKNOWN';
    const idx = message.indexOf(':');
    if (idx <= 0) return 'UNKNOWN';
    return message.slice(0, idx).trim().toUpperCase();
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
