// src/trips/decision/services/three-layer-explanation.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ThreeLayerExplanation,
  EvidenceChainItem,
  UserFriendlyExplanation,
} from '../interfaces/three-layer-explanation.interface';
import { DecisionRunLog } from '../decision-log';
import { TripPlan } from '../plan-model';
import { CheckerViolation } from '../constraints';
import { ExtendedDataSourceInfo } from '../../../data-quality/interfaces/source-annotation.interface';
import { SourceAnnotationService } from '../../../data-quality/services/source-annotation.service';

/**
 * 三层解释服务
 * 
 * 生成三层解释结构：
 * - 第一层：结论（用户可理解）
 * - 第二层：原因（为什么这样）
 * - 第三层：依据（数据来源、证据链）
 */
@Injectable()
export class ThreeLayerExplanationService {
  private readonly logger = new Logger(ThreeLayerExplanationService.name);

  constructor(
    @Optional() private readonly sourceAnnotationService?: SourceAnnotationService,
  ) {}

  /**
   * 生成三层解释
   */
  generateThreeLayerExplanation(
    plan: TripPlan | null,
    log: DecisionRunLog,
    violations?: CheckerViolation[],
  ): ThreeLayerExplanation {
    this.logger.log('Generating three-layer explanation');

    // 第一层：结论
    const conclusion = this.generateConclusion(plan, log, violations);

    // 第二层：原因
    const reason = this.generateReason(plan, log, violations);

    // 第三层：依据
    const evidence = this.generateEvidence(plan, log);

    return {
      layer1_conclusion: conclusion,
      layer2_reason: reason,
      layer3_evidence: evidence,
    };
  }

  /**
   * 生成用户友好的解释
   */
  generateUserFriendlyExplanation(
    explanation: ThreeLayerExplanation,
  ): UserFriendlyExplanation {
    return {
      shortConclusion: explanation.layer1_conclusion.statement,
      detailedExplanation: explanation,
      expandable: true,
    };
  }

  // ========== 私有方法 ==========

  /**
   * 生成第一层：结论
   */
  private generateConclusion(
    plan: TripPlan | null,
    log: DecisionRunLog,
    violations?: CheckerViolation[],
  ): ThreeLayerExplanation['layer1_conclusion'] {
    // 检查是否有硬违规
    if (violations && violations.some(v => v.severity === 'error')) {
      return {
        statement: '这条路线目前不建议',
        confidence: 0.9,
      };
    }

    // 检查决策状态（通过violations判断）
    if (violations && violations.some(v => v.severity === 'error')) {
      return {
        statement: '这条路线被拒绝',
        confidence: 0.85,
      };
    }

    // 检查是否有警告
    if (violations && violations.some(v => v.severity === 'warning')) {
      return {
        statement: '这条路线可行，但需要注意一些问题',
        confidence: 0.75,
      };
    }

    // 检查计划是否生成
    if (plan && plan.days.length > 0) {
      return {
        statement: '这条路线可行',
        confidence: 0.8,
      };
    }

    // 默认情况
    return {
      statement: '路线评估中',
      confidence: 0.5,
    };
  }

  /**
   * 生成第二层：原因
   */
  private generateReason(
    plan: TripPlan | null,
    log: DecisionRunLog,
    violations?: CheckerViolation[],
  ): ThreeLayerExplanation['layer2_reason'] {
    const primaryFactors: string[] = [];
    const contributingFactors: string[] = [];

    // 从违规中提取主要因素
    if (violations) {
      violations.forEach(v => {
        if (v.severity === 'error') {
          primaryFactors.push(v.message);
        } else {
          contributingFactors.push(v.message);
        }
      });
    }

    // 从决策日志中提取原因
    if (log.explanation) {
      primaryFactors.push(log.explanation);
    }

    // 从策略组合中提取原因
    if (log.strategyMix && log.strategyMix.length > 0) {
      const strategyNames: Record<string, string> = {
        abu: '核心体验保护策略',
        drdre: '时间窗调度策略',
        neptune: '动态修复策略',
      };

      const strategies = log.strategyMix
        .map(s => strategyNames[s] || s)
        .join('、');
      contributingFactors.push(`采用策略：${strategies}`);
    }

    // 从chosenActions中提取原因
    if (log.chosenActions && log.chosenActions.length > 0) {
      log.chosenActions.forEach(action => {
        const actionDesc = this.describeAction(action);
        if (action.reasonCodes && action.reasonCodes.length > 0) {
          contributingFactors.push(`${actionDesc}：${action.reasonCodes.join('、')}`);
        } else {
          contributingFactors.push(actionDesc);
        }
      });
    }

    // 生成完整的原因说明
    let explanation = '';
    if (primaryFactors.length > 0) {
      explanation = primaryFactors.join('。');
      if (contributingFactors.length > 0) {
        explanation += '。此外，' + contributingFactors.join('；');
      }
    } else if (contributingFactors.length > 0) {
      explanation = contributingFactors.join('；');
    } else {
      explanation = '基于系统分析和评估';
    }

    return {
      primaryFactors,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : undefined,
      explanation,
    };
  }

  /**
   * 生成第三层：依据
   */
  private generateEvidence(
    plan: TripPlan | null,
    log: DecisionRunLog,
  ): ThreeLayerExplanation['layer3_evidence'] {
    // 提取数据来源
    const dataSources = this.extractDataSources(log);

    // 提取计算方法
    const calculationMethod = this.extractCalculationMethod(log);

    // 提取假设
    const assumptions = this.extractAssumptions(log);

    // 提取限制
    const limitations = this.extractLimitations(log);

    // 构建证据链
    const evidenceChain = this.buildEvidenceChain(log);

    return {
      dataSources,
      calculationMethod,
      assumptions,
      limitations,
      evidenceChain,
    };
  }

  /**
   * 提取数据来源
   */
  private extractDataSources(log: DecisionRunLog): ExtendedDataSourceInfo[] {
    const sources: ExtendedDataSourceInfo[] = [];

    // 从决策日志中提取数据来源信息
    // 简化实现：根据日志内容推断来源
    // Note: DecisionRunLog doesn't have evidenceRefs, using evidenceChain instead
    if (log.evidenceChain?.planEvidence) {
        sources.push({
          type: 'ROUTE',
          timestamp: log.at,
          reliability: 'HIGH',
          source: 'DATABASE',
          sourceName: '路线规划引擎',
          confidence: 0.8,
          verificationLevel: 'B_RELIABLE',
          isFactual: true,
        });
    }

    return sources;
  }

  /**
   * 提取计算方法
   */
  private extractCalculationMethod(log: DecisionRunLog): string | undefined {
    if (log.strategyMix && log.strategyMix.length > 0) {
      return `使用${log.strategyMix.join(' + ')}策略进行计算`;
    }
    return undefined;
  }

  /**
   * 提取假设
   */
  private extractAssumptions(log: DecisionRunLog): string[] {
    const assumptions: string[] = [];

    // 从决策日志中提取假设
    // Note: DecisionRunLog doesn't have metadata field, using explanation instead
    if (log.explanation) {
      // Try to extract assumptions from explanation if available
    }

    // 如果没有明确的假设，添加默认假设
    if (assumptions.length === 0) {
      assumptions.push('用户提供的信息准确');
      assumptions.push('环境条件在预测范围内');
      assumptions.push('交通和开放时间信息可靠');
    }

    return assumptions;
  }

  /**
   * 提取限制
   */
  private extractLimitations(log: DecisionRunLog): string[] {
    const limitations: string[] = [];

    // 从决策日志中提取限制
    // Note: DecisionRunLog doesn't have metadata field
    // Extract from violations or dryRunResult if available
    if (log.violations && log.violations.length > 0) {
      limitations.push(`检测到 ${log.violations.length} 个约束违规`);
    }
    if (log.dryRunResult?.willFail) {
      limitations.push(`预测可能在第 ${log.dryRunResult.failureDay} 天失败`);
    }

    // 如果没有明确的限制，添加默认限制
    if (limitations.length === 0) {
      limitations.push('预测基于历史数据和当前信息，实际结果可能有所不同');
      limitations.push('天气和交通状况可能实时变化');
      limitations.push('用户体力和偏好可能存在变化');
    }

    return limitations;
  }

  /**
   * 构建证据链
   */
  private buildEvidenceChain(log: DecisionRunLog): EvidenceChainItem[] {
    const chain: EvidenceChainItem[] = [];
    let step = 1;

    // 从决策日志中提取证据链
    if (log.chosenActions && log.chosenActions.length > 0) {
      log.chosenActions.forEach(action => {
        chain.push({
          step: step++,
          operation: this.getActionType(action.actionType),
          input: this.getActionInput(action),
          output: this.getActionOutput(action),
          method: this.getActionMethod(action),
        });
      });
    }

    // 如果没有证据链，创建默认的
    if (chain.length === 0) {
      chain.push({
        step: 1,
        operation: '路线评估',
        input: '用户请求和约束条件',
        output: log.explanation || '评估结果',
        method: '决策引擎分析',
      });
    }

    return chain;
  }

  /**
   * 描述动作
   */
  private describeAction(action: DecisionRunLog['chosenActions'][0]): string {
    const actionNames: Record<string, string> = {
      prioritize: '优先级调整',
      drop: '活动移除',
      swap: '活动替换',
      reorder: '顺序调整',
      insert_buffer: '插入缓冲时间',
      shorten: '时长缩短',
    };
    return actionNames[action.actionType] || action.actionType;
  }

  /**
   * 获取动作类型
   */
  private getActionType(actionType: string): string {
    return this.describeAction({ actionType } as DecisionRunLog['chosenActions'][0]);
  }

  /**
   * 获取动作输入
   */
  private getActionInput(action: DecisionRunLog['chosenActions'][0]): string {
    if (action.payload) {
      return JSON.stringify(action.payload);
    }
    return '当前计划状态';
  }

  /**
   * 获取动作输出
   */
  private getActionOutput(action: DecisionRunLog['chosenActions'][0]): string {
    return `执行${this.describeAction(action)}操作`;
  }

  /**
   * 获取动作方法
   */
  private getActionMethod(action: DecisionRunLog['chosenActions'][0]): string {
    if (action.reasonCodes && action.reasonCodes.length > 0) {
      return `基于${action.reasonCodes.join('、')}的决策规则`;
    }
    return '决策规则引擎';
  }

  /**
   * 推断数据源类型
   */
  private inferSourceType(ref: string): ExtendedDataSourceInfo['type'] {
    const lowerRef = ref.toLowerCase();
    if (lowerRef.includes('dem') || lowerRef.includes('elevation')) {
      return 'DEM';
    } else if (lowerRef.includes('weather')) {
      return 'WEATHER';
    } else if (lowerRef.includes('transport')) {
      return 'TRANSPORT';
    } else if (lowerRef.includes('poi') || lowerRef.includes('place')) {
      return 'POI';
    } else if (lowerRef.includes('route')) {
      return 'ROUTE';
    }
    return 'OTHER';
  }

  /**
   * 推断数据源名称
   */
  private inferSourceName(ref: string): string {
    const lowerRef = ref.toLowerCase();
    if (lowerRef.includes('dem')) {
      return 'DEM地形数据API';
    } else if (lowerRef.includes('weather')) {
      return '天气数据API';
    } else if (lowerRef.includes('transport')) {
      return '交通数据API';
    } else if (lowerRef.includes('poi')) {
      return 'POI数据API';
    }
    return '数据源';
  }
}
