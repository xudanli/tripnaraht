// src/skills/world/world-build-context.skill.ts
/**
 * skill.world.buildContext
 * 
 * 用途：给定 tripId（或原始参数），一次性拉齐 WorldModelContext 所需的一切：
 * - PhysicalRealityModel
 * - HumanCapabilityModel
 * - RoutePhilosophyModel / RouteDirection
 * 
 * 输入：tripId 或 { countryCode, season, duration, partyProfile }
 * 输出：WorldModelContext + missingPieces
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { PhysicalRealityModel } from '../../trips/decision/models/physical-reality.model';
import { HumanCapabilityModel } from '../../trips/decision/models/human-capability.model';
import { createHumanCapabilityModelFromProfile } from '../../trips/decision/models/human-capability.model';

export interface WorldBuildContextInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或原始参数 */
  countryCode?: string;
  /** 季节（月份 1-12） */
  season?: number;
  /** 行程天数 */
  duration?: number;
  /** 团队画像 */
  partyProfile?: {
    mobilityProfile?: string;
    riskTolerance?: 'low' | 'medium' | 'high';
    fitness?: 'low' | 'medium' | 'high';
    pace?: 'relaxed' | 'moderate' | 'intense';
  };
  /** 路线方向 ID（可选） */
  routeDirectionId?: string;
}

export interface WorldBuildContextOutput extends SkillOutput {
  /** 世界模型上下文 */
  world: WorldModelContext;
  /** 缺失的数据片段 */
  missingPieces: {
    demGaps?: string[]; // DEM 缺口
    humanProfileIncomplete?: boolean; // HumanProfile 不够细
    routeDirectionMissing?: boolean; // 缺少路线方向
    physicalRealityIncomplete?: boolean; // 物理现实不完整
  };
}

@Injectable()
export class WorldBuildContextSkill implements Skill<WorldBuildContextInput, WorldBuildContextOutput> {
  private readonly logger = new Logger(WorldBuildContextSkill.name);

  metadata = {
    name: 'world.buildContext',
    description: '构建完整的世界模型上下文（PhysicalRealityModel + HumanCapabilityModel + RouteDirection），一次性拉齐决策所需的所有数据',
    version: '1.0.0',
    category: 'world' as const,
    inputSchema: {
      dependencies: [
        { param: 'countryCode', alternatives: ['tripId'] },
        { param: 'tripId', alternatives: ['countryCode'] },
      ],
      extractors: {
        tripId: 'tripId',
        countryCode: 'countryCode',
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
  ) {}

  async execute(input: WorldBuildContextInput): Promise<WorldBuildContextOutput> {
    this.logger.debug(`执行 world.buildContext: tripId=${input.tripId || 'none'}, countryCode=${input.countryCode || 'none'}`);

    const missingPieces: WorldBuildContextOutput['missingPieces'] = {};

    try {
      let trip: any = null;
      let countryCode: string;
      let season: number;
      let routeDirectionId: string | undefined;
      let partyProfile: WorldBuildContextInput['partyProfile'];

      // 1. 获取基础数据
      if (input.tripId) {
        // 从 tripId 获取数据
        trip = await this.prisma.trip.findUnique({
          where: { id: input.tripId },
          include: {
            TripDay: true,
          },
        });

        if (!trip) {
          throw new NotFoundException(`行程不存在: ${input.tripId}`);
        }

        countryCode = trip.destination || trip.countryCode || input.countryCode || '';
        season = trip.startDate ? new Date(trip.startDate).getMonth() + 1 : (input.season || 1);
        routeDirectionId = (trip as any).routeDirectionId || input.routeDirectionId;
        
        // 从 trip 提取 partyProfile
        const pacingConfig = trip.pacingConfig as any;
        partyProfile = {
          mobilityProfile: pacingConfig?.mobilityProfile,
          riskTolerance: pacingConfig?.riskTolerance,
          fitness: pacingConfig?.fitness,
          pace: pacingConfig?.pace,
        };
      } else {
        // 使用原始参数
        countryCode = input.countryCode || '';
        season = input.season || 1;
        routeDirectionId = input.routeDirectionId;
        partyProfile = input.partyProfile;
      }

      if (!countryCode) {
        throw new Error('countryCode 是必需的（可通过 tripId 或直接传入）');
      }

      // 2. 构建 HumanCapabilityModel
      const human = this.buildHumanCapabilityModel(partyProfile);
      if (!human) {
        missingPieces.humanProfileIncomplete = true;
      }

      // 3. 获取 RouteDirection
      let routeDirection: any;
      if (!this.routeDirectionsService) {
        this.logger.warn('RouteDirectionsService 不可用，将使用空的 RouteDirection');
        missingPieces.routeDirectionMissing = true;
      } else {
        try {
          if (routeDirectionId) {
            routeDirection = await this.routeDirectionsService.findRouteDirectionByUuid(routeDirectionId);
          } else {
            // 如果没有指定，尝试获取第一个可用的
            const routeDirectionsResult = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
              month: season,
              limit: 1,
            });
            routeDirection = routeDirectionsResult.active?.[0];
          }
        } catch (error: any) {
          this.logger.warn(`获取 RouteDirection 失败: ${error?.message || error}`);
          missingPieces.routeDirectionMissing = true;
        }
      }

      if (!routeDirection) {
        this.logger.warn(`未找到 RouteDirection (country: ${countryCode}, season: ${season})，将使用空 RouteDirection`);
        missingPieces.routeDirectionMissing = true;
        // 创建一个最小的 RouteDirection 对象以继续构建
        routeDirection = {
          id: 'unknown',
          uuid: 'unknown',
          name: `Unknown Route for ${countryCode}`,
          countryCode,
          tags: [],
        };
      }

      // 4. 构建 PhysicalRealityModel
      // TODO: 完善 PhysicalRealityModel 的构建逻辑（DEM、道路状态、危险区域等）
      const physical: PhysicalRealityModel = {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode,
        month: season,
      };

      // TODO: 检查 DEM 数据完整性
      // missingPieces.demGaps = [...];

      // 5. 构建合规证据
      const complianceEvidence = this.buildComplianceEvidence(routeDirection);

      // 6. 组装 WorldModelContext
      const world: WorldModelContext = {
        physical,
        human: human || createHumanCapabilityModelFromProfile('default', { pace: 'normal', fitness: 'medium', riskTolerance: 'medium' }),
        routeDirection: routeDirection as any,
        complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
      };

      return {
        world,
        missingPieces,
      };
    } catch (error: any) {
      this.logger.error(`构建 WorldModelContext 失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildHumanCapabilityModel(
    partyProfile?: WorldBuildContextInput['partyProfile']
  ): HumanCapabilityModel | null {
    if (!partyProfile) {
      return null;
    }

    const paceMap: Record<string, 'slow' | 'normal' | 'fast'> = {
      relaxed: 'slow',
      moderate: 'normal',
      intense: 'fast',
    };

    return createHumanCapabilityModelFromProfile(
      `party-${Date.now()}`,
      {
        pace: paceMap[partyProfile.pace || 'moderate'] || 'normal',
        fitness: partyProfile.fitness || 'medium',
        riskTolerance: partyProfile.riskTolerance || 'medium',
      }
    );
  }

  private buildComplianceEvidence(routeDirection: any): any[] {
    // 简化实现，实际应该从 RouteDirection 中提取合规规则
    return [];
  }
}

