// src/agent/training/services/rl-integration.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PolicyServiceManagerService } from './policy-service-manager.service';
import { ConstraintsEngineService } from './constraints-engine.service';
import { TrajectoryCollectionService } from './trajectory-collection.service';
import { QualityScorerService } from './quality-scorer.service';
import { ObservabilityService } from './observability.service';
import {
  PolicyInferenceRequest,
  PolicyInferenceResponse,
} from '../interfaces/training-platform.interface';

/**
 * RL Integration Service
 *
 * 职责：将RL服务集成到Orchestrator决策流程中
 *
 * 功能：
 * 1. preDecision() - 执行前检查（约束、策略）
 * 2. postDecision() - 执行后处理（轨迹收集、评分）
 * 3. getDecisionContext() - 获取RL决策上下文
 */
@Injectable()
export class RLIntegrationService {
  private readonly logger = new Logger(RLIntegrationService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly policyService?: PolicyServiceManagerService,
    @Optional() private readonly constraintsEngine?: ConstraintsEngineService,
    @Optional()
    private readonly trajectoryCollection?: TrajectoryCollectionService,
    @Optional() private readonly qualityScorer?: QualityScorerService,
    @Optional() private readonly observability?: ObservabilityService,
  ) {
    this.enabled =
      this.configService.get<boolean>('RL_INTEGRATION_ENABLED') !== false;
    this.logger.log(
      `[RLIntegration] 初始化: enabled=${this.enabled}`,
    );
  }

  /**
   * 执行前检查
   *
   * 在Orchestrator执行action之前调用，用于：
   * 1. 约束检查（安全边界）
   * 2. 策略推理（是否允许执行）
   */
  async preDecision(context: {
    requestId: string;
    tripId?: string;
    userRequest: string;
    action: string;
    params: Record<string, any>;
    state?: Record<string, any>;
  }): Promise<{
    allowed: boolean;
    action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
    confidence: number;
    reasoning?: string;
    adjustedParams?: Record<string, any>;
    warnings?: string[];
  }> {
    if (!this.enabled) {
      return { allowed: true, action: 'ALLOW', confidence: 1.0 };
    }

    this.logger.debug(
      `[RLIntegration] 执行前检查: requestId=${context.requestId}, action=${context.action}`,
    );

    const warnings: string[] = [];
    let adjustedParams = context.params;

    // 1. 约束检查
    if (this.constraintsEngine) {
      try {
        const constraintResult = await this.constraintsEngine.checkConstraints(
          context.params as any, // itinerary placeholder
          {
            country_code: context.params.countryCode || 'UNKNOWN',
            user_preferences: context.params.preferences || {},
          },
        );

        if (constraintResult.is_blocked) {
          // 硬约束违反 - 拒绝执行
          return {
            allowed: false,
            action: 'REJECT',
            confidence: 0.99,
            reasoning: `Constraint violations: ${constraintResult.violations.map((v) => v.message).join(', ')}`,
            warnings: constraintResult.warnings.map((w) => w.message),
          };
        }

        // 收集警告
        warnings.push(...constraintResult.warnings.map((w) => w.message));
      } catch (error: any) {
        this.logger.warn(
          `[RLIntegration] 约束检查失败，继续执行: ${error?.message}`,
        );
      }
    }

    // 2. 策略推理
    if (this.policyService) {
      try {
        const policyRequest: PolicyInferenceRequest = {
          request_id: context.requestId,
          state: {
            user_request: context.userRequest,
            origin: context.params.origin,
            destination: context.params.destination,
            constraints: {
              ...context.params.constraints,
              date_range: context.params.dateRange,
            },
            preferences: context.params.preferences,
          },
          experiment_id: context.params.experimentId,
        };

        const policyResponse = await this.policyService.predict(
          policyRequest,
          true, // use fallback
        );

        // 记录可观测性
        this.observability?.recordMetric(
          'policy_inference_latency',
          policyResponse.latency_ms,
          { request_id: context.requestId, action: policyResponse.action },
        );

        if (policyResponse.action === 'REJECT') {
          return {
            allowed: false,
            action: 'REJECT',
            confidence: policyResponse.confidence,
            reasoning: policyResponse.reasoning,
            warnings,
          };
        }

        if (policyResponse.action === 'CLARIFY') {
          return {
            allowed: false,
            action: 'CLARIFY',
            confidence: policyResponse.confidence,
            reasoning: policyResponse.reasoning,
            warnings,
          };
        }

        if (policyResponse.action === 'ADJUST') {
          return {
            allowed: true,
            action: 'ADJUST',
            confidence: policyResponse.confidence,
            reasoning: policyResponse.reasoning,
            adjustedParams: (policyResponse.metadata?.adjusted_params as Record<string, any>) || adjustedParams,
            warnings,
          };
        }

        // ALLOW
        return {
          allowed: true,
          action: 'ALLOW',
          confidence: policyResponse.confidence,
          reasoning: policyResponse.reasoning,
          warnings,
        };
      } catch (error: any) {
        this.logger.warn(
          `[RLIntegration] 策略推理失败，默认允许: ${error?.message}`,
        );
      }
    }

    // 默认允许
    return {
      allowed: true,
      action: 'ALLOW',
      confidence: 0.5,
      warnings,
    };
  }

  /**
   * 执行后处理
   *
   * 在Orchestrator执行action之后调用，用于：
   * 1. 收集轨迹数据
   * 2. 计算质量评分
   */
  async postDecision(context: {
    requestId: string;
    tripId?: string;
    action: string;
    params: Record<string, any>;
    result: any;
    success: boolean;
    duration_ms: number;
    state?: Record<string, any>;
  }): Promise<{
    trajectoryId?: string;
    qualityScore?: number;
  }> {
    if (!this.enabled) {
      return {};
    }

    this.logger.debug(
      `[RLIntegration] 执行后处理: requestId=${context.requestId}, action=${context.action}, success=${context.success}`,
    );

    let trajectoryId: string | undefined;
    let qualityScore: number | undefined;

    // 1. 记录步骤（轨迹收集在更高层级处理）
    // TrajectoryCollectionService 需要完整的轨迹数据，此处只记录日志
    this.logger.debug(
      `[RLIntegration] 步骤执行: requestId=${context.requestId}, action=${context.action}, success=${context.success}, duration=${context.duration_ms}ms`,
    );
    trajectoryId = context.requestId;

    // 2. 计算质量评分（仅对完成的计划）
    if (
      this.qualityScorer &&
      context.success &&
      context.result?.plan
    ) {
      try {
        const scoreResult = await this.qualityScorer.score(
          context.result.plan,
          context.params.userRequest || '',
          context.result.evidence || [],
          context.result.decisionLog || [],
        );

        qualityScore = scoreResult.score;

        // 记录可观测性
        this.observability?.recordMetric(
          'quality_score',
          qualityScore,
          { request_id: context.requestId },
        );
      } catch (error: any) {
        this.logger.warn(
          `[RLIntegration] 质量评分失败: ${error?.message}`,
        );
      }
    }

    return {
      trajectoryId,
      qualityScore,
    };
  }

  /**
   * 获取RL决策上下文
   *
   * 用于在决策时提供额外的RL相关信息
   */
  async getDecisionContext(requestId: string): Promise<{
    experimentId?: string;
    modelVersion?: string;
    abTestGroup?: string;
    featureFlags?: Record<string, boolean>;
  }> {
    // 从配置获取实验信息
    const experimentId = this.configService.get<string>(
      'RL_EXPERIMENT_ID',
    );
    const modelVersion = this.configService.get<string>(
      'RL_MODEL_VERSION',
    );

    // A/B测试分组（基于requestId的一致性哈希）
    const abTestGroup = this.getABTestGroup(requestId);

    // 功能标志
    const featureFlags = {
      use_policy_service:
        this.configService.get<boolean>('RL_USE_POLICY_SERVICE') === true,
      use_constraints_engine:
        this.configService.get<boolean>('RL_USE_CONSTRAINTS_ENGINE') !== false,
      use_quality_scorer:
        this.configService.get<boolean>('RL_USE_QUALITY_SCORER') === true,
    };

    return {
      experimentId,
      modelVersion,
      abTestGroup,
      featureFlags,
    };
  }

  /**
   * 获取A/B测试分组
   *
   * 使用一致性哈希确保同一requestId始终分到同一组
   */
  private getABTestGroup(requestId: string): string {
    // 简单的哈希分组
    let hash = 0;
    for (let i = 0; i < requestId.length; i++) {
      const char = requestId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    const groups = ['control', 'treatment_a', 'treatment_b'];
    const index = Math.abs(hash) % groups.length;

    return groups[index];
  }

  /**
   * 检查服务是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 获取服务健康状态
   */
  async getHealth(): Promise<{
    enabled: boolean;
    services: {
      policyService: boolean;
      constraintsEngine: boolean;
      trajectoryCollection: boolean;
      qualityScorer: boolean;
      observability: boolean;
    };
  }> {
    return {
      enabled: this.enabled,
      services: {
        policyService: !!this.policyService,
        constraintsEngine: !!this.constraintsEngine,
        trajectoryCollection: !!this.trajectoryCollection,
        qualityScorer: !!this.qualityScorer,
        observability: !!this.observability,
      },
    };
  }
}
