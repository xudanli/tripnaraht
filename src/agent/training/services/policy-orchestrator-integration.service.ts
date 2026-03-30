// src/agent/training/services/policy-orchestrator-integration.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PolicyServiceManagerService } from './policy-service-manager.service';
import { PolicyInferenceResponse } from '../interfaces/training-platform.interface';
import { GateResult } from '../../interfaces/trip-plan.interface';

/**
 * PolicyOrchestratorIntegrationService
 * 
 * 职责：将Policy decision → action → execution接入Orchestrator
 * 
 * 功能：
 * 1. integratePolicyDecision() - 在编排器中集成Policy决策
 * 2. convertToAction() - 将Policy决策转换为Orchestrator action
 * 3. 支持A/B测试（experiment_id、流量分配）
 */
@Injectable()
export class PolicyOrchestratorIntegrationService {
  private readonly logger = new Logger(PolicyOrchestratorIntegrationService.name);

  constructor(private readonly policyService: PolicyServiceManagerService) {}

  /**
   * 在GATE_EVAL步骤集成Policy决策
   */
  async integrateGatePolicyDecision(
    request: {
      request_id: string;
      state: any;
      experiment_id?: string;
      model_version?: string;
    },
  ): Promise<GateResult> {
    this.logger.debug(
      `[PolicyIntegration] GATE_EVAL Policy决策: requestId=${request.request_id}`,
    );

    try {
      // 调用PolicyService
      const policyResponse = await this.policyService.predict({
        request_id: request.request_id,
        state: request.state,
        model_version: request.model_version,
        experiment_id: request.experiment_id,
      });

      // 将Policy决策转换为GateResult
      const gateResult = this.convertPolicyToGateResult(policyResponse);

      this.logger.debug(
        `[PolicyIntegration] GATE_EVAL Policy决策完成: action=${policyResponse.action}`,
      );

      return gateResult;
    } catch (error: any) {
      this.logger.warn(
        `[PolicyIntegration] GATE_EVAL Policy决策失败: ${error?.message}`,
      );
      // 降级到默认Gate逻辑
      return this.getDefaultGateResult();
    }
  }

  /**
   * 在PLAN_GEN步骤集成Policy决策
   */
  async integratePlanGenPolicyDecision(
    request: {
      request_id: string;
      state: any;
      experiment_id?: string;
      model_version?: string;
    },
  ): Promise<{
    should_generate: boolean;
    confidence: number;
    reasoning?: string;
  }> {
    this.logger.debug(
      `[PolicyIntegration] PLAN_GEN Policy决策: requestId=${request.request_id}`,
    );

    try {
      const policyResponse = await this.policyService.predict({
        request_id: request.request_id,
        state: request.state,
        model_version: request.model_version,
        experiment_id: request.experiment_id,
      });

      return {
        should_generate: policyResponse.action === 'ALLOW' || policyResponse.action === 'ADJUST',
        confidence: policyResponse.confidence,
        reasoning: policyResponse.reasoning,
      };
    } catch (error: any) {
      this.logger.warn(
        `[PolicyIntegration] PLAN_GEN Policy决策失败: ${error?.message}`,
      );
      // 默认允许生成
      return {
        should_generate: true,
        confidence: 0.5,
      };
    }
  }

  /**
   * 在VERIFY步骤集成Policy决策
   */
  async integrateVerifyPolicyDecision(
    request: {
      request_id: string;
      state: any;
      experiment_id?: string;
      model_version?: string;
    },
  ): Promise<{
    should_verify: boolean;
    confidence: number;
    reasoning?: string;
  }> {
    this.logger.debug(
      `[PolicyIntegration] VERIFY Policy决策: requestId=${request.request_id}`,
    );

    try {
      const policyResponse = await this.policyService.predict({
        request_id: request.request_id,
        state: request.state,
        model_version: request.model_version,
        experiment_id: request.experiment_id,
      });

      return {
        should_verify: policyResponse.action !== 'REJECT',
        confidence: policyResponse.confidence,
        reasoning: policyResponse.reasoning,
      };
    } catch (error: any) {
      this.logger.warn(
        `[PolicyIntegration] VERIFY Policy决策失败: ${error?.message}`,
      );
      // 默认进行验证
      return {
        should_verify: true,
        confidence: 0.5,
      };
    }
  }

  /**
   * 将Policy决策转换为GateResult
   */
  private convertPolicyToGateResult(
    policyResponse: PolicyInferenceResponse,
  ): GateResult {
    let gateResultStatus: GateResult['gate_result'] = 'ALLOW';

    switch (policyResponse.action) {
      case 'REJECT':
        gateResultStatus = 'BLOCK';
        break;
      case 'ADJUST':
        gateResultStatus = 'ADJUST_REQUIRED';
        break;
      case 'CLARIFY':
        gateResultStatus = 'NEED_USER_CONFIRM';
        break;
      case 'ALLOW':
      default:
        gateResultStatus = 'ALLOW';
        break;
    }

    return {
      gate_result: gateResultStatus,
      violations: [],
      required_adjustments: [],
      confidence: policyResponse.confidence,
      evidence_refs: [],
    };
  }

  /**
   * 获取默认Gate结果（降级）
   */
  private getDefaultGateResult(): GateResult {
    return {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.5,
      evidence_refs: [],
    };
  }

  /**
   * 将Policy决策转换为Orchestrator action
   */
  convertToAction(policyResponse: PolicyInferenceResponse): {
    action: string;
    params: Record<string, any>;
  } {
    const actionMap: Record<string, string> = {
      ALLOW: 'proceed',
      REJECT: 'block',
      ADJUST: 'adjust',
      CLARIFY: 'clarify',
    };

    return {
      action: actionMap[policyResponse.action] || 'proceed',
      params: {
        confidence: policyResponse.confidence,
        reasoning: policyResponse.reasoning,
        model_version: policyResponse.model_version,
        metadata: policyResponse.metadata,
      },
    };
  }

  /**
   * 生成experiment_id（用于A/B测试）
   */
  generateExperimentId(requestId: string, userId?: string): string {
    // 使用一致性哈希生成experiment_id
    const hashInput = userId || requestId;
    const hash = this.simpleHash(hashInput);
    return `exp_${hash % 100}`; // 0-99的实验ID
  }

  /**
   * 简单哈希函数（用于一致性哈希）
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
