// src/itinerary-optimization/services/conservative-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PlanRequest, OptimizationResult } from '../interfaces/plan-request.interface';
import { DataExpiryPolicyService, TimestampedData } from './data-expiry-policy.service';

/**
 * 缺失数据类型
 */
export type MissingDataType = 'DEM' | 'TRANSPORT' | 'OPENING_HOURS' | 'WEATHER' | 'POI' | 'ROUTE';

/**
 * 缺失数据信息
 */
export interface MissingDataInfo {
  type: MissingDataType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  affected_segments: string[]; // 受影响的路线段或 POI ID
  description: string;
  impact: string; // 影响说明
}

/**
 * 保守策略结果
 */
export interface ConservativeResult {
  decision: 'REJECT' | 'ADJUST' | 'PROCEED_WITH_WARNING';
  reason?: string;
  strategy?: 'SAFE_ROUTE_ONLY' | 'REDUCED_CONSTRAINTS' | 'ESTIMATED_VALUES';
  constraints?: {
    require_verified_route?: boolean;
    avoid_segments?: string[];
    safety_buffer_multiplier?: number;
    max_risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  missing_data?: MissingDataInfo[];
  suggestions?: string[];
  explanation?: string;
  warnings?: Array<{
    type: string;
    message: string;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

/**
 * 数据质量检查结果
 */
export interface DataQualityCheckResult {
  has_stale_data: boolean;
  has_missing_data: boolean;
  missing_data_list: MissingDataInfo[];
  stale_data_list: Array<{
    type: string;
    age_seconds: number;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

/**
 * 保守策略服务
 * 
 * 核心原则：宁可拒绝也不误导
 * 
 * 功能：
 * 1. 检测数据缺失和过期
 * 2. 根据严重程度应用保守策略
 * 3. 生成数据恢复建议
 * 4. 提供可解释的决策理由
 */
@Injectable()
export class ConservativeStrategyService {
  private readonly logger = new Logger(ConservativeStrategyService.name);

  constructor(
    private dataExpiryPolicyService: DataExpiryPolicyService
  ) {}

  /**
   * 检查数据质量
   */
  async checkDataQuality(
    request: PlanRequest,
    dataSources: {
      dem?: TimestampedData<any>;
      transport?: TimestampedData<any>;
      opening_hours?: TimestampedData<Record<string, any>>;
      weather?: TimestampedData<any>;
      poi?: TimestampedData<Record<string, any>>;
    }
  ): Promise<DataQualityCheckResult> {
    const missingDataList: MissingDataInfo[] = [];
    const staleDataList: Array<{
      type: string;
      age_seconds: number;
      reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    // 检查 DEM 数据
    if (!dataSources.dem) {
      missingDataList.push({
        type: 'DEM',
        severity: this.assessDEMSeverity(request),
        affected_segments: this.getAffectedSegments(request, 'DEM'),
        description: 'DEM 地形数据缺失',
        impact: '无法评估路线爬升、坡度等体力消耗特征',
      });
    } else {
      const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.dem);
      if (assessment.is_expired || assessment.reliability === 'LOW') {
        staleDataList.push({
          type: 'DEM',
          age_seconds: assessment.age_seconds,
          reliability: assessment.reliability,
        });
      }
    }

    // 检查交通数据
    if (!dataSources.transport) {
      missingDataList.push({
        type: 'TRANSPORT',
        severity: 'HIGH',
        affected_segments: this.getAffectedSegments(request, 'TRANSPORT'),
        description: '交通路线数据缺失',
        impact: '无法准确计算旅行时间和换乘方案',
      });
    } else {
      const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.transport);
      if (assessment.is_expired || assessment.reliability === 'LOW') {
        staleDataList.push({
          type: 'TRANSPORT',
          age_seconds: assessment.age_seconds,
          reliability: assessment.reliability,
        });
      }
    }

    // 检查开放时间数据
    if (!dataSources.opening_hours || Object.keys(dataSources.opening_hours.data).length === 0) {
      const affectedPois = request.nodes
        .filter(n => n.type === 'poi' || n.type === 'restaurant')
        .map(n => n.id.toString());
      
      missingDataList.push({
        type: 'OPENING_HOURS',
        severity: affectedPois.length > 0 ? 'HIGH' : 'MEDIUM',
        affected_segments: affectedPois,
        description: 'POI 开放时间数据缺失',
        impact: '无法验证时间窗约束，可能导致到达时闭馆',
      });
    } else {
      const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.opening_hours);
      if (assessment.is_expired || assessment.reliability === 'LOW') {
        staleDataList.push({
          type: 'OPENING_HOURS',
          age_seconds: assessment.age_seconds,
          reliability: assessment.reliability,
        });
      }
    }

    // 检查天气数据
    if (!dataSources.weather) {
      missingDataList.push({
        type: 'WEATHER',
        severity: 'MEDIUM',
        affected_segments: [],
        description: '天气数据缺失',
        impact: '无法评估天气对路线的影响（如雨天步行风险）',
      });
    } else {
      const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.weather);
      if (assessment.is_expired || assessment.reliability === 'LOW') {
        staleDataList.push({
          type: 'WEATHER',
          age_seconds: assessment.age_seconds,
          reliability: assessment.reliability,
        });
      }
    }

    return {
      has_stale_data: staleDataList.length > 0,
      has_missing_data: missingDataList.length > 0,
      missing_data_list: missingDataList,
      stale_data_list: staleDataList,
    };
  }

  /**
   * 应用保守策略
   */
  async applyConservativeStrategy(
    request: PlanRequest,
    dataQuality: DataQualityCheckResult
  ): Promise<ConservativeResult> {
    const criticalMissing = dataQuality.missing_data_list.filter(
      m => m.severity === 'CRITICAL'
    );
    const highMissing = dataQuality.missing_data_list.filter(
      m => m.severity === 'HIGH'
    );
    const mediumMissing = dataQuality.missing_data_list.filter(
      m => m.severity === 'MEDIUM'
    );

    // 1. 关键数据缺失 -> 直接拒绝
    if (criticalMissing.length > 0) {
      return {
        decision: 'REJECT',
        reason: 'CRITICAL_DATA_MISSING',
        missing_data: criticalMissing,
        suggestions: this.generateDataRecoverySuggestions(criticalMissing),
        explanation: this.generateRejectionExplanation(criticalMissing),
      };
    }

    // 2. 高风险数据缺失 -> 降级到安全路线
    if (highMissing.length > 0) {
      const avoidSegments = highMissing.flatMap(m => m.affected_segments);
      
      return {
        decision: 'ADJUST',
        strategy: 'SAFE_ROUTE_ONLY',
        constraints: {
          require_verified_route: true,
          avoid_segments: avoidSegments.length > 0 ? avoidSegments : undefined,
          safety_buffer_multiplier: 1.5,
          max_risk_level: 'LOW',
        },
        missing_data: highMissing,
        suggestions: this.generateDataRecoverySuggestions(highMissing),
        explanation: this.generateAdjustmentExplanation(highMissing),
        warnings: highMissing.map(m => ({
          type: m.type,
          message: `${m.description}: ${m.impact}`,
          reliability: 'LOW' as const,
        })),
      };
    }

    // 3. 中等风险缺失 + 过期数据 -> 警告但继续
    if (mediumMissing.length > 0 || dataQuality.has_stale_data) {
      const warnings: Array<{
        type: string;
        message: string;
        reliability: 'HIGH' | 'MEDIUM' | 'LOW';
      }> = [];

      mediumMissing.forEach(m => {
        warnings.push({
          type: m.type,
          message: `${m.description}: ${m.impact}`,
          reliability: 'MEDIUM',
        });
      });

      dataQuality.stale_data_list.forEach(s => {
        warnings.push({
          type: s.type,
          message: `数据已过期（年龄: ${this.formatAge(s.age_seconds)}），使用估算值`,
          reliability: s.reliability,
        });
      });

      return {
        decision: 'PROCEED_WITH_WARNING',
        missing_data: mediumMissing,
        suggestions: this.generateDataRecoverySuggestions(mediumMissing),
        warnings,
        explanation: '数据质量存在风险，但可以继续执行。建议验证关键数据。',
      };
    }

    // 4. 无问题 -> 正常执行
    return {
      decision: 'PROCEED_WITH_WARNING',
      explanation: '数据质量良好，可以正常执行',
    };
  }

  /**
   * 评估 DEM 数据缺失的严重程度
   */
  private assessDEMSeverity(request: PlanRequest): 'CRITICAL' | 'HIGH' | 'MEDIUM' {
    // 如果路线涉及徒步或高难度活动，DEM 数据缺失是关键的
    // 这里简化处理，实际应该根据路线特征判断
    const hasWalkingNodes = request.nodes.some(
      n => n.type === 'poi' && n.meta?.tags?.some(t => t.includes('hiking') || t.includes('trail'))
    );

    if (hasWalkingNodes) {
      return 'CRITICAL';
    }

    // 如果有硬节点且涉及地形，DEM 缺失是高风险
    const hasHardNodes = request.nodes.some(n => n.constraints?.is_hard_node);
    if (hasHardNodes) {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  /**
   * 获取受影响的路线段
   */
  private getAffectedSegments(request: PlanRequest, dataType: MissingDataType): string[] {
    switch (dataType) {
      case 'DEM':
        // 返回所有涉及地形的节点
        return request.nodes
          .filter(n => n.type === 'poi')
          .map(n => n.id.toString());
      
      case 'TRANSPORT':
        // 返回所有需要交通的节点对
        const segments: string[] = [];
        for (let i = 0; i < request.nodes.length - 1; i++) {
          segments.push(`${request.nodes[i].id}-${request.nodes[i + 1].id}`);
        }
        return segments;
      
      case 'OPENING_HOURS':
        // 返回所有 POI 节点
        return request.nodes
          .filter(n => n.type === 'poi' || n.type === 'restaurant')
          .map(n => n.id.toString());
      
      default:
        return [];
    }
  }

  /**
   * 生成数据恢复建议
   */
  private generateDataRecoverySuggestions(
    missingData: MissingDataInfo[]
  ): string[] {
    const suggestions: string[] = [];
    const types = new Set(missingData.map(m => m.type));

    if (types.has('DEM')) {
      suggestions.push('建议：等待 DEM 数据更新或选择更安全的路线（避开高难度地形）');
    }

    if (types.has('TRANSPORT')) {
      suggestions.push('建议：使用备用交通数据源（如 Google Routes API）或选择步行路线');
    }

    if (types.has('OPENING_HOURS')) {
      suggestions.push('建议：联系 POI 确认开放时间或选择替代景点');
    }

    if (types.has('WEATHER')) {
      suggestions.push('建议：使用天气 API 获取最新数据或采用保守的天气假设');
    }

    if (types.has('POI')) {
      suggestions.push('建议：从 POI 数据库获取最新信息或使用已验证的 POI');
    }

    return suggestions;
  }

  /**
   * 生成拒绝解释
   */
  private generateRejectionExplanation(missingData: MissingDataInfo[]): string {
    const types = missingData.map(m => m.type).join('、');
    return `由于关键数据缺失（${types}），无法安全生成路线。${this.generateDataRecoverySuggestions(missingData).join(' ')}`;
  }

  /**
   * 生成调整解释
   */
  private generateAdjustmentExplanation(missingData: MissingDataInfo[]): string {
    const types = missingData.map(m => m.type).join('、');
    return `由于数据缺失（${types}），将采用保守策略：仅使用已验证的路线，避开高风险区域，增加安全缓冲。`;
  }

  /**
   * 格式化年龄显示
   */
  private formatAge(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} 秒`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} 分钟`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)} 小时`;
    } else {
      return `${Math.floor(seconds / 86400)} 天`;
    }
  }
}
