// src/places/services/nature-poi.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  IcelandNaturePoi,
  IcelandNaturePoiWithNara,
  DataSource,
  Coordinates,
} from '../interfaces/nature-poi.interface';
import { randomUUID } from 'crypto';
import { validateGeoJSON, validateNaturePoiProperties } from '../utils/geojson-validator.util';

/**
 * 自然 POI 服务
 * 
 * 功能：
 * 1. 从 GeoJSON 导入自然 POI 数据
 * 2. 查询自然 POI（按区域、类别等）
 * 3. 将自然 POI 转换为 Place 记录
 * 4. 管理 NARA 提示信息
 */
@Injectable()
export class NaturePoiService {
  private readonly logger = new Logger(NaturePoiService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 从 GeoJSON 导入自然 POI
   * 
   * @param geojson GeoJSON FeatureCollection
   * @param source 数据来源
   * @param countryCode 国家代码
   * @param cityId 城市 ID（可选）
   * @returns 导入结果统计
   */
  async importFromGeoJSON(
    geojson: {
      type: 'FeatureCollection';
      features: Array<{
        type: 'Feature';
        geometry: {
          type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString';
          coordinates: number[] | number[][] | number[][][];
        };
        properties: Record<string, any>;
      }>;
    },
    source: DataSource,
    countryCode: string,
    cityId?: number,
    validate: boolean = true
  ): Promise<{
    total: number;
    created: number;
    skipped: number;
    errors: number;
    results: Array<{
      name: string;
      status: 'created' | 'skipped' | 'error';
      error?: string;
    }>;
    validation?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
  }> {
    // 验证 GeoJSON 格式
    let validationResult;
    if (validate) {
      validationResult = validateGeoJSON(geojson);
      if (!validationResult.valid) {
        this.logger.warn('GeoJSON 验证失败:', validationResult.errors);
        // 继续处理，但记录错误
      }
      if (validationResult.warnings.length > 0) {
        this.logger.warn('GeoJSON 验证警告:', validationResult.warnings);
      }
    }
    const results: Array<{
      name: string;
      status: 'created' | 'skipped' | 'error';
      error?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const feature of geojson.features) {
      try {
        // 验证 properties（可选）
        if (validate) {
          const propValidation = validateNaturePoiProperties(feature.properties);
          if (!propValidation.valid && propValidation.errors.length > 0) {
            this.logger.warn(
              `Feature ${results.length}: Properties 验证失败`,
              propValidation.errors
            );
          }
        }

        // 解析坐标
        const coordinates = this.extractCoordinates(feature.geometry);
        if (!coordinates) {
          errors++;
          results.push({
            name: feature.properties.name || 'Unknown',
            status: 'error',
            error: '无法解析坐标',
          });
          continue;
        }

        // 提取名称
        const name = this.extractName(feature.properties);
        const poiName = {
          primary: name.primary,
          en: name.en,
          zh: name.zh,
          local: name.local,
        };

        // 构建自然 POI 对象
        const naturePoi: IcelandNaturePoi = {
          id: randomUUID(),
          externalId: feature.properties.id?.toString() || feature.properties.OBJECTID?.toString(),
          externalSource: source,
          geometryType: this.mapGeometryType(feature.geometry.type),
          coordinates,
          name: poiName,
          countryCode,
          mainCategory: 'nature',
          subCategory: this.mapSubCategory(feature.properties) as any,
          tags: this.extractTags(feature.properties),
          rawProperties: feature.properties,
          // 扩展字段
          elevationMeters: feature.properties.elevation || feature.properties.ELEVATION,
          bestSeasons: this.extractBestSeasons(feature.properties) as any,
          accessType: this.extractAccessType(feature.properties) as any,
          trailDifficulty: this.extractTrailDifficulty(feature.properties) as any,
          requiresGuide: feature.properties.requiresGuide || feature.properties.REQUIRES_GUIDE === 'Y',
          hazardLevel: this.extractHazardLevel(feature.properties) as any,
          safetyNotes: this.extractSafetyNotes(feature.properties),
          lastEruptionYear: feature.properties.lastEruptionYear || feature.properties.LAST_ERUPT,
          isActiveVolcano: feature.properties.isActiveVolcano || feature.properties.STATUS === 'active',
          protectedAreaName: feature.properties.protectedAreaName || feature.properties.PROTECTED_AREA,
        };

        // 检查是否已存在
        const existing = await this.findExistingPoi(naturePoi);
        if (existing) {
          skipped++;
          results.push({
            name: poiName.primary,
            status: 'skipped',
          });
          continue;
        }

        // 转换为 Place 并保存
        await this.saveNaturePoiAsPlace(naturePoi, cityId);

        created++;
        results.push({
          name: poiName.primary,
          status: 'created',
        });
      } catch (error: any) {
        errors++;
        results.push({
          name: feature.properties.name || 'Unknown',
          status: 'error',
          error: error.message,
        });
        this.logger.error(`导入 POI 失败: ${error.message}`, error.stack);
      }
    }

    return {
      total: geojson.features.length,
      created,
      skipped,
      errors,
      results,
      validation: validationResult,
    };
  }

  /**
   * 查询自然 POI（按区域）
   */
  async findNaturePoisByArea(
    center: Coordinates,
    radiusMeters: number = 5000,
    subCategory?: string
  ): Promise<IcelandNaturePoi[]> {
    // 构建查询条件
    const categoryFilter = subCategory
      ? Prisma.sql`AND metadata->>'subCategory' = ${subCategory}`
      : Prisma.sql``;

    // 查询数据库
    const places = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      metadata: any;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        metadata,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE 
        category = 'ATTRACTION'
        AND metadata->>'mainCategory' = 'nature'
        AND location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography,
          ${radiusMeters}
        )
        ${categoryFilter}
      ORDER BY ST_Distance(
        location,
        ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography
      ) ASC
      LIMIT 100;
    `;

    // 转换为自然 POI 对象
    return places.map(place => this.placeToNaturePoi(place));
  }

  /**
   * 查询自然 POI（按类别）
   */
  async findNaturePoisByCategory(
    subCategory: string,
    countryCode?: string,
    limit: number = 100
  ): Promise<IcelandNaturePoi[]> {
    const countryFilter = countryCode
      ? Prisma.sql`AND metadata->>'countryCode' = ${countryCode}`
      : Prisma.sql``;

    const places = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      metadata: any;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        metadata,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE 
        category = 'ATTRACTION'
        AND metadata->>'mainCategory' = 'nature'
        AND metadata->>'subCategory' = ${subCategory}
        AND location IS NOT NULL
        ${countryFilter}
      LIMIT ${limit};
    `;

    return places.map(place => this.placeToNaturePoi(place));
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 从几何体提取坐标
   */
  private extractCoordinates(geometry: any): Coordinates | null {
    if (geometry.type === 'Point') {
      const [lng, lat] = geometry.coordinates;
      return { lat, lng };
    }

    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      // 计算多边形中心点（简化版：使用第一个点的坐标）
      const coords = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates[0][0];
      
      if (coords && coords.length > 0) {
        const [lng, lat] = coords[0];
        return { lat, lng };
      }
    }

    return null;
  }

  /**
   * 提取名称
   */
  private extractName(properties: Record<string, any>): {
    primary: string;
    en?: string;
    zh?: string;
    local?: string;
  } {
    return {
      primary: properties.name || properties.NAME || properties.name_en || 'Unnamed',
      en: properties.name_en || properties.NAME_EN || properties.name,
      zh: properties.name_zh || properties.NAME_ZH,
      local: properties.name_local || properties.NAME_LOCAL || properties.name_is,
    };
  }

  /**
   * 映射几何类型
   */
  private mapGeometryType(type: string): 'point' | 'polygon' | 'line' {
    if (type === 'Point') return 'point';
    if (type === 'Polygon' || type === 'MultiPolygon') return 'polygon';
    if (type === 'LineString' || type === 'MultiLineString') return 'line';
    return 'point';
  }

  /**
   * 映射子类别
   */
  private mapSubCategory(properties: Record<string, any>): string {
    // 尝试从多个可能的字段提取
    const category = properties.subCategory
      || properties.SUB_CATEGORY
      || properties.type
      || properties.TYPE
      || properties.category
      || properties.CATEGORY
      || 'other';

    // 标准化类别名称
    const normalized = category.toLowerCase().replace(/[_\s]/g, '_');
    
    // 映射常见变体
    const mapping: Record<string, string> = {
      'volcano': 'volcano',
      'volcanic': 'volcano',
      'lava_field': 'lava_field',
      'lava': 'lava_field',
      'geothermal': 'geothermal_area',
      'geothermal_area': 'geothermal_area',
      'hot_spring': 'hot_spring',
      'hotspring': 'hot_spring',
      'glacier': 'glacier',
      'glacier_lagoon': 'glacier_lagoon',
      'waterfall': 'waterfall',
      'canyon': 'canyon',
      'crater_lake': 'crater_lake',
      'black_sand_beach': 'black_sand_beach',
      'sea_cliff': 'sea_cliff',
      'national_park': 'national_park',
      'nature_reserve': 'nature_reserve',
      'viewpoint': 'viewpoint',
      'cave': 'cave',
      'coastline': 'coastline',
    };

    return mapping[normalized] || 'other';
  }

  /**
   * 提取标签
   */
  private extractTags(properties: Record<string, any>): string[] {
    if (Array.isArray(properties.tags)) {
      return properties.tags;
    }
    if (typeof properties.tags === 'string') {
      return properties.tags.split(',').map((t: string) => t.trim());
    }
    return [];
  }

  /**
   * 提取最佳季节
   */
  private extractBestSeasons(properties: Record<string, any>): ('spring' | 'summer' | 'autumn' | 'winter')[] | undefined {
    const seasons = properties.bestSeasons || properties.BEST_SEASONS;
    if (Array.isArray(seasons)) {
      return seasons.filter((s: string) => 
        ['spring', 'summer', 'autumn', 'winter'].includes(s.toLowerCase())
      ) as ('spring' | 'summer' | 'autumn' | 'winter')[];
    }
    return undefined;
  }

  /**
   * 提取访问方式
   */
  private extractAccessType(properties: Record<string, any>): ('drive' | 'hike' | '4x4' | 'guided_only' | 'boat' | 'unknown') | undefined {
    const accessType = properties.accessType || properties.ACCESS_TYPE;
    if (!accessType) return undefined;
    const normalized = accessType.toLowerCase().replace(/[_\s]/g, '_');
    const validTypes = ['drive', 'hike', '4x4', 'guided_only', 'boat', 'unknown'];
    if (validTypes.includes(normalized)) {
      return normalized as any;
    }
    return 'unknown';
  }

  /**
   * 提取徒步难度
   */
  private extractTrailDifficulty(properties: Record<string, any>): ('easy' | 'moderate' | 'hard' | 'expert' | 'unknown') | undefined {
    const difficulty = properties.trailDifficulty || properties.TRAIL_DIFFICULTY;
    if (!difficulty) return undefined;
    const normalized = difficulty.toLowerCase();
    const validTypes = ['easy', 'moderate', 'hard', 'expert', 'unknown'];
    if (validTypes.includes(normalized)) {
      return normalized as any;
    }
    return 'unknown';
  }

  /**
   * 提取危险等级
   */
  private extractHazardLevel(properties: Record<string, any>): ('low' | 'medium' | 'high' | 'extreme' | 'unknown') | undefined {
    const level = properties.hazardLevel || properties.HAZARD_LEVEL;
    if (!level) return undefined;
    const normalized = level.toLowerCase();
    const validTypes = ['low', 'medium', 'high', 'extreme', 'unknown'];
    if (validTypes.includes(normalized)) {
      return normalized as any;
    }
    return 'unknown';
  }

  /**
   * 提取安全提示
   */
  private extractSafetyNotes(properties: Record<string, any>): string[] | undefined {
    if (Array.isArray(properties.safetyNotes)) {
      return properties.safetyNotes;
    }
    if (typeof properties.safetyNotes === 'string') {
      return [properties.safetyNotes];
    }
    return undefined;
  }

  /**
   * 查找已存在的 POI
   */
  private async findExistingPoi(poi: IcelandNaturePoi): Promise<any> {
    // 通过 externalId 查找
    if (poi.externalId) {
      const existing = await this.prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Place"
        WHERE metadata->>'externalId' = ${poi.externalId}
          AND metadata->>'externalSource' = ${poi.externalSource}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return existing[0];
      }
    }

    // 通过名称和坐标查找（100 米内）
    const existing = await this.prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Place"
      WHERE "nameEN" = ${poi.name.en || poi.name.primary}
        AND location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${poi.coordinates.lng}, ${poi.coordinates.lat}), 4326)::geography,
          100
        )
      LIMIT 1
    `;

    return existing.length > 0 ? existing[0] : null;
  }

  /**
   * 将自然 POI 保存为 Place
   */
  private async saveNaturePoiAsPlace(
    poi: IcelandNaturePoi,
    cityId?: number
  ): Promise<void> {
    // 准备 metadata
    const metadata = {
      mainCategory: poi.mainCategory,
      subCategory: poi.subCategory,
      externalSource: poi.externalSource,
      externalId: poi.externalId,
      countryCode: poi.countryCode,
      region: poi.region,
      tags: poi.tags,
      elevationMeters: poi.elevationMeters,
      typicalStay: poi.typicalStay,
      bestSeasons: poi.bestSeasons,
      bestTimeOfDay: poi.bestTimeOfDay,
      accessType: poi.accessType,
      trailDifficulty: poi.trailDifficulty,
      requiresGuide: poi.requiresGuide,
      hazardLevel: poi.hazardLevel,
      safetyNotes: poi.safetyNotes,
      lastEruptionYear: poi.lastEruptionYear,
      isActiveVolcano: poi.isActiveVolcano,
      protectedAreaName: poi.protectedAreaName,
      rawProperties: poi.rawProperties,
    };

    // 从自然 POI metadata 生成 physicalMetadata
    const { PhysicalMetadataGenerator } = await import('../utils/physical-metadata-generator.util');
    const physicalMetadata = PhysicalMetadataGenerator.generateFromNaturePoi(metadata);

    // 创建 Place 记录
    const place = await this.prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: poi.name.zh || poi.name.primary,
        nameEN: poi.name.en || poi.name.primary,
        category: 'ATTRACTION',
        cityId: cityId || null,
        address: poi.rawProperties?.address || null,
        metadata: metadata as any,
        physicalMetadata: physicalMetadata as any,
        updatedAt: new Date(),
      } as any,
    });

    // 更新地理位置
    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${poi.coordinates.lng}, ${poi.coordinates.lat}), 4326)
      WHERE id = ${place.id}
    `;
  }

  /**
   * 将 Place 转换为自然 POI
   */
  private placeToNaturePoi(place: {
    id: number;
    nameCN: string;
    nameEN: string | null;
    metadata: any;
    lat: number;
    lng: number;
  }): IcelandNaturePoi {
    const metadata = place.metadata || {};

    // 坐标已在查询时提取
    const coordinates: Coordinates = { lat: place.lat, lng: place.lng };

    return {
      id: place.id.toString(),
      externalId: metadata.externalId,
      externalSource: metadata.externalSource as DataSource,
      geometryType: 'point',
      coordinates,
      name: {
        primary: place.nameEN || place.nameCN,
        en: place.nameEN || undefined,
        zh: place.nameCN || undefined,
      },
      countryCode: metadata.countryCode || 'IS',
      region: metadata.region,
      mainCategory: 'nature',
      subCategory: metadata.subCategory || 'other',
      tags: metadata.tags || [],
      rawProperties: metadata.rawProperties,
      elevationMeters: metadata.elevationMeters,
      typicalStay: metadata.typicalStay,
      bestSeasons: metadata.bestSeasons,
      bestTimeOfDay: metadata.bestTimeOfDay,
      accessType: metadata.accessType,
      trailDifficulty: metadata.trailDifficulty,
      requiresGuide: metadata.requiresGuide,
      hazardLevel: metadata.hazardLevel,
      safetyNotes: metadata.safetyNotes,
      lastEruptionYear: metadata.lastEruptionYear,
      isActiveVolcano: metadata.isActiveVolcano,
      protectedAreaName: metadata.protectedAreaName,
    };
  }
}
