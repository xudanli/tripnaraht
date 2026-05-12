// src/trips/decision/strategies/abu-strategy.service.ts
/**
 * Abu Strategy（安全否决者）
 * 
 * 第一性原理：只接受"物理现实 + 合规"的输入
 * 
 * 法律：Abu 只能做两种事
 * ✔ ALLOW
 * ✔ REJECT
 * ❌ 不可 ADJUST / REPLACE
 * 
 * 约束：
 * - 只读 world.physical 和 complianceEvidence
 * - 不读任何"用户想玩什么"的字段（tags、preferences、体验类）
 * - 日志里只写：DEM 证据、封路状态、Hazard 信息、合规/签证/季节窗口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult } from '../shared/decision-result.types';
import { validatePhysicalRealityModel } from '../models/physical-reality.model';
import { ExaIntegrationService } from '../../../mcp/exa-integration.service';
import { AirbnbIntegrationService } from '../../../mcp/airbnb-integration.service';
import { BookingComIntegrationService } from '../../../mcp/booking-com-integration.service';

@Injectable()
export class AbuStrategy implements DecisionPersonaStrategy {
  private readonly logger = new Logger(AbuStrategy.name);
  readonly personaName = 'ABU' as const;

  constructor(
    @Optional() private readonly exaIntegration?: ExaIntegrationService,
    @Optional() private readonly airbnbIntegration?: AirbnbIntegrationService,
    @Optional() private readonly bookingComIntegration?: BookingComIntegrationService,
  ) {}

  /**
   * 评估计划
   * 
   * Abu 的职责（第一性原理）：
   * 1. 验证 PhysicalRealityModel 是否完整
   * 2. 检查 DEM 硬违规（HARD violation）
   * 3. 检查道路状态（封路、季节性关闭）
   * 4. 检查危险区域（Hazard zones）
   * 5. 检查合规（许可、向导、签证）
   * 6. 只能 ALLOW 或 REJECT，不能 ADJUST 或 REPLACE
   * 
   * 注意：Abu 不关心：
   * - 用户偏好（tags、preferences）
   * - 路线体验（好不好玩）
   * - 节奏偏好（快慢）
   * 这些都不是"是否允许存在"的决定因素
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    // 参数验证
    if (!world) {
      this.logger.error('WorldModelContext 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'WorldModelContext 不能为空',
            reasonCodes: ['MISSING_WORLD_CONTEXT'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    if (!plan) {
      this.logger.error('RoutePlanDraft 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'RoutePlanDraft 不能为空',
            reasonCodes: ['MISSING_PLAN'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    this.logger.debug(`Abu 评估计划: ${plan.tripId || 'unknown'}`);

    if (!world.physical) {
      this.logger.error('WorldModelContext.physical 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'WorldModelContext.physical 不能为空',
            reasonCodes: ['MISSING_PHYSICAL_MODEL'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    const physical = world.physical;
    const complianceEvidence = world.complianceEvidence || [];

    // 1️⃣ 验证 PhysicalRealityModel 是否完整
    const validation = validatePhysicalRealityModel(physical);
    if (!validation.valid) {
      this.logger.warn(
        `计划 ${plan.tripId} 的 PhysicalRealityModel 不完整，缺少: ${validation.missingFields.join(', ')}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `物理现实模型不完整，缺少字段: ${validation.missingFields.join(', ')}`,
            reasonCodes: ['INCOMPLETE_PHYSICAL_REALITY'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 2️⃣ 检查 DEM 硬违规
    // 注意：跳过占位符 demEvidence（segmentId 包含 'placeholder'）
    const demHardViolation = physical.demEvidence.find(
      e => e.violation === 'HARD' && !e.segmentId.includes('placeholder')
    );

    if (demHardViolation) {
      this.logger.warn(
        `计划 ${plan.tripId} 存在 DEM 硬违规: ${demHardViolation.segmentId}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到 DEM 硬违规（路段: ${demHardViolation.segmentId}，原因: ${demHardViolation.explanation || '未知'}），路线不应继续`,
            reasonCodes: ['HARD_DEM_VIOLATION'],
            evidenceRefs: [demHardViolation.segmentId],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 3️⃣ 检查道路状态（封路、季节性关闭）
    const closedRoads = physical.roadStates.filter(
      road => road.status === 'CLOSED' || 
              (road.status === 'SEASONAL' && 
               (road.seasonOpenFrom && physical.month < road.seasonOpenFrom ||
                road.seasonOpenTo && physical.month > road.seasonOpenTo))
    );

    // 3️⃣.5 搜索实时风险信息（Exa 集成）
    let realTimeRiskInfo: any = null;
    if (this.exaIntegration && world.routeDirection) {
      try {
        const routeName = world.routeDirection.name || plan.routeDirectionId;
        realTimeRiskInfo = await this.exaIntegration.searchRealTimeRisks(
          physical.countryCode,
          routeName,
          physical.month,
          new Date().getFullYear(),
        );

        if (realTimeRiskInfo.hasRisk) {
          this.logger.warn(
            `计划 ${plan.tripId} 检测到实时风险: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription}`
          );
          
          // 如果检测到道路封闭风险，直接拒绝
          if (realTimeRiskInfo.riskType === 'ROAD_CLOSED' || realTimeRiskInfo.riskType === 'TRANSPORT') {
            return {
              allowed: false,
              action: 'REJECT',
              logs: [
                {
                  persona: 'ABU',
                  action: 'REJECT',
                  explanation: `实时信息显示路线封闭或交通中断: ${realTimeRiskInfo.riskDescription || '未知原因'}`,
                  reasonCodes: ['REALTIME_ROAD_CLOSED'],
                  evidenceRefs: [],
                  timestamp: new Date().toISOString(),
                  decisionSource: 'PHYSICAL',
                  decisionStage: 'ABU_GATE',
                },
              ],
            };
          }

          // 其他高风险（天气、地质灾害、政治）也拒绝
          if (realTimeRiskInfo.riskType === 'WEATHER' || 
              realTimeRiskInfo.riskType === 'GEOLOGICAL' || 
              realTimeRiskInfo.riskType === 'POLITICAL') {
            return {
              allowed: false,
              action: 'REJECT',
              logs: [
                {
                  persona: 'ABU',
                  action: 'REJECT',
                  explanation: `实时信息显示高风险: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription || '未知原因'}`,
                  reasonCodes: ['REALTIME_HIGH_RISK'],
                  evidenceRefs: [],
                  timestamp: new Date().toISOString(),
                  decisionSource: 'PHYSICAL',
                  decisionStage: 'ABU_GATE',
                },
              ],
            };
          }
        }
      } catch (error: any) {
        this.logger.warn(`Exa real-time risk search failed: ${error.message}, continuing with structured data`);
        // 降级：继续使用结构化数据，不阻塞决策流程
      }
    }

    if (closedRoads.length > 0) {
      this.logger.warn(
        `计划 ${plan.tripId} 包含 ${closedRoads.length} 条封闭道路`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到封闭道路: ${closedRoads.map(r => r.roadId).join(', ')}，路线不应继续`,
            reasonCodes: ['ROAD_CLOSED'],
            evidenceRefs: closedRoads.map(r => r.roadId),
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 4️⃣ 检查危险区域（高风险 Hazard zones）
    const highRiskHazards = physical.hazardZones.filter(
      hazard => hazard.level === 'HIGH' &&
                (hazard.seasonality?.highRiskMonths?.includes(physical.month) ?? false)
    );

    if (highRiskHazards.length > 0) {
      this.logger.warn(
        `计划 ${plan.tripId} 包含 ${highRiskHazards.length} 个高风险危险区域`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到高风险危险区域（${highRiskHazards.map(h => `${h.type}@${h.zoneId}`).join(', ')}），路线不应继续`,
            reasonCodes: ['HIGH_RISK_HAZARD_ZONE'],
            evidenceRefs: highRiskHazards.map(h => h.zoneId),
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 5️⃣ 检查渡轮状态（如果路线依赖渡轮）
    const cancelledFerries = physical.ferryStates.filter(
      ferry => ferry.status === 'CANCELLED' ||
               (ferry.status === 'SEASONAL' &&
                (ferry.seasonOpenFrom && physical.month < ferry.seasonOpenFrom ||
                 ferry.seasonOpenTo && physical.month > ferry.seasonOpenTo))
    );

    if (cancelledFerries.length > 0) {
      // 检查计划是否依赖渡轮（P1：专利 FERRY_CANCELLED 硬约束）
      const planUsesFerry = plan.segments?.some(
        s => s.metadata?.mode === 'FERRY' || s.metadata?.ferryId
      );
      if (planUsesFerry) {
        this.logger.warn(
          `计划 ${plan.tripId} 依赖已取消的渡轮: ${cancelledFerries.map(f => f.ferryId).join(', ')}`
        );
        return {
          allowed: false,
          action: 'REJECT',
          logs: [
            {
              persona: 'ABU',
              action: 'REJECT',
              explanation: `路线依赖渡轮，但检测到渡轮已取消或季节性停运（${cancelledFerries.map(f => f.ferryId).join(', ')}），路线不可执行`,
              reasonCodes: ['FERRY_CANCELLED'],
              evidenceRefs: cancelledFerries.map(f => f.ferryId),
              timestamp: new Date().toISOString(),
              decisionSource: 'PHYSICAL',
              decisionStage: 'ABU_GATE',
            },
          ],
        };
      }
      this.logger.warn(
        `计划 ${plan.tripId} 区域存在已取消的渡轮: ${cancelledFerries.map(f => f.ferryId).join(', ')}（计划未使用渡轮，仅记录）`
      );
    }

    // 5️⃣.5 检查关键节点住宿可用性（Airbnb 集成）
    if (this.airbnbIntegration && plan.segments.length > 0) {
      try {
        // 提取关键节点：第一天起点和最后一天终点
        const firstSegment = plan.segments.find(s => s.dayIndex === 0 || s.dayIndex === 1) || plan.segments[0];
        const lastSegment = plan.segments[plan.segments.length - 1];
        
        // 从 metadata 中提取坐标（简化处理）
        const firstNodeLocation = firstSegment.metadata?.startLocation || 
                                  firstSegment.metadata?.fromLocation ||
                                  firstSegment.metadata?.coordinates;
        const lastNodeLocation = lastSegment.metadata?.endLocation || 
                                lastSegment.metadata?.toLocation ||
                                lastSegment.metadata?.coordinates;

        // 估算日期（简化处理：基于月份和 dayIndex）
        const currentYear = new Date().getFullYear();
        const month = physical.month;
        const firstDayDate = new Date(currentYear, month - 1, 1);
        const lastDayDate = new Date(currentYear, month - 1, plan.segments.length);
        
        const checkinDate = firstDayDate.toISOString().split('T')[0];
        const checkoutDate = new Date(lastDayDate.getTime() + 86400000).toISOString().split('T')[0]; // 加一天

        // 估算团队人数（从 human 模型或默认值）
        const partySize = (world.human as any)?.partySize || 2;

        // 检查第一天起点的住宿可用性（如果有关键节点坐标）
        if (firstNodeLocation && firstNodeLocation.lat && firstNodeLocation.lng) {
          const firstDayAvailability = await this.airbnbIntegration.checkCriticalNodeAvailability(
            { lat: firstNodeLocation.lat, lng: firstNodeLocation.lng },
            checkinDate,
            new Date(firstDayDate.getTime() + 86400000).toISOString().split('T')[0],
            partySize,
          );

          if (!firstDayAvailability.available) {
            this.logger.warn(
              `计划 ${plan.tripId} 第一天起点没有可用住宿`
            );
            return {
              allowed: false,
              action: 'REJECT',
              logs: [
                {
                  persona: 'ABU',
                  action: 'REJECT',
                  explanation: `第一天起点没有可用住宿，路线不可执行`,
                  reasonCodes: ['NO_ACCOMMODATION_AT_START'],
                  evidenceRefs: [firstSegment.segmentId],
                  timestamp: new Date().toISOString(),
                  decisionSource: 'HEURISTIC',
                  decisionStage: 'ABU_GATE',
                },
              ],
            };
          }
        }

        // 检查最后一天终点的住宿可用性（如果有关键节点坐标）
        if (lastNodeLocation && lastNodeLocation.lat && lastNodeLocation.lng) {
          const lastDayCheckin = new Date(lastDayDate.getTime() - 86400000).toISOString().split('T')[0];
          const lastDayAvailability = await this.airbnbIntegration.checkCriticalNodeAvailability(
            { lat: lastNodeLocation.lat, lng: lastNodeLocation.lng },
            lastDayCheckin,
            checkoutDate,
            partySize,
          );

          if (!lastDayAvailability.available) {
            this.logger.warn(
              `计划 ${plan.tripId} 最后一天终点没有可用住宿`
            );
            return {
              allowed: false,
              action: 'REJECT',
              logs: [
                {
                  persona: 'ABU',
                  action: 'REJECT',
                  explanation: `最后一天终点没有可用住宿，路线不可执行`,
                  reasonCodes: ['NO_ACCOMMODATION_AT_END'],
                  evidenceRefs: [lastSegment.segmentId],
                  timestamp: new Date().toISOString(),
                  decisionSource: 'HEURISTIC',
                  decisionStage: 'ABU_GATE',
                },
              ],
            };
          }
        }
      } catch (error: any) {
        this.logger.warn(`Airbnb accommodation check failed: ${error.message}, continuing with other checks`);
        // 降级：继续其他检查，不阻塞决策流程
      }
    }

    // 5️⃣.6 检查关键节点租车可用性（Booking.com 集成）
    // 注意：只有在路线明确需要租车时才检查（如 road trip、self-drive 标签）
    if (this.bookingComIntegration && plan.segments.length > 0) {
      try {
        // 检查路线是否需要租车（通过 RouteDirection tags 或 metadata）
        const routeTags = (world.routeDirection as any)?.tags || [];
        const needsCarRental = routeTags.includes('road-trip') || 
                              routeTags.includes('self-drive') ||
                              (world.routeDirection as any)?.metadata?.needsCarRental === true;

        if (!needsCarRental) {
          // 路线不需要租车，跳过检查
          this.logger.debug('Route does not require car rental, skipping check');
        } else {
          // 提取关键节点：第一天起点和最后一天终点
          const firstSegment = plan.segments.find(s => s.dayIndex === 0 || s.dayIndex === 1) || plan.segments[0];
          const lastSegment = plan.segments[plan.segments.length - 1];
          
          const firstNodeLocation = firstSegment.metadata?.startLocation || 
                                    firstSegment.metadata?.fromLocation ||
                                    firstSegment.metadata?.coordinates;
          const lastNodeLocation = lastSegment.metadata?.endLocation || 
                                  lastSegment.metadata?.toLocation ||
                                  lastSegment.metadata?.coordinates;

          if (firstNodeLocation && lastNodeLocation && 
              firstNodeLocation.lat && firstNodeLocation.lng &&
              lastNodeLocation.lat && lastNodeLocation.lng) {
            // 估算日期和时间
            const pickupTime = '10:00';
            const dropoffTime = '10:00';
            const driverAge = (world.human as any)?.driverAge || 25;

            // 检查租车可用性
            const carRentalAvailability = await this.bookingComIntegration.checkCriticalNodeCarRentalAvailability(
              { lat: firstNodeLocation.lat, lng: firstNodeLocation.lng },
              { lat: lastNodeLocation.lat, lng: lastNodeLocation.lng },
              pickupTime,
              dropoffTime,
              driverAge,
            );

            if (!carRentalAvailability.available) {
              this.logger.warn(
                `计划 ${plan.tripId} 关键节点没有可用租车（路线需要租车）`
              );
              return {
                allowed: false,
                action: 'REJECT',
                logs: [
                  {
                    persona: 'ABU',
                    action: 'REJECT',
                    explanation: `路线需要租车，但关键节点没有可用租车，路线不可执行`,
                    reasonCodes: ['NO_CAR_RENTAL_AVAILABLE'],
                    evidenceRefs: [firstSegment.segmentId, lastSegment.segmentId],
                    timestamp: new Date().toISOString(),
                    decisionSource: 'HEURISTIC',
                    decisionStage: 'ABU_GATE',
                  },
                ],
              };
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`Booking.com car rental check failed: ${error.message}, continuing with other checks`);
        // 降级：继续其他检查，不阻塞决策流程
      }
    }

    // 6️⃣ 检查合规（许可、向导、签证）
    const complianceHardViolation = complianceEvidence.find(
      e => e.violation === 'HARD'
    );

    if (complianceHardViolation) {
      this.logger.warn(`计划 ${plan.tripId} 存在合规硬违规`);
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: '检测到合规硬违规（如缺少许可或向导），路线不应继续',
            reasonCodes: ['HARD_COMPLIANCE_VIOLATION'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 7️⃣ 检查气候季节性（如果可达性评分过低）
    if (physical.climateSeasonality && physical.climateSeasonality.accessibilityScore < 0.3) {
      this.logger.warn(
        `计划 ${plan.tripId} 在当前月份（${physical.month}）可达性评分过低: ${physical.climateSeasonality.accessibilityScore}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `当前月份（${physical.month}）可达性评分过低（${physical.climateSeasonality.accessibilityScore}），路线不应继续`,
            reasonCodes: ['LOW_ACCESSIBILITY_SCORE'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      };
    }

    // 7️⃣ 检查 DEM Evidence 是否存在（缺失 = REJECT）
    if (!physical.demEvidence || physical.demEvidence.length === 0) {
      this.logger.warn(`计划 ${plan.tripId} 缺少 DEM Evidence，Abu 必须 REJECT`);
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: '缺少 DEM Evidence（DEM 证据是必需的），路线不应继续',
            reasonCodes: ['E_DEM_MISSING'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'DEM_EVIDENCE',
          },
        ],
      };
    }

    // 8️⃣ 所有检查通过 → ALLOW
    this.logger.debug(`计划 ${plan.tripId} 通过 Abu 检查，允许继续`);
    return {
      allowed: true,
      action: 'ALLOW',
      logs: [
        {
          persona: 'ABU',
          action: 'ALLOW',
          explanation: '未发现硬性风险问题（DEM、道路、危险区域、合规均通过），允许继续',
          reasonCodes: ['ABU_GATE_PASS'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'ABU_GATE',
        },
      ],
    };
  }
}

