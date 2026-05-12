// src/places/places.service.ts
import { Injectable, Optional, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PlaceCategory } from '@prisma/client';
import { VectorSearchService } from './services/vector-search.service';
import { PlaceWithDistance, RawPlaceResult } from './dto/geo-result.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { PlaceMetadata } from './interfaces/place-metadata.interface';
import { randomUUID } from 'crypto';
import { AmapPOIService } from './services/amap-poi.service';
import { GooglePlacesService, GooglePlacesPOI } from './services/google-places.service';
// 保持向后兼容的类型别名
type OverpassPOI = GooglePlacesPOI;
import { PhysicalMetadataGenerator } from './utils/physical-metadata-generator.util';
import { EmbeddingService } from './services/embedding.service';
import { PlaceTrailEnrichmentService } from './services/place-trail-enrichment.service';
import { MetadataEnricher } from './utils/metadata-enricher.util';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private prisma: PrismaService,
    private amapPOIService: AmapPOIService,
    private googlePlacesService: GooglePlacesService,
    @Optional() @Inject(VectorSearchService) private vectorSearchService?: VectorSearchService,
    @Optional() @Inject(EmbeddingService) private embeddingService?: EmbeddingService,
    @Optional() private trailEnrichmentService?: PlaceTrailEnrichmentService
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
    
    // 规范化 googlePlaceId：空字符串或只包含空白字符的字符串转换为 null
    const normalizedGooglePlaceId = dto.googlePlaceId?.trim() || null;
    
    // 检查 googlePlaceId 是否已存在（如果提供了非空值）
    if (normalizedGooglePlaceId) {
      const existingPlace = await this.prisma.place.findUnique({
        where: { googlePlaceId: normalizedGooglePlaceId },
        select: { id: true, nameCN: true },
      });
      
      if (existingPlace) {
        throw new BadRequestException(
          `Google Place ID "${normalizedGooglePlaceId}" 已存在，对应的地点ID为 ${existingPlace.id} (${existingPlace.nameCN})`
        );
      }
    }
    
    // 使用规范化后的 googlePlaceId
    const placeData = {
      ...rest,
      googlePlaceId: normalizedGooglePlaceId,
    };
    
    // 快招1：增强 metadata（自动解析 OSM opening_hours 等）
    const enrichedMetadata = dto.metadata 
      ? MetadataEnricher.enrich(dto.metadata)
      : undefined;
    
    // 自动生成 physicalMetadata（使用增强后的 metadata）
    const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
      dto.category,
      enrichedMetadata as any
    );
    
    // ⚠️ 注意：Prisma 不支持直接写入 Unsupported 字段
    // 我们通常创建一个带有经纬度的 Place，然后用 raw SQL 更新它的 location，
    // 或者直接使用 $executeRaw 进行插入。
    // 简便方法：先创建基础信息
    const place = await this.prisma.place.create({
      data: {
        ...placeData,
        uuid: randomUUID(),
        metadata: enrichedMetadata as any, // 存入增强后的 JSON
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
    category?: PlaceCategory // 统一使用 PlaceCategory 枚举
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
  private checkIfOpen(_openingHours: any): boolean {
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
      include: { City: true },
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
          include: { City: true },
        })
      : await this.prisma.place.findMany({
          where: { category: 'ATTRACTION' },
          include: { City: true },
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
        City: true,
      },
    });

    if (!place) {
      return null;
    }

    // 提取坐标（使用 SQL 查询确保正确提取 PostGIS geography 类型）
    let coords: { lat: number; lng: number } | null = null;
    try {
      const locationResult = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${id} AND location IS NOT NULL
      `;
      
      if (locationResult.length > 0) {
        coords = {
          lat: Number(locationResult[0].lat),
          lng: Number(locationResult[0].lng),
        };
      }
    } catch (error: any) {
      this.logger.warn(`提取地点 ${id} 的坐标失败: ${error.message}`);
      // 降级：尝试使用 extractCoordinates 方法
      const location = (place as any).location;
      coords = location ? this.extractCoordinates(location) : null;
    }

    // 解析元数据
    const metadata = (place.metadata as any) || {};
    let physicalMetadata = (place.physicalMetadata as any) || {};
    const city = place.City as any;
    const timezone = metadata?.timezone || city?.timezone || 'Asia/Tokyo';
    const todayHours = OpeningHoursUtil.getTodayHours(metadata, timezone);
    const isOpen = OpeningHoursUtil.isOpenNow(todayHours, timezone);

    // 快招3：如果有关联的 Trail，从 Trail 表获取数据增强 physicalMetadata
    if (this.trailEnrichmentService && (metadata.trailId || metadata.routeId)) {
      try {
        const trailPatch = await this.trailEnrichmentService.enrichFromTrail(metadata as PlaceMetadata);
        if (trailPatch) {
          physicalMetadata = {
            ...physicalMetadata,
            ...trailPatch,
          };
        }
      } catch (error: any) {
        this.logger.warn(`获取 Trail 数据失败 (placeId: ${place.id}): ${error.message}`);
      }
    }

    return {
      id: place.id,
      uuid: place.uuid,
      nameCN: place.nameCN,
      nameEN: place.nameEN,
      category: place.category,
      address: place.address,
      rating: place.rating,
      googlePlaceId: place.googlePlaceId,
      description: (place as any).description,
      location: coords ? { lat: coords.lat, lng: coords.lng } : null,
      metadata,
      ontologyRules: (place as any).ontologyRules ?? null,
      physicalMetadata,
      city: city ? {
        id: city.id,
        name: city.name,
        nameCN: city.nameCN,
        nameEN: city.nameEN,
        countryCode: city.countryCode,
        timezone: city.timezone,
      } : null,
      countryCode: city?.countryCode || null, // 单独返回国家代码，方便筛选和显示
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
        City: true,
      },
    });

    return places.map(place => {
      const location = (place as any).location;
      const coords = location ? this.extractCoordinates(location) : null;
      const metadata = (place.metadata as any) || {};
      const physicalMetadata = (place.physicalMetadata as any) || {};
      const city = place.City as any;
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
        ontologyRules: (place as any).ontologyRules ?? null,
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
   * 推荐活动 - 获取指定国家评分4.0以上的地点
   * 
   * @param countryCode 国家代码（必填，如 IS、JP、CN）
   * @param category 类别过滤（可选）
   * @param limit 返回数量限制（默认 20）
   * @returns 地点列表
   */
  async getRecommendedActivities(
    countryCode: string,
    category?: PlaceCategory, // 统一使用 PlaceCategory 枚举
    limit: number = 20
  ) {
    if (!countryCode) {
      throw new BadRequestException('国家代码不能为空');
    }

    const categoryFilter = category
      ? Prisma.sql`AND p.category = ${category}::"PlaceCategory"`
      : Prisma.sql``;

    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.metadata,
        p.address,
        p.rating,
        p.category,
        0::float as distance_meters
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode.toUpperCase()}
        AND p.rating >= 4.0
        AND p.rating IS NOT NULL
        ${categoryFilter}
      ORDER BY p.rating DESC, p."nameCN" ASC
      LIMIT ${limit}
    `;

    return rawResults.map((row) => this.mapToDto(row));
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
   * @param countryCode 国家代码过滤（可选，如 IS、JP、CN）
   * @returns 地点列表
   */
  async search(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: PlaceCategory, // 统一使用 PlaceCategory 枚举
    limit: number = 20,
    countryCode?: string
  ) {
    // 构建搜索条件
    const searchCondition = Prisma.sql`
      (
        p."nameCN" ILIKE ${`%${query}%`} OR
        p."nameEN" ILIKE ${`%${query}%`} OR
        p.address ILIKE ${`%${query}%`} OR
        p.metadata::text ILIKE ${`%${query}%`}
      )
    `;

    const categoryFilter = category
      ? Prisma.sql`AND p.category = ${category}::"PlaceCategory"`
      : Prisma.sql``;

    // 🔧 国家代码过滤：优先通过 City.countryCode，其次通过 metadata->>'countryCode'
    const countryFilter = countryCode
      ? Prisma.sql`AND (c."countryCode" = ${countryCode} OR p.metadata->>'countryCode' = ${countryCode})`
      : Prisma.sql``;

    const locationFilter = lat && lng && radius
      ? Prisma.sql`AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
      : Prisma.sql``;

    const orderBy = lat && lng
      ? Prisma.sql`ORDER BY ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
      : Prisma.sql`ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC`;

    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        p.id, p."nameCN", p."nameEN", p.metadata, p.address, p.rating, p.category,
        ${lat && lng ? Prisma.sql`ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters` : Prisma.sql`NULL as distance_meters`}
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      WHERE ${searchCondition}
        ${categoryFilter}
        ${countryFilter}
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
   * @param countryCode 国家代码过滤（可选，如 IS、JP、CN）
   * @returns 地点名称建议列表
   */
  async autocomplete(
    query: string,
    lat?: number,
    lng?: number,
    limit: number = 10,
    countryCode?: string
  ) {
    const searchCondition = Prisma.sql`
      (
        p."nameCN" ILIKE ${`%${query}%`} OR
        p."nameEN" ILIKE ${`%${query}%`}
      )
    `;

    // 🔧 国家代码过滤：优先通过 City.countryCode，其次通过 metadata->>'countryCode'
    const countryFilter = countryCode
      ? Prisma.sql`AND (c."countryCode" = ${countryCode} OR p.metadata->>'countryCode' = ${countryCode})`
      : Prisma.sql``;

    const orderBy = lat && lng
      ? Prisma.sql`ORDER BY ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
      : Prisma.sql`ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC`;

    const results = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      address: string | null;
    }>>`
      SELECT 
        p.id, p."nameCN", p."nameEN", p.category, p.address
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      WHERE ${searchCondition}
        ${countryFilter}
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
   * @param countryCode 国家代码过滤（可选，如 IS、JP、CN）
   * @returns 搜索结果列表（包含推荐原因）
   */
  async semanticSearch(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: PlaceCategory, // 统一使用 PlaceCategory 枚举
    limit: number = 20,
    countryCode?: string
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
      const results = await this.search(query, lat, lng, radius, category, limit, countryCode);
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
      limit,
      countryCode
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

  /**
   * 批量语义地点搜索
   * 
   * 支持多个自然语言查询，并行处理，每个查询都会调用 embedding API
   * 
   * @param queries 自然语言查询数组
   * @param lat 纬度（可选，用于距离排序）
   * @param lng 经度（可选，用于距离排序）
   * @param radius 搜索半径（米，可选）
   * @param category 类别过滤（可选）
   * @param limit 每个查询返回数量限制（默认 20）
   * @returns 每个查询对应的搜索结果列表
   */
  async batchSemanticSearch(
    queries: string[],
    lat?: number,
    lng?: number,
    radius?: number,
    category?: PlaceCategory, // 统一使用 PlaceCategory 枚举
    limit: number = 20
  ): Promise<Array<{
    query: string;
    results: Array<{
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
    }>;
    total: number;
    error?: string;
  }>> {
    if (!queries || queries.length === 0) {
      return [];
    }

    // 并行处理所有查询
    const searchPromises = queries.map(async (query) => {
      try {
        const results = await this.semanticSearch(query, lat, lng, radius, category, limit);
        return {
          query,
          results,
          total: results.length,
        };
      } catch (error: any) {
        this.logger.error(`批量搜索中查询 "${query}" 失败: ${error.message}`);
        return {
          query,
          results: [],
          total: 0,
          error: error.message,
        };
      }
    });

    return Promise.all(searchPromises);
  }

  /**
   * 更新地点（管理接口）
   */
  async updatePlace(id: number, dto: UpdatePlaceDto) {
    const place = await this.prisma.place.findUnique({
      where: { id },
    });

    if (!place) {
      throw new NotFoundException(`Place not found: ${id}`);
    }

    const updateData: any = {};

    if (dto.nameCN !== undefined) updateData.nameCN = dto.nameCN;
    if (dto.nameEN !== undefined) updateData.nameEN = dto.nameEN;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.cityId !== undefined) {
      // Use relation connect instead of scalar cityId to avoid Prisma schema/client mismatches
      updateData.City = { connect: { id: dto.cityId } };
    }
    
    // 检查 googlePlaceId 唯一性约束
    if (dto.googlePlaceId !== undefined) {
      // 将空字符串转换为 null（数据库唯一约束只适用于非 null 值）
      const normalizedGooglePlaceId = dto.googlePlaceId?.trim() || null;
      
      // 如果新值不为空，检查是否已被其他地点使用
      if (normalizedGooglePlaceId) {
        const existingPlace = await this.prisma.place.findFirst({
          where: {
            googlePlaceId: normalizedGooglePlaceId,
            id: { not: id }, // 排除当前地点
          },
        });
        
        if (existingPlace) {
          throw new BadRequestException(
            `Google Place ID "${normalizedGooglePlaceId}" 已被地点 ID ${existingPlace.id} (${existingPlace.nameCN}) 使用`
          );
        }
      }
      
      // 如果当前地点已经有相同的 googlePlaceId，不需要更新（避免不必要的数据库操作）
      if (place.googlePlaceId === normalizedGooglePlaceId) {
        // 跳过更新，保持原值
      } else {
        updateData.googlePlaceId = normalizedGooglePlaceId;
      }
    }
    
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;
    if (dto.ontologyRules !== undefined) updateData.ontologyRules = dto.ontologyRules;
    if (dto.physicalMetadata !== undefined) updateData.physicalMetadata = dto.physicalMetadata;

    // 如果更新了名称或元数据，可能需要更新embedding
    const needsEmbeddingUpdate = dto.nameCN !== undefined || dto.nameEN !== undefined || dto.metadata !== undefined;

    // 先更新非 location 字段
    let updatedPlace;
    if (Object.keys(updateData).length > 0) {
      updatedPlace = await this.prisma.place.update({
        where: { id },
        data: updateData,
      });
    } else {
      updatedPlace = place;
    }

    // 单独处理地理位置更新（使用原始 SQL，因为 Prisma 不支持直接更新 Unsupported 类型字段）
    if (dto.lat !== undefined && dto.lng !== undefined) {
      await this.prisma.$executeRaw`
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
        WHERE id = ${id}
      `;
      // 重新获取更新后的地点（包含 location 和 City 关联）
      updatedPlace = await this.prisma.place.findUnique({
        where: { id },
        include: {
          City: true,
        },
      });
    }

    // 异步更新embedding（如果需要）
    if (needsEmbeddingUpdate && this.embeddingService && updatedPlace) {
      this.updatePlaceEmbedding(id, updatedPlace).catch(error => {
        this.logger.warn(`Failed to update embedding for place ${id}: ${error.message}`);
      });
    }

    // 使用 findOne 方法格式化返回数据（确保 location 等字段正确提取）
    return this.findOne(id);
  }

  /**
   * 删除地点（管理接口）
   */
  async deletePlace(id: number) {
    const place = await this.prisma.place.findUnique({
      where: { id },
      include: {
        ItineraryItem: true,
      },
    });

    if (!place) {
      throw new NotFoundException(`Place not found: ${id}`);
    }

    // 检查是否被行程使用
    if (place.ItineraryItem && place.ItineraryItem.length > 0) {
      throw new BadRequestException(
        `Cannot delete place: it is being used by ${place.ItineraryItem.length} itinerary item(s)`
      );
    }

    await this.prisma.place.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * 获取地点列表（管理接口）
   * 支持分页、搜索、按类别和城市筛选
   * 优化：使用并行查询和优化的搜索策略
   */
  async getPlacesAdmin(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: PlaceCategory;
    cityId?: number;
    countryCode?: string;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100); // 限制最大每页数量为100
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Prisma.PlaceWhereInput = {};

    // 搜索条件 - 优化：使用更高效的搜索方式
    if (params.search) {
      const searchTerm = params.search.trim();
      // 如果搜索词很短，使用 startsWith 更高效
      if (searchTerm.length <= 3) {
        where.OR = [
          { nameCN: { startsWith: searchTerm, mode: 'insensitive' } },
          { nameEN: { startsWith: searchTerm, mode: 'insensitive' } },
        ];
      } else {
        // 对于较长的搜索词，使用 contains
        where.OR = [
          { nameCN: { contains: searchTerm, mode: 'insensitive' } },
          { nameEN: { contains: searchTerm, mode: 'insensitive' } },
          { address: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }
    }

    // 类别筛选
    if (params.category) {
      where.category = params.category;
    }

    // 城市筛选
    if (params.cityId) {
      where.cityId = params.cityId;
    }

    // 国家筛选（通过 City 关联）
    if (params.countryCode) {
      where.City = {
        countryCode: params.countryCode.toUpperCase(), // 统一转换为大写
      };
    }

    try {
      // 优化：并行执行 count 和 findMany 查询
      const [total, places] = await Promise.all([
        this.prisma.place.count({ where }),
        this.prisma.place.findMany({
          where,
          skip,
          take: limit,
          include: {
            City: {
              select: {
                id: true,
                name: true,
                nameCN: true,
                nameEN: true,
                countryCode: true,
                timezone: true,
              },
            },
          },
          orderBy: [
            { createdAt: 'desc' },
          ],
        }),
      ]);

      // 批量提取坐标（使用 SQL 查询确保正确提取 PostGIS geography 类型）
      const placeIds = places.map(p => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (placeIds.length > 0) {
        try {
          const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            locationMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}，将使用降级方法`);
        }
      }

      // 转换为响应格式 - 优化：批量处理
      const placeList = places.map(place => {
        // 优先使用 SQL 提取的坐标，降级使用 extractCoordinates
        let coords: { lat: number; lng: number } | null = locationMap.get(place.id) || null;
        
        if (!coords) {
          const location = (place as any).location;
          coords = location ? this.extractCoordinates(location) : null;
        }
        
        const metadata = (place.metadata as any) || {};
        const physicalMetadata = (place.physicalMetadata as any) || {};
        const city = place.City;

        return {
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          address: place.address,
          rating: place.rating,
          googlePlaceId: place.googlePlaceId,
          description: (place as any).description,
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
          countryCode: city?.countryCode || null, // 单独返回国家代码，方便筛选和显示
          createdAt: place.createdAt,
          updatedAt: place.updatedAt,
        };
      });

      const totalPages = Math.ceil(total / limit);

      return {
        places: placeList,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error: any) {
      this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取地点列表（公开接口）
   * 支持分页、按类别和城市筛选，支持上下切换
   */
  async getPlacesList(params: {
    page?: number;
    limit?: number;
    category?: PlaceCategory;
    cityId?: number;
    orderBy?: 'id' | 'rating' | 'createdAt' | 'updatedAt';
    orderDirection?: 'asc' | 'desc';
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Prisma.PlaceWhereInput = {};

    // 类别筛选
    if (params.category) {
      where.category = params.category;
    }

    // 城市筛选
    if (params.cityId) {
      where.cityId = params.cityId;
    }

    // 构建排序
    const orderBy: Prisma.PlaceOrderByWithRelationInput = {};
    const orderField = params.orderBy || 'id';
    const orderDir = params.orderDirection || 'desc';
    orderBy[orderField] = orderDir;

    try {
      // 并行执行 count 和 findMany 查询
      const [total, places] = await Promise.all([
        this.prisma.place.count({ where }),
        this.prisma.place.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            City: {
              select: {
                id: true,
                name: true,
                nameCN: true,
                nameEN: true,
                countryCode: true,
                timezone: true,
              },
            },
          },
        }),
      ]);

      // 批量提取坐标
      const placeIds = places.map(p => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (placeIds.length > 0) {
        try {
          const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            locationMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`);
        }
      }

      // 转换为响应格式
      const placeList = places.map(place => {
        let coords: { lat: number; lng: number } | null = locationMap.get(place.id) || null;
        
        if (!coords) {
          const location = (place as any).location;
          coords = location ? this.extractCoordinates(location) : null;
        }
        
        const metadata = (place.metadata as any) || {};
        const physicalMetadata = (place.physicalMetadata as any) || {};
        const city = place.City;

        return {
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          address: place.address,
          rating: place.rating,
          googlePlaceId: place.googlePlaceId,
          description: (place as any).description,
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
          countryCode: city?.countryCode || null,
          createdAt: place.createdAt,
          updatedAt: place.updatedAt,
        };
      });

      const totalPages = Math.ceil(total / limit);

      return {
        places: placeList,
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      };
    } catch (error: any) {
      this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 按国家代码查询POI列表（支持分页、类别筛选、搜索）
   * @param params 查询参数
   */
  async getPlacesByCountryCode(params: {
    countryCode: string;
    category?: PlaceCategory;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Prisma.PlaceWhereInput = {};

    // 国家代码过滤
    const countryFilter = {
      OR: [
        { City: { countryCode: params.countryCode } },
        { metadata: { path: ['countryCode'], equals: params.countryCode } },
      ],
    };

    // 类别筛选
    if (params.category) {
      where.category = params.category;
    }

    // 搜索关键词
    if (params.search) {
      where.AND = [
        countryFilter,
        {
          OR: [
            { nameCN: { contains: params.search, mode: 'insensitive' } },
            { nameEN: { contains: params.search, mode: 'insensitive' } },
            { address: { contains: params.search, mode: 'insensitive' } },
          ],
        },
      ];
    } else {
      // 没有搜索关键词时，直接使用国家代码过滤
      where.AND = [countryFilter];
    }

    try {
      // 并行执行 count 和 findMany 查询
      const [total, places] = await Promise.all([
        this.prisma.place.count({ where }),
        this.prisma.place.findMany({
          where,
          skip,
          take: limit,
          orderBy: { rating: 'desc' },
          include: {
            City: {
              select: {
                id: true,
                name: true,
                nameCN: true,
                nameEN: true,
                countryCode: true,
                timezone: true,
              },
            },
          },
        }),
      ]);

      // 批量提取坐标
      const placeIds = places.map(p => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (placeIds.length > 0) {
        try {
          const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            locationMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`);
        }
      }

      // 转换为响应格式
      const placeList = places.map(place => {
        let coords: { lat: number; lng: number } | null = locationMap.get(place.id) || null;
        
        if (!coords) {
          const location = (place as any).location;
          coords = location ? this.extractCoordinates(location) : null;
        }
        
        const city = place.City;

        return {
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          rating: place.rating,
          location: coords ? { lat: coords.lat, lng: coords.lng } : null,
          city: city ? {
            id: city.id,
            name: city.name,
            countryCode: city.countryCode,
          } : null,
        };
      });

      return {
        places: placeList,
        total,
        page,
        limit,
      };
    } catch (error: any) {
      this.logger.error(`按国家代码查询POI失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量获取POI详情
   * @param ids POI ID数组
   */
  async getPlacesByIds(ids: number[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    try {
      const places = await this.prisma.place.findMany({
        where: {
          id: { in: ids },
        },
        include: {
          City: {
            select: {
              id: true,
              name: true,
              nameCN: true,
              nameEN: true,
              countryCode: true,
              timezone: true,
            },
          },
        },
      });

      // 批量提取坐标
      const placeIds = places.map(p => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (placeIds.length > 0) {
        try {
          const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            locationMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`);
        }
      }

      // 转换为响应格式
      return places.map(place => {
        let coords: { lat: number; lng: number } | null = locationMap.get(place.id) || null;
        
        if (!coords) {
          const location = (place as any).location;
          coords = location ? this.extractCoordinates(location) : null;
        }
        
        const metadata = (place.metadata as any) || {};
        const city = place.City;

        return {
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          rating: place.rating,
          address: place.address,
          description: (place as any).description,
          location: coords ? { lat: coords.lat, lng: coords.lng } : null,
          metadata,
          city: city ? {
            id: city.id,
            name: city.name,
            countryCode: city.countryCode,
          } : null,
        };
      });
    } catch (error: any) {
      this.logger.error(`批量获取POI详情失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

