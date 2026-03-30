// src/skills/geo/geo-find-nearby-poi.skill.ts
/**
 * tripnara.geo.findNearbyPOI
 * 
 * P0: Geo/Spatial MCP - 查找附近 POI
 * 
 * 功能：带类型/半径/过滤的 POI 查找，统一 PostGIS 访问的安全出口
 * 安全控制：限制最大 radius、返回数量、记录查询日志
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { PlacesService } from '../../places/places.service';
import { PlaceWithDistance } from '../../places/dto/geo-result.dto';
import { PrismaService } from '../../prisma/prisma.service';

export interface GeoFindNearbyPOIInput extends BaseSkillInput {
  /** 位置 */
  location: {
    /** 纬度 */
    lat: number;
    /** 经度 */
    lng: number;
  };
  
  /** 搜索半径（米） */
  radius: number;
  
  /** POI 类别过滤（可选） */
  category?: ('RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL' | 'NATURE' | 'VIEWPOINT' | 'HISTORIC_SITE')[];
  
  /** 额外过滤条件（可选） */
  filters?: {
    /** 最小评分 */
    minRating?: number;
    /** 是否有营业时间信息 */
    hasOpeningHours?: boolean;
    /** 支持的支付方式 */
    paymentMethods?: string[];
  };
  
  /** 返回数量限制（默认 50，最大 100） */
  limit?: number;
}

export interface GeoFindNearbyPOIOutput extends SkillOutput {
  /** POI 列表 */
  pois: Array<{
    /** POI ID */
    id: number;
    /** 名称 */
    name: string;
    /** 中文名称 */
    nameCN: string;
    /** 英文名称（可选） */
    nameEN?: string | null;
    /** 类别 */
    category: string;
    /** 位置 */
    location: {
      lat: number;
      lng: number;
    };
    /** 距离（米） */
    distance: number;
    /** 评分（可选） */
    rating?: number | null;
    /** 地址（可选） */
    address?: string | null;
    /** 是否营业中（可选） */
    isOpen?: boolean;
    /** 元数据（可选） */
    metadata?: Record<string, any>;
  }>;
  
  /** 查询摘要 */
  summary: {
    /** 找到的总数 */
    totalFound: number;
    /** 使用的搜索半径（米） */
    radius: number;
    /** 查询耗时（毫秒） */
    queryTime: number;
  };
}

@Injectable()
export class GeoFindNearbyPOISkill implements Skill<GeoFindNearbyPOIInput, GeoFindNearbyPOIOutput> {
  private readonly logger = new Logger(GeoFindNearbyPOISkill.name);

  /** 最大搜索半径（50km） */
  private readonly MAX_RADIUS = 50 * 1000; // 50km in meters
  
  /** 最大返回数量 */
  private readonly MAX_LIMIT = 100;

  metadata: SkillMetadata = {
    name: 'geo.findNearbyPOI',
    description: '查找附近 POI：带类型/半径/过滤的空间查询，统一 PostGIS 访问的安全出口',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['location', 'radius'],
      typeChecks: {
        location: {
          type: 'object',
        },
        radius: {
          type: 'number',
          min: 0,
          max: 50000, // 最大 50 公里
        },
        limit: {
          type: 'number',
          min: 1,
          max: 100,
        },
      },
    },
  };

  constructor(
    @Optional() private readonly placesService?: PlacesService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    if (!this.placesService) {
      this.logger.warn('PlacesService 未注入，geo.findNearbyPOI 功能将不可用');
    }
    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，位置查询功能将受限');
    }
  }

  async execute(input: GeoFindNearbyPOIInput): Promise<GeoFindNearbyPOIOutput> {
    const startTime = Date.now();
    this.logger.debug(
      `执行 geo.findNearbyPOI: location=(${input.location.lat}, ${input.location.lng}), radius=${input.radius}m`,
    );

    try {
      // 1. 参数验证和安全控制
      const validatedRadius = Math.min(input.radius, this.MAX_RADIUS);
      if (input.radius > this.MAX_RADIUS) {
        this.logger.warn(`搜索半径 ${input.radius}m 超过最大值 ${this.MAX_RADIUS}m，已限制为 ${validatedRadius}m`);
      }

      const validatedLimit = Math.min(input.limit || 50, this.MAX_LIMIT);
      if (input.limit && input.limit > this.MAX_LIMIT) {
        this.logger.warn(`返回数量限制 ${input.limit} 超过最大值 ${this.MAX_LIMIT}，已限制为 ${validatedLimit}`);
      }

      // 2. 验证位置
      if (
        !input.location.lat ||
        !input.location.lng ||
        input.location.lat < -90 ||
        input.location.lat > 90 ||
        input.location.lng < -180 ||
        input.location.lng > 180
      ) {
        throw new Error(`无效的位置坐标: (${input.location.lat}, ${input.location.lng})`);
      }

      if (!this.placesService) {
        throw new Error('PlacesService 未注入，无法执行查询');
      }

      // 3. 执行查询（如果指定了单个类别，使用 PlacesService.findNearby）
      let results: PlaceWithDistance[] = [];

      if (input.category && input.category.length === 1) {
        // 单个类别，使用 PlacesService.findNearby
        results = await this.placesService.findNearby(
          input.location.lat,
          input.location.lng,
          validatedRadius,
          input.category[0] as any,
        );
      } else {
        // 多个类别或无类别，需要扩展 PlacesService 或使用原始查询
        // 暂时使用第一个类别，或使用通用查询
        if (input.category && input.category.length > 0) {
          // 如果有多个类别，暂时只查询第一个（TODO: 扩展 PlacesService 支持多类别）
          this.logger.warn(`多个类别过滤暂不支持，使用第一个类别: ${input.category[0]}`);
          results = await this.placesService.findNearby(
            input.location.lat,
            input.location.lng,
            validatedRadius,
            input.category[0] as any,
          );
        } else {
          // 无类别过滤，查询所有
          results = await this.placesService.findNearby(
            input.location.lat,
            input.location.lng,
            validatedRadius,
          );
        }
      }

      // 4. 应用额外过滤
      let filteredResults = results;

      if (input.filters) {
        filteredResults = results.filter((place) => {
          // 最小评分过滤
          if (input.filters.minRating !== undefined) {
            if (!place.rating || place.rating < input.filters.minRating) {
              return false;
            }
          }

          // 营业时间过滤
          if (input.filters.hasOpeningHours !== undefined) {
            const hasHours = place.status?.hoursToday && place.status.hoursToday !== '休息';
            if (input.filters.hasOpeningHours !== hasHours) {
              return false;
            }
          }

          // 支付方式过滤
          if (input.filters.paymentMethods && input.filters.paymentMethods.length > 0) {
            const placePaymentMethods = place.tags || [];
            const hasRequiredPayment = input.filters.paymentMethods.some((method) =>
              placePaymentMethods.includes(method),
            );
            if (!hasRequiredPayment) {
              return false;
            }
          }

          return true;
        });
      }

      // 5. 限制返回数量
      const limitedResults = filteredResults.slice(0, validatedLimit);

      // 6. 获取位置信息（需要单独查询，因为 PlaceWithDistance 不包含 location）
      const placeIds = limitedResults.map((p) => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();

      if (this.prisma && placeIds.length > 0) {
        // 使用 PostGIS 函数提取经纬度
        const placesWithLocation = await this.prisma.$queryRaw<Array<{
          id: number;
          lat: number;
          lng: number;
        }>>`
          SELECT 
            id,
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ANY(ARRAY[${placeIds.join(',')}]::int[])
        `;

        for (const place of placesWithLocation) {
          locationMap.set(place.id, {
            lat: place.lat,
            lng: place.lng,
          });
        }
      }

      // 7. 转换为输出格式
      const pois = limitedResults.map((place) => {
        const location = locationMap.get(place.id) || { lat: 0, lng: 0 };
        
        return {
          id: place.id,
          name: place.name,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          location,
          distance: place.distance,
          rating: place.rating,
          address: place.address,
          isOpen: place.isOpen,
          metadata: (place as any).metadata,
        };
      });

      // 7. 记录查询日志（用于审计）
      const queryTime = Date.now() - startTime;
      this.logger.debug(
        `geo.findNearbyPOI 查询完成: 找到 ${pois.length} 个 POI，耗时 ${queryTime}ms`,
      );

      return {
        pois,
        summary: {
          totalFound: pois.length,
          radius: validatedRadius,
          queryTime,
        },
      };
    } catch (error: any) {
      this.logger.error(`geo.findNearbyPOI 查询失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
