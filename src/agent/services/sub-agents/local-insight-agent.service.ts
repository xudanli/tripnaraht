// src/agent/services/sub-agents/local-insight-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LocalInsightAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { LocalInsightService } from '../../../rag/services/local-insight.service';
import { SpatialReplacementService } from '../../../trips/decision/services/spatial-replacement.service';
import { POIRouteAffinityService } from '../../../poi/services/poi-route-affinity.service';

/**
 * LocalInsight Agent Service (Claude Orchestration)
 * 
 * 职责：替代点位/替代路线建议（无证据必须标 ASSUMPTION）
 */
@Injectable()
export class ClaudeLocalInsightAgentService implements LocalInsightAgent {
  private readonly logger = new Logger(ClaudeLocalInsightAgentService.name);

  constructor(
    @Optional() private readonly localInsightService?: LocalInsightService,
    @Optional() private readonly spatialReplacement?: SpatialReplacementService,
    @Optional() private readonly poiAffinity?: POIRouteAffinityService,
  ) {
    this.logger.log(`[ClaudeLocalInsightAgent] 已初始化`);
    this.logger.log(`[ClaudeLocalInsightAgent] LocalInsightService: ${!!this.localInsightService}, SpatialReplacement: ${!!this.spatialReplacement}, POIAffinity: ${!!this.poiAffinity}`);
  }

  /**
   * 生成替代方案建议
   */
  async suggestAlternatives(
    request: TripPlanRequest,
    gateResult: GateResult,
    context: OrchestratorState,
  ): Promise<{
    alternative_pois: Array<{
      poi_id: string;
      name: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
    alternative_routes: Array<{
      route_id: string;
      description: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
  }> {
    this.logger.debug(`[ClaudeLocalInsightAgent] 生成替代方案: request_id=${request.request_id}`);

    try {
      const alternative_pois: Array<{
        poi_id: string;
        name: string;
        reason: string;
        evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
        evidence_refs?: string[];
      }> = [];
      const alternative_routes: Array<{
        route_id: string;
        description: string;
        reason: string;
        evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
        evidence_refs?: string[];
      }> = [];

      // 1. 根据 required_adjustments 生成替代方案
      if (gateResult.required_adjustments) {
        for (const adjustment of gateResult.required_adjustments) {
          if (adjustment.action === 'REPLACE_POI' && adjustment.target) {
            // TODO: 调用 POI 搜索服务查找替代 POI
            alternative_pois.push({
              poi_id: adjustment.target,
              name: `替代 POI（${adjustment.target}）`,
              reason: adjustment.why,
              evidence_status: 'UNVERIFIED', // 需要后续验证
            });
          } else if (adjustment.action === 'REPLACE_SEGMENT' && adjustment.target) {
            alternative_routes.push({
              route_id: adjustment.target,
              description: `替代路线（${adjustment.target}）`,
              reason: adjustment.why,
              evidence_status: 'UNVERIFIED', // 需要后续验证
            });
          }
        }
      }

      // 2. 如果有 LocalInsightService，获取当地洞察（通常标记为 ASSUMPTION）
      if (this.localInsightService && typeof request.destination === 'string') {
        const countryCode = this.extractCountryCode(request.destination);
        if (countryCode) {
          try {
            const insights = await this.localInsightService.getLocalInsight(
              countryCode,
              ['restaurant', 'accommodation', 'attraction'],
            );
            
            // 当地洞察通常无硬证据，标记为 ASSUMPTION
            for (const insight of insights.slice(0, 3)) { // 最多返回 3 个
              alternative_pois.push({
                poi_id: `insight_${(insight as any).id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: (insight as any).title || (insight as any).name || '当地推荐',
                reason: (insight as any).content?.substring(0, 100) || (insight as any).description?.substring(0, 100) || '当地推荐',
                evidence_status: 'ASSUMPTION', // 必须标注为假设
                evidence_refs: [],
              });
            }
          } catch (error: any) {
            this.logger.warn(`[ClaudeLocalInsightAgent] 获取当地洞察失败: ${error?.message}`);
          }
        }
      }

      // 3. 如果有 SpatialReplacementService，使用它查找替代 POI
      if (this.spatialReplacement && gateResult.required_adjustments) {
        const replacePoiAdjustment = gateResult.required_adjustments.find(a => a.action === 'REPLACE_POI');
        if (replacePoiAdjustment && replacePoiAdjustment.target) {
          // TODO: 调用 SpatialReplacementService 查找候选 POI
          // 需要将 request 转换为 SpatialReplacementService 需要的格式
        }
      }

      return {
        alternative_pois,
        alternative_routes,
      };
    } catch (error: any) {
      this.logger.error(`[ClaudeLocalInsightAgent] 生成替代方案失败: ${error?.message}`, error?.stack);
      
      // 降级：返回空列表
      return {
        alternative_pois: [],
        alternative_routes: [],
      };
    }
  }

  /**
   * 从目的地字符串提取国家代码（简单规则）
   */
  private extractCountryCode(destination: string): string | undefined {
    const countryMap: Record<string, string> = {
      '冰岛': 'IS',
      'Iceland': 'IS',
      'IS': 'IS',
      '尼泊尔': 'NP',
      'Nepal': 'NP',
      'NP': 'NP',
      '瑞士': 'CH',
      'Switzerland': 'CH',
      'CH': 'CH',
    };

    for (const [key, code] of Object.entries(countryMap)) {
      if (destination.includes(key)) {
        return code;
      }
    }

    return undefined;
  }
}
