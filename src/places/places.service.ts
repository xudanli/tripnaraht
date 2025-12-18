// src/places/places.service.ts
import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { VectorSearchService } from './services/vector-search.service';
import { PlaceWithDistance, RawPlaceResult } from './dto/geo-result.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { PlaceMetadata } from './interfaces/place-metadata.interface';
import { randomUUID } from 'crypto';
import { AmapPOIService } from './services/amap-poi.service';
import { GooglePlacesService, GooglePlacesPOI } from './services/google-places.service';
// 保持向后兼容的类型别名
type OverpassPOI = GooglePlacesPOI;
import { PhysicalMetadataGenerator } from './utils/physical-metadata-generator.util';
import { EmbeddingService } from './services/embedding.service';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private prisma: PrismaService,
    private amapPOIService: AmapPOIService,
    private googlePlacesService: GooglePlacesService,
    @Optional() @Inject(VectorSearchService) private vectorSearchService?: VectorSearchService,
    @Optional() @Inject(EmbeddingService) private embeddingService?: EmbeddingService
  ) {}

  /**
   * 构建搜索文本（用于生成 embedding）
   */
  private buildSearchText(place: {
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    metadata?: any;
  }): string {
    const parts: string[] = [];

    // 名称
    if (place.nameCN) parts.push(place.nameCN);
    if (place.nameEN) parts.push(place.nameEN);

    // 地址
    if (place.address) parts.push(place.address);

    // 从 metadata 中提取
    const metadata = place.metadata as any;
    if (metadata?.description) parts.push(metadata.description);
    
    if (metadata?.tags) {
      if (Array.isArray(metadata.tags)) {
        parts.push(metadata.tags.join(' '));
      }
    }
    
    if (metadata?.reviews) {
      // 提取前3条评论的关键词
      const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 3) : [];
      reviews.forEach((review: any) => {
        if (review.text) {
          // 只提取评论的前100个字符，避免文本过长
          parts.push(review.text.substring(0, 100));
        }
      });
    }

    return parts.join(' ');
  }

  /**
   * 更新 Place 的 embedding（如果文本信息发生变化）
   * 
   * 注意：这是一个异步操作，可能会失败，但不应该阻塞 Place 的更新
   */
  private async updatePlaceEmbedding(placeId: number, place: {
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    metadata?: any;
  }): Promise<void> {
    if (!this.embeddingService) {
      this.logger.debug(`EmbeddingService 未注入，跳过更新 embedding`);
      return;
    }

    try {
      // 构建搜索文本
      const searchText = this.buildSearchText(place);
      
      if (!searchText || searchText.trim().length === 0) {
        this.logger.debug(`Place ${placeId} 没有可用的文本，跳过 embedding 更新`);
        return;
      }

      // 生成 embedding
      const embedding = await this.embeddingService.generateEmbedding(searchText);

      // 检查是否为降级后的零向量
      const isZeroVector = embedding.every(v => v === 0);
      if (isZeroVector) {
        this.logger.warn(`Place ${placeId} embedding 生成失败（零向量），跳过更新`);
        return;
      }

      // 更新数据库
      const embeddingStr = `[${embedding.join(',')}]`;
      await this.prisma.$executeRawUnsafe(
        `UPDATE "Place" SET embedding = $1::vector WHERE id = $2`,
        embeddingStr,
        placeId
      );

      this.logger.debug(`Place ${placeId} embedding 已更新`);
    } catch (error: any) {
      // 不抛出错误，只记录日志，避免影响 Place 的更新
      this.logger.warn(`更新 Place ${placeId} embedding 失败: ${error?.message || String(error)}`);
    }
  }

  /**
   * 创建地点
   */
  async createPlace(dto: CreatePlaceDto) {
    const { lat, lng, ...rest } = dto;
    
    // 自动生成 physicalMetadata
    const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
      dto.category,
      dto.metadata as any
    );
    
    // ⚠️ 注意：Prisma 不支持直接写入 Unsupported 字段
    // 我们通常创建一个带有经纬度的 Place，然后用 raw SQL 更新它的 location，
    // 或者直接使用 $executeRaw 进行插入。
    // 简便方法：先创建基础信息
    const place = await this.prisma.place.create({
      data: {
        ...rest,
        uuid: randomUUID(),
        metadata: dto.metadata as any, // 存入 JSON
        physicalMetadata: physicalMetadata as any, // 自动生成的体力消耗元数据
        updatedAt: new Date(),
      } as any, // Use UncheckedCreateInput to allow direct foreign key assignment
    });

    // 更新地理位置 (使用 PostGIS 函数 ST_MakePoint)
    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      WHERE id = ${place.id}
    `;

    // 异步生成 embedding（不阻塞创建操作）
    this.updatePlaceEmbedding(place.id, {
      nameCN: place.nameCN,
      nameEN: place.nameEN,
      address: place.address,
      metadata: dto.metadata,
    }).catch(error => {
      this.logger.warn(`创建 Place ${place.id} 后生成 embedding 失败: ${error?.message || String(error)}`);
    });

    return place;
  }

  /**
   * 封装好的"查找附近"方法
   * 看起来就像普通的 ORM 方法一样清爽
   */
  async findNearby(
    lat: number, 
    lng: number, 
    radius: number = 2000, // 默认 2km
    category?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL' // 可选过滤
  ): Promise<PlaceWithDistance[]> {
    
    // 1. 动态构建 SQL 条件 (如果需要复杂的动态查询，这里可以拼接数组)
    // 注意：Prisma.sql 用于安全拼接
    const categoryFilter = category 
      ? Prisma.sql`AND category = ${category}::"PlaceCategory"` 
      : Prisma.sql``;

    // 2. 执行 Raw SQL
    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        id, 
        "nameCN", 
        "nameEN",
        category,
        metadata,
        address,
        rating,
        -- 使用 PostGIS 计算球面距离 (单位：米)
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters
      FROM "Place"
      WHERE 
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radius}
        )
        ${categoryFilter} -- 注入上面的动态条件
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;

    // 3. 数据清洗 (Mapping)
    // 将数据库的原始 JSONB 转换为前端友好的格式
    return rawResults.map((row) => this.mapToDto(row));
  }

  /**
   * 查找附近支持特定支付方式的餐厅
   */
  async findNearbyRestaurants(
    lat: number, 
    lng: number, 
    radiusMeters: number = 1000,
    paymentMethod?: string
  ): Promise<PlaceWithDistance[]> {
    // 构建支付方式过滤条件
    const paymentFilter = paymentMethod
      ? Prisma.sql`AND metadata->'facilities'->'payment' ? ${paymentMethod}`
      : Prisma.sql``;

    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        id, "nameCN", "nameEN", metadata, address, rating,
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters,
        category
      FROM "Place"
      WHERE 
        -- 1. 地理筛选
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radiusMeters}
        )
        AND
        -- 2. 类别筛选
        category = 'RESTAURANT'
        ${paymentFilter}
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;

    return rawResults.map((row) => this.mapToDto(row));
  }

  /**
   * 数据映射：将数据库原始结果转换为 DTO
   */
  private mapToDto(row: RawPlaceResult): PlaceWithDistance {
    const meta = row.metadata as PlaceMetadata;
    
    // 1. 获取今天是星期几 (店铺当地时间)
    // 假设店铺都在日本 (或者从 row.city.timezone 获取)
    const timezone = meta?.timezone || 'Asia/Tokyo'; 
    const todayHours = OpeningHoursUtil.getTodayHours(meta, timezone);
    
    // 2. 计算状态
    const isOpen = OpeningHoursUtil.isOpenNow(todayHours, timezone);
    
    // 3. 显示名称：优先使用 nameEN，如果没有则使用 nameCN
    const displayName = row.nameEN || row.nameCN;
    
    return {
      id: row.id,
      name: displayName, // 显示名称（优先 nameEN）
      nameCN: row.nameCN,
      nameEN: row.nameEN,
      category: row.category,
      distance: Math.round(row.distance_meters), // 取整
      address: row.address,
      rating: row.rating,
      // 提取 JSONB 里的关键信息到顶层，方便前端直接用
      isOpen: isOpen,
      tags: meta?.facilities?.payment || [],
      status: {
        isOpen: isOpen,
        text: isOpen ? '营业中' : '已打烊',
        hoursToday: todayHours || '休息',
      }
    };
  }

  /**
   * 一个辅助函数示例：判断当前是否营业
   */
  private checkIfOpen(openingHours: any): boolean {
    // 这里写解析 "Mon-Fri 09:00-18:00" 的逻辑
    return true; // 占位
  }

  /**
   * 从高德地图获取景点详细信息并更新
   * 
   * @param placeId 地点 ID
   * @returns 更新后的地点信息
   */
  async enrichPlaceFromAmap(placeId: number): Promise<any> {
    // 获取地点信息
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      include: { city: true },
    });

    if (!place) {
      throw new Error(`地点 ${placeId} 不存在`);
    }

    if (place.category !== 'ATTRACTION') {
      throw new Error('此接口仅支持景点（ATTRACTION）类别');
    }

    // 提取坐标
    const location = (place as any).location;
    if (!location) {
      throw new Error('地点缺少坐标信息');
    }

    // 解析坐标（PostGIS POINT 格式）
    const coords = this.extractCoordinates(location);
    if (!coords) {
      throw new Error('无法解析坐标信息');
    }

    // 调用高德 POI 服务获取详细信息
    const poiData = await this.amapPOIService.getPOIDetails(
      place.nameCN, // 使用 nameCN 作为搜索关键词
      coords.lat,
      coords.lng
    );

    if (!poiData) {
      throw new Error('未从高德地图获取到 POI 信息');
    }

    // 更新 metadata（使用新的结构化格式）
    const currentMetadata = (place.metadata as any) || {};
    const updatedMetadata: any = {
      ...currentMetadata,
      // 基础结构字段（新格式）
      basic: {
        ...currentMetadata.basic,
        // 开放时间（原始字符串 + 结构化）
        openingHours: poiData.openingHours || currentMetadata.basic?.openingHours,
        openingHoursStructured: poiData.openingHoursStructured || currentMetadata.basic?.openingHoursStructured,
        // 门票价格（原始字符串 + 结构化）
        ticketPrice: poiData.ticketPrice || currentMetadata.basic?.ticketPrice,
        ticketPriceStructured: poiData.ticketPriceStructured || currentMetadata.basic?.ticketPriceStructured,
        // 联系方式
        contact: {
          ...currentMetadata.basic?.contact,
          phone: poiData.tel || currentMetadata.basic?.contact?.phone,
          email: poiData.email || currentMetadata.basic?.contact?.email,
          website: poiData.website || currentMetadata.basic?.contact?.website,
        },
        // 官方网址
        officialWebsite: poiData.website || currentMetadata.basic?.officialWebsite,
        // 类型
        type: poiData.type || currentMetadata.basic?.type,
      },
      // 向后兼容字段（保留旧格式）
      openingHours: poiData.openingHours 
        ? this.parseOpeningHours(poiData.openingHours)
        : currentMetadata.openingHours,
      ticketPrice: poiData.ticketPrice || currentMetadata.ticketPrice,
      type: poiData.type || currentMetadata.type,
      highlights: poiData.highlights || currentMetadata.highlights,
      interestDimensions: poiData.interestDimensions || currentMetadata.interestDimensions,
      amapId: poiData.amapId || currentMetadata.amapId,
      contact: {
        ...currentMetadata.contact,
        phone: poiData.tel || currentMetadata.contact?.phone,
        email: poiData.email || currentMetadata.contact?.email,
        website: poiData.website || currentMetadata.contact?.website,
      },
      address: poiData.address || place.address,
      lastEnrichedAt: new Date().toISOString(),
    };

    // 检查是否有影响 embedding 的字段发生变化
    const textFieldsChanged = 
      (poiData.address && poiData.address !== place.address) ||
      (updatedMetadata.description && updatedMetadata.description !== currentMetadata?.description) ||
      (updatedMetadata.tags && JSON.stringify(updatedMetadata.tags) !== JSON.stringify(currentMetadata?.tags));

    // 更新数据库
    const updated = await this.prisma.place.update({
      where: { id: placeId },
      data: {
        metadata: updatedMetadata as any,
        address: poiData.address || place.address,
        updatedAt: new Date(),
      },
    });

    // 如果文本信息发生变化，异步更新 embedding
    if (textFieldsChanged) {
      this.logger.debug(`Place ${placeId} 文本信息已更新，触发 embedding 更新`);
      this.updatePlaceEmbedding(placeId, {
        nameCN: updated.nameCN,
        nameEN: updated.nameEN,
        address: updated.address,
        metadata: updatedMetadata,
      }).catch(error => {
        this.logger.warn(`更新 Place ${placeId} embedding 失败: ${error?.message || String(error)}`);
      });
    }

    return updated;
  }

  /**
   * 批量更新景点信息
   * 
   * @param placeIds 地点 ID 列表（可选，如果不提供则更新所有景点）
   * @param batchSize 批次大小
   * @param delay 批次间延迟（毫秒）
   */
  async batchEnrichPlacesFromAmap(
    placeIds?: number[],
    batchSize: number = 10,
    delay: number = 200
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: Array<{
      placeId: number;
      name: string;
      status: 'success' | 'failed';
      error?: string;
    }>;
  }> {
    // 获取要更新的地点列表
    const places = placeIds
      ? await this.prisma.place.findMany({
          where: {
            id: { in: placeIds },
            category: 'ATTRACTION',
          },
          include: { city: true },
        })
      : await this.prisma.place.findMany({
          where: { category: 'ATTRACTION' },
          include: { city: true },
        });

    const results: Array<{
      placeId: number;
      name: string;
      status: 'success' | 'failed';
      error?: string;
    }> = [];

    let success = 0;
    let failed = 0;

    // 分批处理
    for (let i = 0; i < places.length; i += batchSize) {
      const batch = places.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (place) => {
          try {
            await this.enrichPlaceFromAmap(place.id);
            return {
              placeId: place.id,
              name: place.nameEN || place.nameCN,
              status: 'success' as const,
            };
          } catch (error: any) {
            return {
              placeId: place.id,
              name: place.nameEN || place.nameCN,
              status: 'failed' as const,
              error: error.message,
            };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.status === 'success') {
            success++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      }

      // 批次间延迟
      if (i + batchSize < places.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      total: places.length,
      success,
      failed,
      results,
    };
  }

  /**
   * 提取坐标（从 PostGIS POINT 格式）
   */
  private extractCoordinates(location: any): { lat: number; lng: number } | null {
    if (!location) return null;

    if (typeof location === 'string') {
      const match = location.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
        return { lat, lng };
      }
    }

    if (typeof location === 'object') {
      if (location.coordinates) {
        return { lng: location.coordinates[0], lat: location.coordinates[1] };
      }
      if (location.lat && location.lng) {
        return { lat: location.lat, lng: location.lng };
      }
    }

    return null;
  }

  /**
   * 解析开放时间字符串
   * 
   * 高德返回的格式示例：
   * "周一至周五:08:30-17:30(延时服务时间:12:00-13:30)；周六延时服务时间:09:00-13:00(法定节假日除外)"
   */
  private parseOpeningHours(businessTime: string): PlaceMetadata['openingHours'] {
    if (!businessTime) return undefined;

    const result: PlaceMetadata['openingHours'] = {};

    // 简单的解析逻辑（可以根据实际格式优化）
    // 提取工作日和周末的时间
    const weekdayMatch = businessTime.match(/周一至周五[：:]([^；;]+)/);
    const weekendMatch = businessTime.match(/周六[^：:]*[：:]([^；;]+)/);

    if (weekdayMatch) {
      const timeRange = weekdayMatch[1].split(/[（(]/)[0].trim();
      result.weekday = timeRange;
      // 也可以解析为 mon-fri
      const [start, end] = timeRange.split(/[-~]/).map(t => t.trim());
      if (start && end) {
        result.mon = `${start}-${end}`;
        result.tue = `${start}-${end}`;
        result.wed = `${start}-${end}`;
        result.thu = `${start}-${end}`;
        result.fri = `${start}-${end}`;
      }
    }

    if (weekendMatch) {
      const timeRange = weekendMatch[1].split(/[（(]/)[0].trim();
      result.weekend = timeRange;
      // 也可以解析为 sat-sun
      const [start, end] = timeRange.split(/[-~]/).map(t => t.trim());
      if (start && end) {
        result.sat = `${start}-${end}`;
        result.sun = `${start}-${end}`;
      }
    }

    // 如果无法解析，保存原始字符串
    if (!result.weekday && !result.weekend) {
      result.weekday = businessTime;
    }

    return result;
  }

  /**
   * 从 Google Places API 获取指定国家的景点数据
   * 
   * @param countryCode ISO 3166-1 国家代码（如 'US' 表示美国）
   * @param tourismTypes 旅游类型过滤（可选，如 ['attraction', 'viewpoint', 'museum']）
   * @returns 景点列表
   */
  async fetchAttractionsFromOverpass(
    countryCode: string,
    tourismTypes?: string[]
  ): Promise<OverpassPOI[]> {
    return this.googlePlacesService.fetchAttractionsByCountry(countryCode, tourismTypes);
  }

  /**
   * 从 Overpass API 获取冰岛景点并保存到数据库
   * 
   * @param tourismTypes 旅游类型过滤（可选）
   * @param cityId 城市 ID（可选，如果不提供则尝试查找或创建冰岛城市）
   * @returns 保存结果统计
   */
  async importIcelandAttractionsFromOverpass(
    tourismTypes?: string[],
    cityId?: number
  ): Promise<{
    total: number;
    created: number;
    skipped: number;
    errors: number;
    results: Array<{
      osmId: number;
      name: string;
      status: 'created' | 'skipped' | 'error';
      error?: string;
    }>;
  }> {
    // 1. 获取或创建冰岛城市
    let icelandCityId = cityId;
    if (!icelandCityId) {
      // 查找冰岛城市（通常冰岛只有一个主要城市记录，或者可以创建一个通用记录）
      let city = await this.prisma.city.findFirst({
        where: { countryCode: 'IS' },
      });

      if (!city) {
        // 创建冰岛城市记录
        city = await this.prisma.city.create({
          data: {
            name: 'Iceland',
            countryCode: 'IS',
          },
        });
      }

      icelandCityId = city.id;
    }

    // 2. 从 Google Places 获取景点数据
    const pois = await this.googlePlacesService.fetchAttractionsByCountry('IS', tourismTypes);

    const results: Array<{
      osmId: number;
      name: string;
      status: 'created' | 'skipped' | 'error';
      error?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // 3. 批量保存到数据库
    for (const poi of pois) {
      try {
        // 检查是否已存在（通过 OSM ID 或名称+坐标）
        // 使用 raw SQL 查询 JSONB 字段
        const existingByOsmId = await this.prisma.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM "Place"
          WHERE metadata->>'osmId' = ${poi.osmId.toString()}
          LIMIT 1
        `;

        // 如果通过 OSM ID 没找到，再通过名称和坐标查找（坐标相近，误差在 100 米内）
        let existing = existingByOsmId.length > 0 
          ? await this.prisma.place.findUnique({ where: { id: existingByOsmId[0].id } })
          : null;

        if (!existing) {
          const existingByNameAndLocation = await this.prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "Place"
            WHERE "nameEN" = ${poi.nameEn || poi.name}
              AND location IS NOT NULL
              AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography,
                100
              )
            LIMIT 1
          `;

          if (existingByNameAndLocation.length > 0) {
            existing = await this.prisma.place.findUnique({ 
              where: { id: existingByNameAndLocation[0].id } 
            });
          }
        }

        if (existing) {
          skipped++;
          results.push({
            osmId: poi.osmId,
            name: poi.name,
            status: 'skipped',
          });
          continue;
        }

        // 创建新地点
        const place = await this.prisma.place.create({
          data: {
            uuid: randomUUID(),
            nameCN: poi.name, // 如果没有中文名，使用英文名
            nameEN: poi.nameEn || poi.name,
            category: 'ATTRACTION',
            cityId: icelandCityId,
            address: poi.rawTags['addr:full'] || poi.rawTags.address || undefined,
            metadata: {
              osmId: poi.osmId,
              osmType: poi.osmType,
              category: poi.category,
              type: poi.type,
              rawTags: poi.rawTags,
              source: 'google_places',
              importedAt: new Date().toISOString(),
            } as any,
            updatedAt: new Date(),
          } as any,
        });

        // 更新地理位置
        await this.prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)
          WHERE id = ${place.id}
        `;

        created++;
        results.push({
          osmId: poi.osmId,
          name: poi.name,
          status: 'created',
        });
      } catch (error: any) {
        errors++;
        results.push({
          osmId: poi.osmId,
          name: poi.name,
          status: 'error',
          error: error.message,
        });
      }
    }

    return {
      total: pois.length,
      created,
      skipped,
      errors,
      results,
    };
  }

  /**
   * 根据 ID 获取地点详情
   * 
   * @param id 地点 ID
   * @returns 地点详情（包含完整元数据）
   */
  async findOne(id: number) {
    const place = await this.prisma.place.findUnique({
      where: { id },
      include: {
        city: true,
      },
    });

    if (!place) {
      return null;
    }

    // 提取坐标
    const location = (place as any).location;
    const coords = location ? this.extractCoordinates(location) : null;

    // 解析元数据
    const metadata = (place.metadata as any) || {};
    const physicalMetadata = (place.physicalMetadata as any) || {};
    const city = place.city as any;
    const timezone = metadata?.timezone || city?.timezone || 'Asia/Tokyo';
    const todayHours = OpeningHoursUtil.getTodayHours(metadata, timezone);
    const isOpen = OpeningHoursUtil.isOpenNow(todayHours, timezone);

    return {
      id: place.id,
      uuid: place.uuid,
      nameCN: place.nameCN,
      nameEN: place.nameEN,
      category: place.category,
      address: place.address,
      rating: place.rating,
      googlePlaceId: place.googlePlaceId,
      location: coords ? { lat: coords.lat, lng: coords.lng } : null,
      metadata,
      physicalMetadata,
      city: city ? {
        id: city.id,
        name: city.name,
        nameCN: city.nameCN,
        nameEN: city.nameEN,
        countryCode: city.countryCode,
        timezone: city.timezone,
      } : null,
      status: {
        isOpen,
        text: isOpen ? '营业中' : '已打烊',
        hoursToday: todayHours || '休息',
      },
      createdAt: place.createdAt,
      updatedAt: place.updatedAt,
    };
  }

  /**
   * 批量获取地点详情
   * 
   * @param ids 地点 ID 列表
   * @returns 地点详情列表
   */
  async findBatch(ids: number[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    const places = await this.prisma.place.findMany({
      where: {
        id: { in: ids },
      },
      include: {
        city: true,
      },
    });

    return places.map(place => {
      const location = (place as any).location;
      const coords = location ? this.extractCoordinates(location) : null;
      const metadata = (place.metadata as any) || {};
      const physicalMetadata = (place.physicalMetadata as any) || {};
      const city = place.city as any;
      const timezone = metadata?.timezone || city?.timezone || 'Asia/Tokyo';
      const todayHours = OpeningHoursUtil.getTodayHours(metadata, timezone);
      const isOpen = OpeningHoursUtil.isOpenNow(todayHours, timezone);

      return {
        id: place.id,
        uuid: place.uuid,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        category: place.category,
        address: place.address,
        rating: place.rating,
        googlePlaceId: place.googlePlaceId,
        location: coords ? { lat: coords.lat, lng: coords.lng } : null,
        metadata,
        physicalMetadata,
        city: city ? {
          id: city.id,
          name: city.name,
          nameCN: city.nameCN,
          nameEN: city.nameEN,
          countryCode: city.countryCode,
          timezone: city.timezone,
        } : null,
        status: {
          isOpen,
          text: isOpen ? '营业中' : '已打烊',
          hoursToday: todayHours || '休息',
        },
        createdAt: place.createdAt,
        updatedAt: place.updatedAt,
      };
    });
  }

  /**
   * 关键词搜索地点
   * 
   * @param query 搜索关键词
   * @param lat 纬度（可选，用于距离排序）
   * @param lng 经度（可选，用于距离排序）
   * @param radius 搜索半径（米，可选）
   * @param category 类别过滤（可选）
   * @param limit 返回数量限制（默认 20）
   * @returns 地点列表
   */
  async search(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL',
    limit: number = 20
  ) {
    // 构建搜索条件
    const searchCondition = Prisma.sql`
      (
        "nameCN" ILIKE ${`%${query}%`} OR
        "nameEN" ILIKE ${`%${query}%`} OR
        address ILIKE ${`%${query}%`} OR
        metadata::text ILIKE ${`%${query}%`}
      )
    `;

    const categoryFilter = category
      ? Prisma.sql`AND category = ${category}::"PlaceCategory"`
      : Prisma.sql``;

    const locationFilter = lat && lng && radius
      ? Prisma.sql`AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
      : Prisma.sql``;

    const orderBy = lat && lng
      ? Prisma.sql`ORDER BY ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
      : Prisma.sql`ORDER BY rating DESC NULLS LAST, "nameCN" ASC`;

    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        id, "nameCN", "nameEN", metadata, address, rating, category,
        ${lat && lng ? Prisma.sql`ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters` : Prisma.sql`NULL as distance_meters`}
      FROM "Place"
      WHERE ${searchCondition}
        ${categoryFilter}
        ${locationFilter}
      ${orderBy}
      LIMIT ${limit}
    `;

    return rawResults.map((row) => this.mapToDto(row));
  }

  /**
   * 自动补全搜索
   * 
   * @param query 搜索关键词
   * @param lat 纬度（可选，用于距离排序）
   * @param lng 经度（可选，用于距离排序）
   * @param limit 返回数量限制（默认 10）
   * @returns 地点名称建议列表
   */
  async autocomplete(
    query: string,
    lat?: number,
    lng?: number,
    limit: number = 10
  ) {
    const searchCondition = Prisma.sql`
      (
        "nameCN" ILIKE ${`%${query}%`} OR
        "nameEN" ILIKE ${`%${query}%`}
      )
    `;

    const orderBy = lat && lng
      ? Prisma.sql`ORDER BY ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
      : Prisma.sql`ORDER BY rating DESC NULLS LAST, "nameCN" ASC`;

    const results = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      address: string | null;
    }>>`
      SELECT 
        id, "nameCN", "nameEN", category, address
      FROM "Place"
      WHERE ${searchCondition}
      ${orderBy}
      LIMIT ${limit}
    `;

    return results.map(row => ({
      id: row.id,
      name: row.nameEN || row.nameCN,
      nameCN: row.nameCN,
      nameEN: row.nameEN,
      category: row.category,
      address: row.address,
    }));
  }

  /**
   * 语义地点搜索
   * 
   * 使用向量搜索理解自然语言查询，找到语义相关但不含关键词的地点
   * 
   * @param query 自然语言查询（如"像京都那样的地方"）
   * @param lat 纬度（可选，用于距离排序）
   * @param lng 经度（可选，用于距离排序）
   * @param radius 搜索半径（米，可选）
   * @param category 类别过滤（可选）
   * @param limit 返回数量限制（默认 20）
   * @returns 搜索结果列表（包含推荐原因）
   */
  async semanticSearch(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL',
    limit: number = 20
  ): Promise<Array<{
    id: number;
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    category: string;
    matchReasons: string[];
    vectorScore: number;
    keywordScore: number;
    finalScore: number;
    distance?: number;
  }>> {
    if (!this.vectorSearchService) {
      // 如果向量搜索服务不可用，降级到关键词搜索
      const results = await this.search(query, lat, lng, radius, category, limit);
      return results.map((r) => ({
        id: r.id,
        nameCN: r.nameCN,
        nameEN: r.nameEN,
        address: r.address,
        category: r.category,
        matchReasons: ['关键词匹配'],
        vectorScore: 0,
        keywordScore: 1.0,
        finalScore: 1.0,
        distance: r.distance,
      }));
    }

    const results = await this.vectorSearchService.hybridSearch(
      query,
      lat,
      lng,
      radius,
      category,
      limit
    );

    return results.map((r) => ({
      id: r.id,
      nameCN: r.nameCN,
      nameEN: r.nameEN,
      address: r.address,
      category: r.category,
      matchReasons: r.matchReasons,
      vectorScore: r.vectorScore,
      keywordScore: r.keywordScore,
      finalScore: r.finalScore,
      distance: r.distance,
    }));
  }
}

