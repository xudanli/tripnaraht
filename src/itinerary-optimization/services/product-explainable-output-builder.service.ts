// src/itinerary-optimization/services/product-explainable-output-builder.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OptimizationResult } from '../interfaces/plan-request.interface';
import { DemDecisionEvidence } from '../../trips/decision/shared/world-model.types';

/**
 * 规则命中
 */
export interface RuleHit {
  rule_id: string;
  rule_name: string;
  matched: boolean;
  impact: 'BLOCK' | 'PENALTY' | 'BONUS' | 'NEUTRAL';
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  details?: string;
}

/**
 * 关键特征
 */
export interface KeyFeature {
  name: string; // '爬升' | '坡度' | '夜间段' | '无救援段' | '换乘次数' | '等待时间' | ...
  value: number;
  unit?: string;
  threshold?: number;
  status: 'OK' | 'WARNING' | 'VIOLATION';
  explanation?: string;
}

/**
 * 数据源信息
 */
export interface DataSourceInfo {
  type: 'DEM' | 'TRANSPORT' | 'POI' | 'WEATHER' | 'ROUTE' | 'OPENING_HOURS';
  timestamp: string; // ISO 8601
  expiry?: string; // 过期时间
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'API' | 'CACHE' | 'DATABASE' | 'ESTIMATED' | 'DEFAULT';
}

/**
 * 证据链项
 */
export interface EvidenceChainItem {
  type: 'RULE_HIT' | 'FEATURE' | 'CONSTRAINT' | 'DATA';
  rule_id?: string; // 如果命中规则
  rule_hit?: RuleHit;
  feature?: KeyFeature;
  constraint?: {
    name: string;
    status: 'SATISFIED' | 'VIOLATED' | 'WARNING';
    details: string;
  };
  data_source?: DataSourceInfo;
}

/**
 * 可执行步骤
 */
export interface ActionableStep {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string; // 例如: '替换 POI X 为 Y'
  estimated_impact: string; // 例如: '减少 30 分钟旅行时间'
  user_confirmation_required: boolean;
  actionable_items?: Array<{
    type: 'REPLACE_POI' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT' | 'ADJUST_TIME' | 'REMOVE_NODE';
    target: string;
    suggested_value?: any;
  }>;
}

/**
 * 替代方案
 */
export interface AlternativeRoute {
  route: OptimizationResult;
  comparison?: {
    improvements: Array<{
      dimension: 'COST' | 'RISK' | 'TIME' | 'COMFORT' | 'SAFETY';
      improvement: number; // 改善幅度（百分比）
      evidence: EvidenceChainItem[];
      explanation: string;
    }>;
    tradeoffs: Array<{
      dimension: string;
      loss: number;
      explanation: string;
    }>;
  };
  recommendation: 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM';
}

/**
 * 产品可解释输出
 */
export interface ProductExplainableOutput {
  // 结论
  conclusion: {
    decision: 'ACCEPT' | 'REJECT' | 'ADJUST';
    confidence: number; // 0-1
    summary: string; // 一句话总结
  };

  // 证据
  evidence: {
    rule_hits: RuleHit[];
    key_features: KeyFeature[];
    data_quality: {
      missing_data: string[];
      stale_data: string[];
      low_reliability: string[];
    };
    evidence_chain: EvidenceChainItem[];
  };

  // 可执行下一步
  actionable_steps: ActionableStep[];

  // 替代方案
  alternatives?: AlternativeRoute[];
}

/**
 * 产品可解释输出构建器
 * 
 * 功能：
 * 1. 统一证据收集（规则命中、关键特征、数据质量）
 * 2. 构建证据链
 * 3. 生成可执行步骤
 * 4. 格式化产品友好的输出
 */
@Injectable()
export class ProductExplainableOutputBuilderService {
  private readonly logger = new Logger(ProductExplainableOutputBuilderService.name);

  /**
   * 构建可解释输出
   */
  async buildExplainableOutput(
    result: OptimizationResult,
    context: {
      dem_evidence?: DemDecisionEvidence[];
      rule_hits?: RuleHit[];
      data_quality?: {
        missing: string[];
        stale: string[];
        low_reliability: string[];
      };
      alternatives?: AlternativeRoute[];
    } = {}
  ): Promise<ProductExplainableOutput> {
    // 1. 确定结论
    const conclusion = this.buildConclusion(result, context);

    // 2. 收集证据
    const evidence = await this.collectEvidence(result, context);

    // 3. 生成可执行步骤
    const actionableSteps = this.generateActionableSteps(result, evidence);

    // 4. 构建输出
    return {
      conclusion,
      evidence,
      actionable_steps: actionableSteps,
      alternatives: context.alternatives,
    };
  }

  /**
   * 构建结论
   */
  private buildConclusion(
    result: OptimizationResult,
    context: any
  ): ProductExplainableOutput['conclusion'] {
    if (result.status === 'INFEASIBLE') {
      return {
        decision: 'REJECT',
        confidence: 0.9,
        summary: '路线不可行，建议调整约束条件或选择替代方案',
      };
    }

    // 检查是否有严重警告
    const hasCriticalIssues =
      result.diagnostics?.critical_windows?.some(w => w.slack_to_close_min < 15) ||
      result.robustness?.risk_level === 'high' ||
      (context.data_quality?.missing.length || 0) > 0;

    if (hasCriticalIssues) {
      return {
        decision: 'ADJUST',
        confidence: 0.7,
        summary: '路线可行但存在风险，建议调整以提高可靠性',
      };
    }

    // 正常情况
    return {
      decision: 'ACCEPT',
      confidence: 0.85,
      summary: '路线可行且质量良好，可以执行',
    };
  }

  /**
   * 收集证据
   */
  private async collectEvidence(
    result: OptimizationResult,
    context: any
  ): Promise<ProductExplainableOutput['evidence']> {
    const ruleHits: RuleHit[] = context.rule_hits || [];
    const keyFeatures: KeyFeature[] = [];
    const evidenceChain: EvidenceChainItem[] = [];

    // 1. 从优化结果提取关键特征
    keyFeatures.push(...this.extractKeyFeatures(result, context));

    // 2. 从 DEM 证据提取特征
    if (context.dem_evidence) {
      context.dem_evidence.forEach(ev => {
        if (ev.cumulativeAscent) {
          keyFeatures.push({
            name: '累计爬升',
            value: ev.cumulativeAscent,
            unit: 'm',
            status: ev.violation === 'HARD' ? 'VIOLATION' : ev.violation === 'SOFT' ? 'WARNING' : 'OK',
            explanation: ev.explanation,
          });
        }

        if (ev.maxSlopePct) {
          keyFeatures.push({
            name: '最大坡度',
            value: ev.maxSlopePct,
            unit: '%',
            status: ev.maxSlopePct > 25 ? 'WARNING' : 'OK',
            threshold: 25,
          });
        }
      });
    }

    // 3. 构建证据链
    evidenceChain.push(...this.buildEvidenceChain(ruleHits, keyFeatures, context));

    // 4. 数据质量信息
    const dataQuality = {
      missing_data: context.data_quality?.missing || [],
      stale_data: context.data_quality?.stale || [],
      low_reliability: context.data_quality?.low_reliability || [],
    };

    return {
      rule_hits: ruleHits,
      key_features: keyFeatures,
      data_quality: dataQuality,
      evidence_chain: evidenceChain,
    };
  }

  /**
   * 提取关键特征
   */
  private extractKeyFeatures(
    result: OptimizationResult,
    _context: any
  ): KeyFeature[] {
    const features: KeyFeature[] = [];

    // 旅行时间
    features.push({
      name: '总旅行时间',
      value: result.summary.total_travel_min,
      unit: '分钟',
      status: result.summary.total_travel_min > 240 ? 'WARNING' : 'OK',
    });

    // 等待时间
    features.push({
      name: '总等待时间',
      value: result.summary.total_wait_min,
      unit: '分钟',
      status: result.summary.total_wait_min > 60 ? 'WARNING' : 'OK',
    });

    // 丢弃节点数
    if (result.summary.dropped_count > 0) {
      features.push({
        name: '丢弃节点数',
        value: result.summary.dropped_count,
        status: result.summary.dropped_count > 2 ? 'WARNING' : 'OK',
        explanation: '部分节点因约束冲突被丢弃',
      });
    }

    // 稳健度
    if (result.robustness) {
      features.push({
        name: '稳健度等级',
        value: result.robustness.risk_level === 'low' ? 1 : result.robustness.risk_level === 'medium' ? 2 : 3,
        status: result.robustness.risk_level === 'high' ? 'WARNING' : 'OK',
        explanation: `最小松弛时间: ${Math.min(...(result.robustness.top3_min_slack_nodes?.map(n => n.slack_min) || [0]))} 分钟`,
      });
    }

    // 关键时间窗
    if (result.diagnostics?.critical_windows && result.diagnostics.critical_windows.length > 0) {
      const minSlack = Math.min(
        ...result.diagnostics.critical_windows.map(w => w.slack_to_close_min)
      );
      features.push({
        name: '关键时间窗最小松弛',
        value: minSlack,
        unit: '分钟',
        threshold: 30,
        status: minSlack < 15 ? 'VIOLATION' : minSlack < 30 ? 'WARNING' : 'OK',
        explanation: '存在时间窗接近关闭的节点',
      });
    }

    return features;
  }

  /**
   * 构建证据链
   */
  private buildEvidenceChain(
    ruleHits: RuleHit[],
    keyFeatures: KeyFeature[],
    _context: any
  ): EvidenceChainItem[] {
    const chain: EvidenceChainItem[] = [];

    // 添加规则命中
    ruleHits.forEach(rule => {
      chain.push({
        type: 'RULE_HIT',
        rule_id: rule.rule_id,
        rule_hit: rule,
      });
    });

    // 添加关键特征
    keyFeatures.forEach(feature => {
      chain.push({
        type: 'FEATURE',
        feature,
        data_source: this.inferDataSource(feature.name),
      });
    });

    // 添加约束信息
    const violations = keyFeatures.filter(f => f.status === 'VIOLATION');
    violations.forEach(v => {
      chain.push({
        type: 'CONSTRAINT',
        constraint: {
          name: v.name,
          status: 'VIOLATED',
          details: v.explanation || `${v.name} 超过阈值`,
        },
      });
    });

    return chain;
  }

  /**
   * 推断数据源
   */
  private inferDataSource(featureName: string): DataSourceInfo {
    const timestamp = new Date().toISOString();

    if (featureName.includes('爬升') || featureName.includes('坡度')) {
      return {
        type: 'DEM',
        timestamp,
        reliability: 'HIGH',
        source: 'API',
      };
    }

    if (featureName.includes('旅行时间') || featureName.includes('等待时间')) {
      return {
        type: 'TRANSPORT',
        timestamp,
        reliability: 'MEDIUM',
        source: 'CACHE',
      };
    }

    return {
      type: 'ROUTE',
      timestamp,
      reliability: 'MEDIUM',
      source: 'DATABASE',
    };
  }

  /**
   * 生成可执行步骤
   */
  private generateActionableSteps(
    result: OptimizationResult,
    evidence: ProductExplainableOutput['evidence']
  ): ActionableStep[] {
    const steps: ActionableStep[] = [];

    // 1. 处理违反约束的情况
    const violations = evidence.key_features.filter(f => f.status === 'VIOLATION');
    violations.forEach(v => {
      steps.push({
        priority: 'HIGH',
        action: this.generateActionForViolation(v),
        estimated_impact: '消除约束违反',
        user_confirmation_required: true,
      });
    });

    // 2. 处理警告情况
    const warnings = evidence.key_features.filter(f => f.status === 'WARNING');
    if (warnings.length > 0) {
      steps.push({
        priority: 'MEDIUM',
        action: `优化 ${warnings.map(w => w.name).join('、')} 以减少风险`,
        estimated_impact: '提高路线可靠性和体验',
        user_confirmation_required: false,
      });
    }

    // 3. 处理丢弃的节点
    if (result.summary.dropped_count > 0) {
      steps.push({
        priority: 'MEDIUM',
        action: `重新考虑 ${result.summary.dropped_count} 个被丢弃的节点，可尝试调整时间或替换为替代节点`,
        estimated_impact: '增加路线丰富度',
        user_confirmation_required: false,
        actionable_items: result.dropped?.map(d => ({
          type: 'REPLACE_POI' as const,
          target: d.name,
          suggested_value: `寻找 ${d.name} 的替代 POI`,
        })),
      });
    }

    // 4. 处理数据质量问题
    if (evidence.data_quality.missing_data.length > 0) {
      steps.push({
        priority: 'HIGH',
        action: `刷新缺失数据: ${evidence.data_quality.missing_data.join('、')}`,
        estimated_impact: '提高路线准确性',
        user_confirmation_required: true,
      });
    }

    return steps;
  }

  /**
   * 为违反约束生成动作
   */
  private generateActionForViolation(violation: KeyFeature): string {
    if (violation.name.includes('爬升')) {
      return `降低路线难度：选择爬升更少的替代路线或增加天数`;
    }

    if (violation.name.includes('坡度')) {
      return `避开陡坡路段：选择坡度更小的路线`;
    }

    if (violation.name.includes('时间窗')) {
      return `调整时间安排：提前出发或调整节点顺序以避免时间窗冲突`;
    }

    return `调整 ${violation.name} 以满足约束条件`;
  }
}
