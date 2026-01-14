// src/skills/transport/transport-search.skill.ts
/**
 * transport.search Skill
 * 
 * 搜索两点之间的交通路线
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TransportRoutingService } from '../../transport/transport-routing.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';

export interface TransportSearchInput extends SkillInput {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
}

export interface TransportSearchOutput extends SkillOutput {
  evidence_id: string;
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  options: Array<{
    mode: string;
    duration_minutes: number;
    distance_meters?: number;
    steps?: any[];
  }>;
  best_option?: {
    mode: string;
    duration_minutes: number;
    distance_meters?: number;
  };
}

@SkillDecorator({
  name: 'transport.search',
  description: '搜索两点之间的交通路线',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class TransportSearchSkill implements Skill<TransportSearchInput, TransportSearchOutput> {
  private readonly logger = new Logger(TransportSearchSkill.name);

  metadata = {
    name: 'transport.search',
    description: '搜索两点之间的交通路线',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['origin', 'destination'],
    },
  };

  constructor(
    @Optional() private readonly transportRoutingService?: TransportRoutingService,
    @Optional() private readonly entityResolutionService?: EntityResolutionService,
  ) {
    this.logger.log(`[TransportSearchSkill] 已初始化`);
  }

  async execute(input: TransportSearchInput): Promise<TransportSearchOutput> {
    this.logger.debug(`执行 transport.search: origin=${typeof input.origin === 'string' ? input.origin : `${input.origin.lat},${input.origin.lng}`}, destination=${typeof input.destination === 'string' ? input.destination : `${input.destination.lat},${input.destination.lng}`}`);

    try {
      if (!this.transportRoutingService) {
        throw new Error('TransportRoutingService 未注入');
      }

      // 转换坐标（如果是字符串，使用地理编码服务）
      let originLat: number;
      let originLng: number;
      let destLat: number;
      let destLng: number;

      // 处理起点
      if (typeof input.origin === 'string') {
        if (!this.entityResolutionService) {
          throw new Error(
            'transport.search 需要 EntityResolutionService 来解析字符串地址，但服务未注入。请使用坐标格式或确保 EntityResolutionService 已配置。',
          );
        }

        try {
          const originResult = await this.entityResolutionService.resolveEntities(
            input.origin,
            [],
            undefined,
            undefined,
            1,
          );

          if (
            !originResult.results ||
            originResult.results.length === 0 ||
            !originResult.results[0].lat ||
            !originResult.results[0].lng
          ) {
            throw new Error(
              `无法解析起点地址: "${input.origin}"。请提供更详细的地址信息或使用坐标格式。`,
            );
          }

          originLat = originResult.results[0].lat;
          originLng = originResult.results[0].lng;
          this.logger.debug(
            `地理编码起点: "${input.origin}" -> (${originLat}, ${originLng})`,
          );
        } catch (error: any) {
          this.logger.error(
            `地理编码起点失败: ${error?.message}`,
            error?.stack,
          );
          throw new Error(
            `无法解析起点地址: "${input.origin}"。错误: ${error?.message}`,
          );
        }
      } else {
        originLat = input.origin.lat;
        originLng = input.origin.lng;
      }

      // 处理终点
      if (typeof input.destination === 'string') {
        if (!this.entityResolutionService) {
          throw new Error(
            'transport.search 需要 EntityResolutionService 来解析字符串地址，但服务未注入。请使用坐标格式或确保 EntityResolutionService 已配置。',
          );
        }

        try {
          const destResult = await this.entityResolutionService.resolveEntities(
            input.destination,
            [],
            undefined,
            undefined,
            1,
          );

          if (
            !destResult.results ||
            destResult.results.length === 0 ||
            !destResult.results[0].lat ||
            !destResult.results[0].lng
          ) {
            throw new Error(
              `无法解析终点地址: "${input.destination}"。请提供更详细的地址信息或使用坐标格式。`,
            );
          }

          destLat = destResult.results[0].lat;
          destLng = destResult.results[0].lng;
          this.logger.debug(
            `地理编码终点: "${input.destination}" -> (${destLat}, ${destLng})`,
          );
        } catch (error: any) {
          this.logger.error(
            `地理编码终点失败: ${error?.message}`,
            error?.stack,
          );
          throw new Error(
            `无法解析终点地址: "${input.destination}"。错误: ${error?.message}`,
          );
        }
      } else {
        destLat = input.destination.lat;
        destLng = input.destination.lng;
      }

      // 调用交通规划服务
      const recommendation = await this.transportRoutingService.planRoute(
        originLat,
        originLng,
        destLat,
        destLng,
        {
          budgetSensitivity: 'MEDIUM',
          timeSensitivity: 'MEDIUM',
          hasLuggage: false,
          hasElderly: false,
          isMovingDay: false,
          isRaining: false,
          hasLimitedMobility: false,
        }
      );

      // 转换为输出格式
      const options = recommendation.options.map(opt => ({
        mode: opt.mode,
        duration_minutes: opt.durationMinutes,
        // TransportOption 没有 distanceMeters，使用 walkDistance 作为近似值
        distance_meters: (opt as any).distanceMeters || (opt as any).distance_meters || opt.walkDistance || 0,
        steps: (opt as any).steps || [], // TransportOption 没有 steps 字段
      }));

      return {
        evidence_id: `transport_${Date.now()}_${originLat}_${originLng}_${destLat}_${destLng}`,
        origin: input.origin,
        destination: input.destination,
        options,
        best_option: options[0],
      };
    } catch (error: any) {
      this.logger.error(`transport.search 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
