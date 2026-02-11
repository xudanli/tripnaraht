/**
 * 因果推理服务（世界模型专用）
 * 
 * 负责世界模型的因果推理，包括：
 * - 构建世界模型的因果图
 * - 执行因果推理（使用CausalModelingService）
 * - 执行反事实推理
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { CausalModelingService } from '../../../agent/reasoning/services/causal-modeling.service';
import { CacheService } from '../../../common/cache/cache.service';
import { WorldModelMonitoringService } from './world-model-monitoring.service';
import {
  CausalRelation,
  CausalChain,
  CausalReasoningResult,
  CausalReasoningOptions,
} from '../../../agent/reasoning/interfaces/causal-modeling.interface';
import {
  ReasoningGraph,
  GraphNode,
  GraphEdge,
} from '../../../agent/reasoning/interfaces/graph-reasoning.interface';
import { UnifiedWorldModel } from '../interfaces/unified-world-model.interface';

/**
 * 世界模型因果图节点类型
 */
export type WorldModelNodeType =
  | 'WEATHER'
  | 'ROAD_STATUS'
  | 'USER_CAPABILITY'
  | 'ROUTE_DIFFICULTY'
  | 'TIME_ESTIMATE'
  | 'RISK_LEVEL'
  | 'TRIP_SUCCESS'
  | 'TRIP_FAILURE'
  | 'POI_ACCESSIBILITY'
  | 'PREDICTION';

/**
 * 世界模型因果推理结果
 */
export interface WorldModelCausalReasoningResult {
  /** 因果推理结果 */
  causalReasoning: CausalReasoningResult;
  
  /** 世界模型特定的因果链 */
  worldModelChains: WorldModelCausalChain[];
  
  /** 反事实推理结果 */
  counterfactuals?: CounterfactualReasoningResult[];
}

/**
 * 世界模型因果链
 */
export interface WorldModelCausalChain {
  id: string;
  chain: CausalChain;
  worldModelContext: {
    sourceType: WorldModelNodeType;
    targetType: WorldModelNodeType;
    factors: string[];
  };
  confidence: number;
}

/**
 * 反事实推理结果
 */
export interface CounterfactualReasoningResult {
  id: string;
  scenario: string;
  originalOutcome: string;
  counterfactualOutcome: string;
  changedFactors: Array<{
    factor: string;
    originalValue: any;
    counterfactualValue: any;
  }>;
  confidence: number;
  explanation: string;
}

@Injectable()
export class CausalReasoningService {
  private readonly logger = new Logger(CausalReasoningService.name);
  
  /** Code Review P2-1修复：因果推理结果缓存 */
  private readonly cacheKeyPrefix = 'causal_reasoning:';
  private readonly cacheTtl = 3600; // 1小时

  constructor(
    @Optional() private causalModelingService?: CausalModelingService,
    @Optional() private cacheService?: CacheService,
    @Optional() private monitoringService?: WorldModelMonitoringService,
  ) {}

  /**
   * 构建世界模型的因果图
   */
  async buildWorldModelCausalGraph(
    worldModel: UnifiedWorldModel,
  ): Promise<ReasoningGraph> {
    this.logger.log(
      `[CausalReasoning] 构建世界模型因果图`,
    );

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();

    // 1. 添加天气节点
    if (worldModel.realtimeState?.weatherAlerts) {
      worldModel.realtimeState.weatherAlerts.forEach((alert, index) => {
        const nodeId = `weather_alert_${index}`;
        nodes.set(nodeId, {
          id: nodeId,
          type: 'WEATHER',
          label: `${alert.alertType} Alert`,
          data: {
            alertType: alert.alertType,
            severity: alert.severity,
            region: alert.region,
          },
          metadata: {
            worldModelType: 'WEATHER' as WorldModelNodeType,
          },
        });
      });
    }

    // 2. 添加道路状态节点
    if (worldModel.realtimeState?.roadStatusUpdates) {
      worldModel.realtimeState.roadStatusUpdates.forEach((update, index) => {
        const nodeId = `road_status_${index}`;
        nodes.set(nodeId, {
          id: nodeId,
          type: 'ROAD_STATUS',
          label: `Road ${update.roadId}`,
          data: {
            roadId: update.roadId,
            status: update.currentStatus,
            confidence: update.confidence,
          },
          metadata: {
            worldModelType: 'ROAD_STATUS' as WorldModelNodeType,
          },
        });
      });
    }

    // 3. 添加用户能力节点
    if (worldModel.learnedCapabilities) {
      const nodeId = 'user_capability';
      nodes.set(nodeId, {
        id: nodeId,
        type: 'USER_CAPABILITY',
        label: 'User Capability',
        data: {
          actualMaxAscent: worldModel.learnedCapabilities.actualMaxAscent,
          actualRiskTolerance: worldModel.learnedCapabilities.actualRiskTolerance,
          actualPace: worldModel.learnedCapabilities.actualPace,
        },
        metadata: {
          worldModelType: 'USER_CAPABILITY' as WorldModelNodeType,
        },
      });
    }

    // 4. 添加路线难度节点
    if (worldModel.adaptiveParameters) {
      const nodeId = 'route_difficulty';
      nodes.set(nodeId, {
        id: nodeId,
        type: 'ROUTE_DIFFICULTY',
        label: 'Route Difficulty',
        data: {
          adjustment: worldModel.adaptiveParameters.routeDifficultyAdjustment,
        },
        metadata: {
          worldModelType: 'ROUTE_DIFFICULTY' as WorldModelNodeType,
        },
      });
    }

    // 5. 添加预测节点
    if (worldModel.predictions) {
      if (worldModel.predictions.failureRisk) {
        const nodeId = 'failure_risk_prediction';
        nodes.set(nodeId, {
          id: nodeId,
          type: 'PREDICTION',
          label: 'Failure Risk Prediction',
          data: {
            predictions: worldModel.predictions.failureRisk.predictions,
          },
          metadata: {
            worldModelType: 'PREDICTION' as WorldModelNodeType,
          },
        });
      }
    }

    // 6. 添加结果节点（行程成功/失败）
    const successNodeId = 'trip_success';
    nodes.set(successNodeId, {
      id: successNodeId,
      type: 'TRIP_SUCCESS',
      label: 'Trip Success',
      data: {},
      metadata: {
        worldModelType: 'TRIP_SUCCESS' as WorldModelNodeType,
      },
    });

    const failureNodeId = 'trip_failure';
    nodes.set(failureNodeId, {
      id: failureNodeId,
      type: 'TRIP_FAILURE',
      label: 'Trip Failure',
      data: {},
      metadata: {
        worldModelType: 'TRIP_FAILURE' as WorldModelNodeType,
      },
    });

    // 7. 构建因果关系边（动态权重计算）
    // 天气 -> 道路状态
    Array.from(nodes.values())
      .filter((n) => n.metadata?.worldModelType === 'WEATHER')
      .forEach((weatherNode) => {
        Array.from(nodes.values())
          .filter((n) => n.metadata?.worldModelType === 'ROAD_STATUS')
          .forEach((roadNode) => {
            const edgeId = `edge_${weatherNode.id}_${roadNode.id}`;
            // 动态计算权重：基于天气严重程度
            const weatherSeverity = (weatherNode.data as any)?.severity || 'MEDIUM';
            const weight = this.calculateWeatherRoadWeight(weatherSeverity);
            
            edges.set(edgeId, {
              id: edgeId,
              from: weatherNode.id,
              to: roadNode.id,
              type: 'DERIVATION',
              weight,
              metadata: {
                reasoning: `Weather (${weatherSeverity}) affects road conditions`,
              },
            });
          });
      });

      // 道路状态 + 用户能力 -> 路线难度（动态权重）
      Array.from(nodes.values())
        .filter((n) => n.metadata?.worldModelType === 'ROAD_STATUS')
        .forEach((roadNode) => {
          const userCapabilityNode = nodes.get('user_capability');
          const routeDifficultyNode = nodes.get('route_difficulty');
          if (userCapabilityNode && routeDifficultyNode) {
            const edgeId = `edge_${roadNode.id}_${routeDifficultyNode.id}`;
            // 动态计算权重：基于道路状态和用户能力
            const roadStatus = (roadNode.data as any)?.status || 'OPEN';
            const userCapability = (userCapabilityNode.data as any)?.actualMaxAscent || 500;
            const weight = this.calculateRoadCapabilityDifficultyWeight(roadStatus, userCapability);
            
            edges.set(edgeId, {
              id: edgeId,
              from: roadNode.id,
              to: routeDifficultyNode.id,
              type: 'DERIVATION',
              weight,
              metadata: {
                reasoning: `Road status (${roadStatus}) and user capability (${userCapability}m) affect route difficulty`,
              },
            });
          }
        });

    // 路线难度 + 预测 -> 行程成功/失败
    const routeDifficultyNode = nodes.get('route_difficulty');
    const failureRiskNode = nodes.get('failure_risk_prediction');
    if (routeDifficultyNode) {
      // 到成功节点
      const successEdgeId = `edge_${routeDifficultyNode.id}_${successNodeId}`;
      edges.set(successEdgeId, {
        id: successEdgeId,
        from: routeDifficultyNode.id,
        to: successNodeId,
        type: 'DERIVATION',
        weight: 0.5,
        metadata: {
          reasoning: 'Route difficulty affects trip success',
        },
      });

      // 到失败节点（动态权重：基于路线难度调整）
      const routeDifficulty = (routeDifficultyNode.data as any)?.adjustment || 1.0;
      const failureWeight = this.calculateDifficultyFailureWeight(routeDifficulty);
      
      const failureEdgeId = `edge_${routeDifficultyNode.id}_${failureNodeId}`;
      edges.set(failureEdgeId, {
        id: failureEdgeId,
        from: routeDifficultyNode.id,
        to: failureNodeId,
        type: 'DERIVATION',
        weight: failureWeight,
        metadata: {
          reasoning: `Route difficulty (${routeDifficulty.toFixed(2)}x) increases failure risk`,
        },
      });
    }

    if (failureRiskNode) {
      // 预测 -> 失败（动态权重：基于预测风险级别）
      const riskLevel = this.extractRiskLevelFromPrediction(failureRiskNode.data);
      const predictionWeight = this.calculatePredictionFailureWeight(riskLevel);
      
      const predictionFailureEdgeId = `edge_${failureRiskNode.id}_${failureNodeId}`;
      edges.set(predictionFailureEdgeId, {
        id: predictionFailureEdgeId,
        from: failureRiskNode.id,
        to: failureNodeId,
        type: 'DERIVATION',
        weight: predictionWeight,
        metadata: {
          reasoning: `Failure risk prediction (${riskLevel}) indicates failure likelihood`,
        },
      });
    }

    // 计算根节点和叶节点
    const nodeIds = Array.from(nodes.keys());
    const edgeTargets = new Set(Array.from(edges.values()).map(e => e.to));
    const edgeSources = new Set(Array.from(edges.values()).map(e => e.from));
    const rootNodes = nodeIds.filter(id => !edgeTargets.has(id));
    const leafNodes = nodeIds.filter(id => !edgeSources.has(id));

    return {
      nodes,
      edges,
      rootNodes,
      leafNodes,
    };
  }

  /**
   * 执行世界模型因果推理
   * Code Review P2-1修复：添加缓存机制
   */
  async reasonAboutWorldModel(
    worldModel: UnifiedWorldModel,
    targetNodeType?: WorldModelNodeType,
    options?: CausalReasoningOptions,
  ): Promise<WorldModelCausalReasoningResult> {
    this.logger.log(
      `[CausalReasoning] 执行世界模型因果推理: targetNodeType=${targetNodeType}`,
    );

    // Code Review P2-1修复：生成缓存键（基于世界模型的关键特征）
    const cacheKey = this.generateCacheKey(worldModel, targetNodeType, options);
    
      // 尝试从缓存获取
      if (this.cacheService) {
        try {
          const cached = await this.cacheService.get<WorldModelCausalReasoningResult>(cacheKey);
          if (cached) {
            this.logger.debug(`[CausalReasoning] 从缓存获取因果推理结果`);
            // Code Review P2-4修复：记录缓存命中
            if (this.monitoringService) {
              this.monitoringService.recordCacheHit('causalReasoning');
            }
            return cached;
          } else {
            // Code Review P2-4修复：记录缓存未命中
            if (this.monitoringService) {
              this.monitoringService.recordCacheMiss('causalReasoning');
            }
          }
        } catch (error: any) {
          this.logger.warn(`[CausalReasoning] 缓存获取失败: ${error.message}`);
          // Code Review P2-4修复：记录缓存未命中
          if (this.monitoringService) {
            this.monitoringService.recordCacheMiss('causalReasoning');
          }
        }
      }

    try {
      // 1. 构建因果图
      const graph = await this.buildWorldModelCausalGraph(worldModel);

      // 2. 执行因果推理（使用CausalModelingService）
      let causalReasoning: CausalReasoningResult | undefined;
      if (this.causalModelingService) {
        // 找到目标节点
        const targetNode = targetNodeType
          ? Array.from(graph.nodes.values()).find(
              (n) => n.metadata?.worldModelType === targetNodeType,
            )
          : undefined;

        causalReasoning = await this.causalModelingService.reason(
          graph,
          targetNode?.id,
          options,
        );
      }

      // 3. 构建世界模型特定的因果链
      const worldModelChains = this.buildWorldModelChains(
        causalReasoning?.causalChains || [],
        graph,
      );

      // 4. 执行反事实推理（可选）
      const counterfactuals = options?.enableCounterfactuals
        ? await this.performCounterfactualReasoning(
            worldModel,
            causalReasoning,
            graph,
          )
        : undefined;

      const result: WorldModelCausalReasoningResult = {
        causalReasoning: causalReasoning || {
          graph,
          causalRelations: [],
          causalChains: [],
          rootCauses: [],
          effects: [],
          overallConfidence: 0.5,
          explanation: 'Causal reasoning not available',
        },
        worldModelChains,
        counterfactuals,
      };

      // Code Review P2-1修复：存储到缓存
      if (this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, this.cacheTtl);
          this.logger.debug(`[CausalReasoning] 因果推理结果已缓存`);
        } catch (error: any) {
          this.logger.warn(`[CausalReasoning] 缓存存储失败: ${error.message}`);
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(
        `[CausalReasoning] 因果推理失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 生成缓存键（基于世界模型的关键特征）
   */
  private generateCacheKey(
    worldModel: UnifiedWorldModel,
    targetNodeType?: WorldModelNodeType,
    options?: CausalReasoningOptions,
  ): string {
    // 使用世界模型的关键特征生成缓存键
    const keyParts = [
      worldModel.physical?.countryCode || 'unknown',
      worldModel.routeDirection?.id || 'unknown',
      targetNodeType || 'all',
      options?.enableCounterfactuals ? 'cf' : 'no-cf',
      // 使用实时状态和预测的哈希（简化）
      worldModel.realtimeState?.weatherAlerts?.length || 0,
      worldModel.predictions?.weather?.length || 0,
    ];
    
    return this.cacheService
      ? this.cacheService.generateKey(this.cacheKeyPrefix, ...keyParts)
      : `${this.cacheKeyPrefix}${keyParts.join(':')}`;
  }

  /**
   * 构建世界模型特定的因果链（增强：重要性排序和解释生成）
   */
  private buildWorldModelChains(
    causalChains: CausalChain[],
    graph: ReasoningGraph,
  ): WorldModelCausalChain[] {
    // 构建因果链
    const chains = causalChains.map((chain) => {
      const sourceNode = graph.nodes.get(chain.nodes[0]);
      const targetNode = graph.nodes.get(chain.nodes[chain.nodes.length - 1]);

      // 计算链的重要性（基于链的长度、置信度、关系强度）
      const importance = this.calculateChainImportance(chain, graph);

      return {
        id: `world_model_chain_${chain.id}`,
        chain,
        worldModelContext: {
          sourceType:
            (sourceNode?.metadata?.worldModelType as WorldModelNodeType) ||
            'WEATHER',
          targetType:
            (targetNode?.metadata?.worldModelType as WorldModelNodeType) ||
            'TRIP_SUCCESS',
          factors: chain.nodes.map((nodeId) => {
            const node = graph.nodes.get(nodeId);
            return node?.label || nodeId;
          }),
        },
        confidence: chain.confidence * importance, // 调整置信度（考虑重要性）
      };
    });

    // 按重要性排序
    return chains.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 计算因果链重要性
   */
  private calculateChainImportance(
    chain: CausalChain,
    graph: ReasoningGraph,
  ): number {
    let importance = 1.0;

    // 1. 链的长度影响（越短越重要）
    const lengthFactor = Math.max(0.5, 1.0 - (chain.nodes.length - 2) * 0.1);

    // 2. 关系强度影响
    const avgStrength = chain.relations.reduce((sum, rel) => {
      const strengthMap: Record<string, number> = {
        WEAK: 0.3,
        MODERATE: 0.6,
        STRONG: 0.8,
        VERY_STRONG: 1.0,
      };
      return sum + (strengthMap[rel.strength] || 0.5);
    }, 0) / chain.relations.length;

    // 3. 目标节点类型影响（TRIP_FAILURE比TRIP_SUCCESS更重要）
    const targetNode = graph.nodes.get(chain.nodes[chain.nodes.length - 1]);
    const targetType = targetNode?.metadata?.worldModelType;
    const targetFactor =
      targetType === 'TRIP_FAILURE' ? 1.2 : targetType === 'TRIP_SUCCESS' ? 1.0 : 0.9;

    importance = lengthFactor * avgStrength * targetFactor;

    return Math.max(0.5, Math.min(1.5, importance));
  }

  /**
   * 执行反事实推理
   */
  private async performCounterfactualReasoning(
    worldModel: UnifiedWorldModel,
    causalReasoning: CausalReasoningResult | undefined,
    graph: ReasoningGraph,
  ): Promise<CounterfactualReasoningResult[]> {
    this.logger.log(`[CausalReasoning] 执行反事实推理`);

    const counterfactuals: CounterfactualReasoningResult[] = [];

    // 1. 天气反事实：如果天气更好，行程成功率会如何变化？
    if (worldModel.realtimeState?.weatherAlerts) {
      const highSeverityAlerts = worldModel.realtimeState.weatherAlerts.filter(
        (a) => a.severity === 'HIGH' || a.severity === 'CRITICAL',
      );

      if (highSeverityAlerts.length > 0) {
        counterfactuals.push({
          id: 'counterfactual_weather',
          scenario: '如果天气预警降低到LOW级别',
          originalOutcome: '行程可能因恶劣天气失败',
          counterfactualOutcome: '行程成功率提高',
          changedFactors: highSeverityAlerts.map((alert) => ({
            factor: `${alert.alertType} Alert`,
            originalValue: alert.severity,
            counterfactualValue: 'LOW',
          })),
          confidence: 0.7,
          explanation:
            '降低天气预警级别可以减少道路关闭和行程延误的风险',
        });
      }
    }

    // 2. 用户能力反事实：如果用户能力更强，路线难度会如何变化？
    if (worldModel.learnedCapabilities) {
      const currentAscent = worldModel.learnedCapabilities.actualMaxAscent || 500;
      if (currentAscent < 1000) {
        counterfactuals.push({
          id: 'counterfactual_user_capability',
          scenario: '如果用户最大爬升能力提高到1000米',
          originalOutcome: `当前最大爬升能力为${currentAscent}米`,
          counterfactualOutcome: '可以应对更困难的路线',
          changedFactors: [
            {
              factor: 'User Max Ascent',
              originalValue: currentAscent,
              counterfactualValue: 1000,
            },
          ],
          confidence: 0.8,
          explanation:
            '提高用户爬升能力可以扩大可选路线范围，降低路线难度限制',
        });
      }
    }

    // 3. 道路状态反事实：如果道路状态更好，行程成功率会如何变化？
    if (worldModel.realtimeState?.roadStatusUpdates) {
      const closedRoads = worldModel.realtimeState.roadStatusUpdates.filter(
        (r) => r.currentStatus === 'CLOSED',
      );

      if (closedRoads.length > 0) {
        counterfactuals.push({
          id: 'counterfactual_road_status',
          scenario: '如果所有道路状态变为OPEN',
          originalOutcome: `${closedRoads.length}条道路关闭，可能影响行程`,
          counterfactualOutcome: '行程成功率提高，路线选择更多',
          changedFactors: closedRoads.map((road) => ({
            factor: `Road ${road.roadId}`,
            originalValue: road.currentStatus,
            counterfactualValue: 'OPEN',
          })),
          confidence: 0.75,
          explanation:
            '道路开放可以增加路线选择，提高行程成功率',
        });
      }
    }

    // 4. 预测反事实：如果预测更准确，决策会如何变化？
    if (worldModel.predictions?.failureRisk) {
      const highRiskPredictions = worldModel.predictions.failureRisk.predictions.filter(
        (p) => p.riskLevel === 'HIGH' || p.riskLevel === 'CRITICAL',
      );

      if (highRiskPredictions.length > 0) {
        counterfactuals.push({
          id: 'counterfactual_prediction',
          scenario: '如果失败风险预测更准确（降低20%）',
          originalOutcome: `${highRiskPredictions.length}天存在高风险`,
          counterfactualOutcome: '可以更准确地规避风险，提高行程成功率',
          changedFactors: highRiskPredictions.map((pred) => ({
            factor: `Day ${pred.day} Risk`,
            originalValue: pred.riskLevel,
            counterfactualValue: this.reduceRiskLevel(pred.riskLevel),
          })),
          confidence: 0.65,
          explanation:
            '更准确的预测可以帮助提前规避风险，优化行程安排',
        });
      }
    }

    // 5. 多因素组合反事实：如果多个因素同时改善
    if (
      worldModel.realtimeState?.weatherAlerts &&
      worldModel.realtimeState?.roadStatusUpdates &&
      worldModel.learnedCapabilities
    ) {
      const hasHighRiskWeather = worldModel.realtimeState.weatherAlerts.some(
        (a) => a.severity === 'HIGH' || a.severity === 'CRITICAL',
      );
      const hasClosedRoads = worldModel.realtimeState.roadStatusUpdates.some(
        (r) => r.currentStatus === 'CLOSED',
      );
      const hasLowCapability =
        (worldModel.learnedCapabilities.actualMaxAscent || 500) < 800;

      if (hasHighRiskWeather && hasClosedRoads && hasLowCapability) {
        counterfactuals.push({
          id: 'counterfactual_multifactor',
          scenario: '如果天气改善、道路开放、用户能力提升',
          originalOutcome: '多个不利因素叠加，行程失败风险高',
          counterfactualOutcome: '综合改善可以显著提高行程成功率',
          changedFactors: [
            {
              factor: 'Weather Alerts',
              originalValue: 'HIGH/CRITICAL',
              counterfactualValue: 'LOW',
            },
            {
              factor: 'Road Status',
              originalValue: 'CLOSED',
              counterfactualValue: 'OPEN',
            },
            {
              factor: 'User Capability',
              originalValue: 'LOW',
              counterfactualValue: 'HIGH',
            },
          ],
          confidence: 0.85,
          explanation:
            '多个因素的协同改善可以显著降低行程失败风险，提高成功率',
        });
      }
    }

    return counterfactuals;
  }

  /**
   * 降低风险级别
   */
  private reduceRiskLevel(riskLevel: string): string {
    const riskMap: Record<string, string> = {
      CRITICAL: 'HIGH',
      HIGH: 'MEDIUM',
      MEDIUM: 'LOW',
      LOW: 'LOW',
    };
    return riskMap[riskLevel] || riskLevel;
  }

  /**
   * 计算天气到道路状态的权重
   */
  private calculateWeatherRoadWeight(severity: string): number {
    const weightMap: Record<string, number> = {
      LOW: 0.5,
      MEDIUM: 0.7,
      HIGH: 0.85,
      CRITICAL: 0.95,
    };
    return weightMap[severity] || 0.7;
  }

  /**
   * 计算路线难度到失败的权重
   */
  private calculateDifficultyFailureWeight(adjustment: number): number {
    // 调整系数越高，失败权重越高
    if (adjustment >= 1.3) {
      return 0.9;
    } else if (adjustment >= 1.2) {
      return 0.8;
    } else if (adjustment >= 1.1) {
      return 0.7;
    } else if (adjustment >= 1.0) {
      return 0.6;
    } else {
      return 0.5;
    }
  }

  /**
   * 从预测数据中提取风险级别
   */
  private extractRiskLevelFromPrediction(data: any): string {
    if (data.predictions && Array.isArray(data.predictions)) {
      // 找到最高风险级别
      const riskLevels = data.predictions.map((p: any) => p.riskLevel);
      if (riskLevels.includes('CRITICAL')) {
        return 'CRITICAL';
      } else if (riskLevels.includes('HIGH')) {
        return 'HIGH';
      } else if (riskLevels.includes('MEDIUM')) {
        return 'MEDIUM';
      } else {
        return 'LOW';
      }
    }
    return 'MEDIUM';
  }

  /**
   * 计算预测到失败的权重
   */
  private calculatePredictionFailureWeight(riskLevel: string): number {
    const weightMap: Record<string, number> = {
      LOW: 0.5,
      MEDIUM: 0.65,
      HIGH: 0.8,
      CRITICAL: 0.95,
    };
    return weightMap[riskLevel] || 0.65;
  }

  /**
   * 计算道路状态和用户能力到路线难度的权重
   */
  private calculateRoadCapabilityDifficultyWeight(
    roadStatus: string,
    userCapability: number,
  ): number {
    let weight = 0.6; // 基础权重

    // 道路状态影响
    if (roadStatus === 'CLOSED') {
      weight += 0.2;
    } else if (roadStatus === 'CONDITIONAL') {
      weight += 0.1;
    }

    // 用户能力影响（能力越低，权重越高）
    if (userCapability < 500) {
      weight += 0.15;
    } else if (userCapability < 800) {
      weight += 0.1;
    }

    return Math.min(1, weight);
  }
}
