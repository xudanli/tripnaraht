// src/planning-policy/services/place-to-poi.service.ts

import { Injectable } from '@nestjs/common';
import { Place } from '@prisma/client';
import { Poi, OpeningHours } from '../interfaces/poi.interface';

/**
 * Place 表到 Poi 接口的转换服务
 * 
 * 将数据库 Place 记录转换为 What-If 评估系统需要的 Poi 接口格式
 */
@Injectable()
export class PlaceToPoiService {
  /**
   * 从 PostGIS Point 提取经纬度
   * 
   * 注意：如果 location 是通过 Prisma 查询时已转换的，可能是 { lat, lng } 对象
   * 如果是原始 PostGIS geography，需要通过 SQL 提取
   */
  private extractLatLng(place: Place & { lat?: number; lng?: number }): {
    lat: number;
    lng: number;
  } {
    // 如果查询时已经提取了 lat/lng（通过 SELECT ST_Y, ST_X）
    if (place.lat !== undefined && place.lng !== undefined) {
      return { lat: place.lat, lng: place.lng };
    }

    // 如果是 PostGIS geography Point，需要通过 SQL 提取
    // 这里返回默认值，实际使用时应该在查询时提取
    console.warn(
      `Place ${place.id}: location not extracted, using default (0, 0). Please extract lat/lng in SQL query.`
    );
    return { lat: 0, lng: 0 };
  }

  /**
   * 转换 Place 为 Poi
   * 
   * @param place - Place 记录（可以包含 lat/lng 字段，如果在查询时已提取）
   * @returns Poi 接口对象
   */
  convert(place: Place & { lat?: number; lng?: number }): Poi {
    const metadata = (place.metadata as any) || {};
    const physicalMetadata = (place.physicalMetadata as any) || {};

    // 提取坐标
    const { lat, lng } = this.extractLatLng(place);

    // 转换 openingHours
    const openingHours = this.convertOpeningHours(metadata.openingHours);

    // 从 physicalMetadata 提取游玩时长相关字段
    // physicalMetadata 结构参考：src/places/interfaces/physical-metadata.interface.ts
    const estimatedDurationMin =
      physicalMetadata.estimated_duration_min ??
      physicalMetadata.visitDurationMin ??
      120; // 默认 2 小时

    // 计算游玩时长标准差（如果缺失，使用 25% 方差）
    const visitMinStd =
      physicalMetadata.visit_std_min ??
      physicalMetadata.visitMinStd ??
      estimatedDurationMin * 0.25;

    // 排队时间（可选，默认无排队）
    const queueMinMean =
      physicalMetadata.queue_mean_min ??
      physicalMetadata.queueMinMean ??
      0;
    const queueMinStd =
      physicalMetadata.queue_std_min ??
      physicalMetadata.queueMinStd ??
      (queueMinMean > 0 ? queueMinMean * 0.35 : 0);

    // 可达性字段
    const wheelchairAccess =
      physicalMetadata.wheelchair_access ??
      physicalMetadata.wheelchairAccess ??
      metadata.wheelchairAccessible ??
      false; // 默认 false（保守策略：需要明确标注）

    const stairsRequired =
      physicalMetadata.stairs_required ??
      physicalMetadata.stairsRequired ??
      (physicalMetadata.terrain_type === 'STAIRS_ONLY' ||
        physicalMetadata.terrain_type === 'HILLY') ??
      false;

    const seatingAvailable =
      physicalMetadata.seating_available ??
      physicalMetadata.seatingAvailable ??
      (physicalMetadata.seated_ratio !== undefined &&
        physicalMetadata.seated_ratio > 0.5) ??
      false;

    const restroomNearby =
      physicalMetadata.restroom_nearby ??
      physicalMetadata.restroomNearby ??
      metadata.restroomNearby ??
      false;

    // 天气敏感度（0-3）
    const weatherSensitivity = this.parseWeatherSensitivity(
      metadata.weatherSensitivity ?? physicalMetadata.weather_sensitivity
    );

    // 标签
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

    return {
      id: place.id.toString(), // 或使用 place.uuid，根据业务需求
      name: place.nameCN || place.nameEN || 'Unknown',
      lat,
      lng,
      tags,
      openingHours,
      avgVisitMin: estimatedDurationMin,
      visitMinStd,
      queueMinMean,
      queueMinStd,
      wheelchairAccess,
      stairsRequired,
      seatingAvailable,
      restroomNearby,
      weatherSensitivity,
      crowdKey: metadata.crowdKey || undefined,
    };
  }

  /**
   * 转换 openingHours（从 metadata.openingHours 到 OpeningHours 接口）
   * 
   * 支持多种格式：
   * 1. 标准 OpeningHours 格式（直接返回）
   * 2. 简化格式（如 { mon: "09:00-18:00" }）
   * 3. 字符串格式（需要解析）
   */
  private convertOpeningHours(
    raw: any
  ): OpeningHours | undefined {
    if (!raw) return undefined;

    // 如果已经是标准格式，直接返回
    if (raw.windows && Array.isArray(raw.windows)) {
      return raw as OpeningHours;
    }

    // 尝试从简化格式转换（如 { mon: "09:00-18:00", tue: "09:00-18:00", ... }）
    if (typeof raw === 'object' && !Array.isArray(raw.windows)) {
      const windows: OpeningHours['windows'] = [];
      const dayMap: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      };

      for (const [key, value] of Object.entries(raw)) {
        if (key in dayMap && typeof value === 'string') {
          const [start, end] = value.split('-');
          if (start && end) {
            windows.push({
              dayOfWeek: dayMap[key],
              start: start.trim(),
              end: end.trim(),
            });
          }
        }
      }

      if (windows.length > 0) {
        return {
          windows,
          lastEntry: raw.lastEntry,
          lastEntryByDay: raw.lastEntryByDay,
          closedDates: raw.closedDates,
          timezone: raw.timezone,
        };
      }
    }

    // 如果无法转换，返回 undefined
    console.warn('无法转换 openingHours 格式:', raw);
    return undefined;
  }

  /**
   * 解析天气敏感度（支持多种格式）
   */
  private parseWeatherSensitivity(value: any): 0 | 1 | 2 | 3 | undefined {
    if (value === undefined || value === null) return undefined;

    if (typeof value === 'number') {
      if (value >= 0 && value <= 3) {
        return value as 0 | 1 | 2 | 3;
      }
    }

    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      if (normalized === 'none' || normalized === '0') return 0;
      if (normalized === 'low' || normalized === '1') return 1;
      if (normalized === 'medium' || normalized === '2') return 2;
      if (normalized === 'high' || normalized === '3') return 3;
    }

    return undefined;
  }

  /**
   * 批量转换
   */
  convertBatch(
    places: (Place & { lat?: number; lng?: number })[]
  ): Poi[] {
    return places.map((place) => this.convert(place));
  }
}

/**
 * 便捷函数：在查询 Place 时提取 lat/lng
 * 
 * 使用示例：
 * ```typescript
 * const places = await prisma.$queryRaw<Array<Place & { lat: number; lng: number }>>`
 *   SELECT 
 *     p.*,
 *     ST_Y(p.location::geometry) AS lat,
 *     ST_X(p.location::geometry) AS lng
 *   FROM "Place" p
 *   WHERE p.id IN (${Prisma.join(placeIds)})
 * `;
 * ```
 */
export function createPlaceQueryWithLatLng(placeIds: number[]) {
  return `
    SELECT 
      p.*,
      ST_Y(p.location::geometry) AS lat,
      ST_X(p.location::geometry) AS lng
    FROM "Place" p
    WHERE p.id IN (${placeIds.join(',')})
  `;
}
