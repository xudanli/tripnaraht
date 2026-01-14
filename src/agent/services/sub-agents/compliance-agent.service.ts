// src/agent/services/sub-agents/compliance-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ComplianceAgent } from '../../interfaces/sub-agent.interface';
import { Itinerary, GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { CompliancePluginService } from '../../../route-directions/plugins/compliance-plugin.service';
import { ComplianceFactsAgent } from '../../../rag/services/compliance-facts-agent.service';
import { IcelandComprehensiveService } from '../../../data-contracts/services/iceland-comprehensive.service';

/**
 * Compliance Agent Service (Claude Orchestration)
 * 
 * 职责：风险提示/免责声明/用户确认留痕要求
 */
@Injectable()
export class ClaudeComplianceAgentService implements ComplianceAgent {
  private readonly logger = new Logger(ClaudeComplianceAgentService.name);

  constructor(
    @Optional() private readonly compliancePlugin?: CompliancePluginService,
    @Optional() private readonly complianceFactsAgent?: ComplianceFactsAgent,
    @Optional() private readonly icelandComprehensive?: IcelandComprehensiveService,
  ) {
    this.logger.log(`[ClaudeComplianceAgent] 已初始化`);
    this.logger.log(`[ClaudeComplianceAgent] CompliancePlugin: ${!!this.compliancePlugin}, ComplianceFactsAgent: ${!!this.complianceFactsAgent}, IcelandComprehensive: ${!!this.icelandComprehensive}`);
  }

  /**
   * 检查合规性并生成风险提示
   */
  async checkCompliance(
    itinerary: Itinerary,
    gateResult: GateResult,
    context: OrchestratorState,
  ): Promise<{
    risk_warnings: Array<{
      level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
      message: string;
      requires_user_confirmation: boolean;
    }>;
    disclaimers: string[];
    required_confirmations: string[];
  }> {
    this.logger.debug(`[ClaudeComplianceAgent] 检查合规性: request_id=${context.request_id}`);

    try {
      const risk_warnings: Array<{
        level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
        message: string;
        requires_user_confirmation: boolean;
      }> = [];
      const disclaimers: string[] = [];
      const required_confirmations: string[] = [];

      // 1. 从 GateResult 提取风险信息
      if (gateResult.violations) {
        for (const violation of gateResult.violations) {
          if (violation.type === 'SAFETY' && violation.severity === 'HARD') {
            risk_warnings.push({
              level: 'CRITICAL',
              category: 'SAFETY',
              message: violation.detail,
              requires_user_confirmation: true,
            });
          } else if (violation.type === 'SAFETY' && violation.severity === 'SOFT') {
            risk_warnings.push({
              level: 'HIGH',
              category: 'SAFETY',
              message: violation.detail,
              requires_user_confirmation: true,
            });
          }
        }
      }

      // 2. 如果有综合安全评估服务（冰岛特定），调用它
      if (this.icelandComprehensive && itinerary.days.length > 0) {
        // TODO: 从 itinerary 提取坐标，调用综合安全评估
        // const firstDay = itinerary.days[0];
        // if (firstDay.items.length > 0 && firstDay.items[0].location_ref.coordinates) {
        //   const coords = firstDay.items[0].location_ref.coordinates;
        //   const safetyAssessment = await this.icelandComprehensive.getComprehensiveSafetyAssessment(
        //     coords.lat, coords.lng
        //   );
        //   // 处理安全评估结果
        // }
      }

      // 3. 生成免责声明
      if (gateResult.gate_result === 'ADJUST_REQUIRED' || gateResult.gate_result === 'NEED_USER_CONFIRM') {
        disclaimers.push('部分行程信息可能未完全核验，实际交通班次、票价、开放时间请以官方信息为准。建议用户在出行前再次确认。');
      }

      if (risk_warnings.some(w => w.level === 'CRITICAL' || w.level === 'HIGH')) {
        disclaimers.push('本行程涉及户外活动，可能存在以下风险：天气变化、地形复杂、意外伤害等。用户需自行评估自身能力，并承担相应风险。TripNARA不对因使用本行程而产生的任何损失承担责任。');
        required_confirmations.push('我已了解并接受行程中的风险');
      }

      // 4. 如果有合规插件，调用它生成合规检查清单
      if (this.compliancePlugin) {
        // TODO: 将 itinerary 转换为 RouteDirection 格式，调用合规插件
        // const complianceChecklist = await this.compliancePlugin.generateChecklist(...);
      }

      return {
        risk_warnings,
        disclaimers,
        required_confirmations,
      };
    } catch (error: any) {
      this.logger.error(`[ClaudeComplianceAgent] 合规检查失败: ${error?.message}`, error?.stack);
      
      // 降级：返回基本风险警告
      return {
        risk_warnings: [{
          level: 'MEDIUM',
          category: 'SAFETY',
          message: '合规检查服务不可用，请谨慎使用行程信息',
          requires_user_confirmation: false,
        }],
        disclaimers: ['部分信息可能未完全核验，请以官方信息为准'],
        required_confirmations: [],
      };
    }
  }
}
