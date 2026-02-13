/**
 * F-Road 状态检查 Skill
 *
 * 用途: 在 Should-Exist Gate 中检查冰岛 F-road 是否开放
 * 优先级: P0（阻塞性检查）
 *
 * 使用场景:
 * - 行程涉及冰岛高地路线 (F-road)
 * - 在 Plan 生成之前执行
 * - 不可达时返回 BLOCK 或 ADJUST_REQUIRED
 */

import { Injectable, Logger } from '@nestjs/common';
import { RoadStatusRealtimeService, RoadStatus } from '../../world/services/road-status-realtime.service';

export interface FRoadCheckInput {
  request_id: string;
  destination: string;
  origin?: string;
  routes?: Array<{
    roadIds?: string[]; // 例如 ["F208", "F26"]
    segments?: Array<{
      roadId?: string;
      from?: string;
      to?: string;
    }>;
  }>;
  date_range?: {
    start_date: string;
    end_date?: string;
  };
}

export interface FRoadCheckOutput {
  can_proceed: boolean;
  blocked_roads: Array<{
    roadId: string;
    currentStatus: string;
    reason: string;
    lastVerifiedAt: Date;
    unverified: boolean; // 是否使用了静态数据
  }>;
  warnings: Array<{
    roadId: string;
    warning: string;
    severity: 'low' | 'medium' | 'high' | 'very_high';
  }>;
  required_actions: string[]; // 用户必须采取的操作
  alternative_routes?: string[]; // 可选的替代路线
  evidence_refs: Array<{
    evidence_id: string;
    source: string;
    last_verified_at: Date;
    confidence: number;
  }>;
}

@Injectable()
export class FRoadCheckSkill {
  private readonly logger = new Logger('FRoadCheckSkill');

  constructor(
    private readonly roadStatusService: RoadStatusRealtimeService,
  ) {
    this.logger.log('✅ FRoadCheckSkill 已初始化');
  }

  /**
   * 执行 F-Road 状态检查
   */
  async execute(input: FRoadCheckInput): Promise<FRoadCheckOutput> {
    this.logger.debug(`[FRoadCheck] 开始检查: request_id=${input.request_id}`);

    const blockedRoads: FRoadCheckOutput['blocked_roads'] = [];
    const warnings: FRoadCheckOutput['warnings'] = [];
    const requiredActions: string[] = [];
    const evidenceRefs: FRoadCheckOutput['evidence_refs'] = [];

    // 1. 提取所有涉及的 F-road
    const fRoadsToCheck = this.extractFRoads(input);

    if (fRoadsToCheck.length === 0) {
      // 不涉及 F-road，直接通过
      this.logger.debug('[FRoadCheck] 不涉及 F-road，跳过检查');
      return {
        can_proceed: true,
        blocked_roads: [],
        warnings: [],
        required_actions: [],
        evidence_refs: [],
      };
    }

    this.logger.log(`[FRoadCheck] 检测到 ${fRoadsToCheck.length} 条 F-road: ${fRoadsToCheck.join(', ')}`);

    // 2. 查询每条 F-road 的状态
    for (const roadId of fRoadsToCheck) {
      try {
        const status = await this.roadStatusService.getRoadStatus(roadId);

        if (!status) {
          // 无法获取状态
          warnings.push({
            roadId,
            warning: 'Unable to verify road status - API unavailable',
            severity: 'high',
          });
          requiredActions.push(`Verify ${roadId} status manually at road.is or call 1777`);
          continue;
        }

        // 检查是否使用了静态数据（降级方案）
        const isUnverified = this.isUnverifiedStatus(status);

        // 3. 检查状态
        if (status.currentStatus === 'closed') {
          blockedRoads.push({
            roadId: status.roadId,
            currentStatus: status.currentStatus,
            reason: status.statusMessage || 'Road is closed',
            lastVerifiedAt: status.lastVerifiedAt,
            unverified: isUnverified,
          });

          if (isUnverified) {
            requiredActions.push(
              `❌ ${status.roadId} appears closed (based on seasonal pattern). MUST verify at road.is or call 1777 before travel.`
            );
          }
        } else if (status.currentStatus === 'limited') {
          warnings.push({
            roadId: status.roadId,
            warning: status.statusMessage || 'Road has limited access',
            severity: 'medium',
          });

          if (isUnverified) {
            requiredActions.push(
              `⚠️ ${status.roadId} may have limited access (based on seasonal pattern). Verify at road.is or call 1777.`
            );
          }
        }

        // 4. 检查告警
        if (status.hazards && status.hazards.length > 0) {
          for (const hazard of status.hazards) {
            if (hazard.severity === 'high' || hazard.severity === 'very_high') {
              warnings.push({
                roadId: status.roadId,
                warning: hazard.description,
                severity: hazard.severity,
              });
            }
          }
        }

        // 5. 记录证据
        evidenceRefs.push({
          evidence_id: `road-status-${status.roadId}-${Date.now()}`,
          source: isUnverified ? 'static_seasonal_data' : 'road.is_api',
          last_verified_at: status.lastVerifiedAt,
          confidence: isUnverified ? 0.6 : 0.9,
        });
      } catch (error) {
        this.logger.error(`[FRoadCheck] 检查 ${roadId} 失败:`, error);
        warnings.push({
          roadId,
          warning: `Unable to check road status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'high',
        });
        requiredActions.push(`Verify ${roadId} status manually before travel`);
      }
    }

    // 6. 生成建议的替代路线
    const alternativeRoutes = this.suggestAlternatives(blockedRoads.map(r => r.roadId));

    // 7. 决定是否可以继续
    const canProceed = blockedRoads.length === 0;

    if (!canProceed) {
      this.logger.warn(`[FRoadCheck] ❌ 阻塞: ${blockedRoads.length} 条道路关闭`);
    } else if (warnings.length > 0) {
      this.logger.warn(`[FRoadCheck] ⚠️  ${warnings.length} 条告警`);
    } else {
      this.logger.log(`[FRoadCheck] ✅ 所有 F-road 可通行`);
    }

    return {
      can_proceed: canProceed,
      blocked_roads: blockedRoads,
      warnings,
      required_actions: requiredActions,
      alternative_routes: alternativeRoutes,
      evidence_refs: evidenceRefs,
    };
  }

  /**
   * 从输入中提取所有 F-road ID
   */
  private extractFRoads(input: FRoadCheckInput): string[] {
    const fRoads = new Set<string>();

    // 1. 从目的地提取（简单模式匹配）
    const destinationMatches = input.destination.match(/F\d{1,3}/gi);
    if (destinationMatches) {
      destinationMatches.forEach(r => fRoads.add(r.toUpperCase()));
    }

    // 2. 从 origin 提取
    if (input.origin) {
      const originMatches = input.origin.match(/F\d{1,3}/gi);
      if (originMatches) {
        originMatches.forEach(r => fRoads.add(r.toUpperCase()));
      }
    }

    // 3. 从 routes 提取
    if (input.routes) {
      for (const route of input.routes) {
        if (route.roadIds) {
          route.roadIds.forEach(r => fRoads.add(r.toUpperCase()));
        }
        if (route.segments) {
          for (const segment of route.segments) {
            if (segment.roadId) {
              fRoads.add(segment.roadId.toUpperCase());
            }
          }
        }
      }
    }

    return Array.from(fRoads).sort();
  }

  /**
   * 检查状态是否为未验证（使用了静态数据）
   */
  private isUnverifiedStatus(status: RoadStatus): boolean {
    // 检查是否有 UNVERIFIED_STATUS 告警
    return status.hazards.some(h =>
      h.type === 'UNVERIFIED_STATUS' ||
      h.type === 'MANUAL_VERIFICATION_REQUIRED'
    );
  }

  /**
   * 建议替代路线
   */
  private suggestAlternatives(blockedRoads: string[]): string[] {
    const alternatives: string[] = [];

    // 已知的替代路线映射
    const alternativesMap: Record<string, string[]> = {
      'F208': ['F225 (longer but safer)', 'Ring Road via south coast'],
      'F26': ['Ring Road via east', 'Kjölur route (F35) if open'],
      'F35': ['Sprengisandur (F26) if open', 'Ring Road'],
      'F88': ['Ring Road via east coast', 'Mývatn accessible via Ring Road'],
      'F910': ['Ring Road to Mývatn', 'F88 if open'],
    };

    for (const roadId of blockedRoads) {
      const alt = alternativesMap[roadId];
      if (alt) {
        alternatives.push(...alt.map(a => `Alternative to ${roadId}: ${a}`));
      }
    }

    return alternatives;
  }
}
