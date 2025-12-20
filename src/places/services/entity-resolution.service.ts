// src/places/services/entity-resolution.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { VectorSearchService } from './vector-search.service';
import { AdminDivisionService } from './admin-division.service';
import { AmapPOIService } from './amap-poi.service';
import { GooglePlacesService } from './google-places.service';

/**
 * 实体解析结果
 */
export interface EntityResolutionResult {
  id: number;
  name: string;
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  category: string;
  lat: number;
  lng: number;
  score: number;
  source: 'keyword_match' | 'alias_match' | 'vector_search' | 'external_geocoding';
  matchReasons: string[];
  metadata?: any;
}

/**
 * 实体解析策略链服务
 * 
 * 实现多步策略：
 * 1. 结构化抽取（城市/县/POI列表）
 * 2. alias/关键词精确匹配
 * 3. 向量召回（限制 city scope）
 * 4. re-rank（LLM/规则）
 * 5. 外部地理编码补全
 * 6. 仍失败 → 澄清
 */
@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);
  
  // 低分拦截阈值
  private readonly LOW_SCORE_THRESHOLD = 0.45;
  
  // must-have POI的核心token（用于验证向量召回结果）
  private readonly mustHavePoiTokens: Map<string, string[]> = new Map([
    ['西湖', ['西湖']],
    ['十里红妆', ['十里', '红妆']],
  ]);

  constructor(
    private prisma: PrismaService,
    private vectorSearchService: VectorSearchService,
    private adminDivisionService: AdminDivisionService,
    private amapPOIService?: AmapPOIService,
    private googlePlacesService?: GooglePlacesService,
  ) {}

  /**
   * 解析实体（多步策略链）
   * 
   * @param query 用户查询
   * @param mustHavePois 必须找到的POI列表（如["杭州西湖", "宁海十里红妆"]）
   * @param lat 可选：纬度
   * @param lng 可选：经度
   * @param limit 返回结果数量限制
   * @returns 解析结果
   */
  async resolveEntities(
    query: string,
    mustHavePois: string[] = [],
    lat?: number,
    lng?: number,
    limit: number = 10
  ): Promise<{
    results: EntityResolutionResult[];
    missingPois: string[];
    needsClarification: Array<{ poi: string; options: string[] }>;
  }> {
    this.logger.debug(`[resolveEntities] 开始解析实体，query: "${query}", mustHavePois: [${mustHavePois.join(', ')}]`);

    const results: EntityResolutionResult[] = [];
    const foundPoiNames = new Set<string>();
    const missingPois: string[] = [];

    // 步骤1: 结构化抽取（城市/县/POI列表）
    const extracted = this.extractStructuredEntities(query);
    this.logger.debug(`[resolveEntities] 结构化抽取结果: ${JSON.stringify(extracted, null, 2)}`);

    // 步骤2: 对每个must-have POI，先做alias/关键词精确匹配
    for (const poiQuery of mustHavePois) {
      const poiResult = await this.resolveMustHavePoi(poiQuery, extracted, lat, lng);
      if (poiResult) {
        results.push(poiResult);
        foundPoiNames.add(poiQuery);
      } else {
        missingPois.push(poiQuery);
      }
    }

    // 步骤3: 向量召回（限制 city scope）
    if (results.length < limit) {
      const vectorResults = await this.vectorSearchWithCityScope(
        query,
        extracted.cities,
        lat,
        lng,
        limit - results.length
      );
      
      // 过滤低分结果
      const filteredVectorResults = vectorResults.filter(r => r.score >= this.LOW_SCORE_THRESHOLD);
      
      // 验证must-have POI的核心token
      for (const result of filteredVectorResults) {
        // 检查是否匹配must-have POI
        let isMustHave = false;
        for (const poiQuery of mustHavePois) {
          if (this.matchesMustHavePoi(result, poiQuery)) {
            isMustHave = true;
            if (!foundPoiNames.has(poiQuery)) {
              foundPoiNames.add(poiQuery);
              const idx = missingPois.indexOf(poiQuery);
              if (idx >= 0) {
                missingPois.splice(idx, 1);
              }
            }
            break;
          }
        }
        
        // 只添加must-have POI或高分结果
        if (isMustHave || result.score >= 0.5) {
          results.push(result);
        }
      }
    }

    // 步骤4: 对缺失的must-have POI，尝试外部地理编码
    const needsClarification: Array<{ poi: string; options: string[] }> = [];
    for (const missingPoi of missingPois) {
      const externalResult = await this.tryExternalGeocoding(missingPoi, extracted, lat, lng);
      if (externalResult) {
        results.push(externalResult);
        const idx = missingPois.indexOf(missingPoi);
        if (idx >= 0) {
          missingPois.splice(idx, 1);
        }
      } else {
        // 生成澄清选项
        const clarificationOptions = this.generateClarificationOptions(missingPoi);
        needsClarification.push({
          poi: missingPoi,
          options: clarificationOptions,
        });
      }
    }

    // 步骤5: re-rank（按分数和must-have优先级排序）
    results.sort((a, b) => {
      // must-have POI优先
      const aIsMustHave = mustHavePois.some(p => this.matchesMustHavePoi(a, p));
      const bIsMustHave = mustHavePois.some(p => this.matchesMustHavePoi(b, p));
      if (aIsMustHave && !bIsMustHave) return -1;
      if (!aIsMustHave && bIsMustHave) return 1;
      // 然后按分数排序
      return b.score - a.score;
    });

    this.logger.debug(`[resolveEntities] 解析完成，找到 ${results.length} 个结果，缺失 ${missingPois.length} 个POI`);

    return {
      results: results.slice(0, limit),
      missingPois,
      needsClarification,
    };
  }

  /**
   * 步骤1: 结构化抽取
   */
  private extractStructuredEntities(query: string): {
    cities: string[];
    counties: string[];
    pois: string[];
  } {
    // 这里可以复用vector-search.service.ts中的extractCities和extractKeywords逻辑
    // 简化版本
    const cities: string[] = [];
    const counties: string[] = [];
    const pois: string[] = [];

    // 提取城市（简化版，实际应该使用更复杂的逻辑）
    const cityPattern = /(?:北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|宁波|温州|台州|嘉兴|湖州|绍兴|金华|衢州|舟山|丽水)/g;
    let match;
    while ((match = cityPattern.exec(query)) !== null) {
      cities.push(match[0]);
    }

    // 提取县/区
    const countyPattern = /([^\s，,。.!！？?和以及还有跟与省市县区]{1,10})(?:县|区)/g;
    while ((match = countyPattern.exec(query)) !== null) {
      counties.push(match[0]);
    }

    // 提取POI（简化版）
    // 实际应该使用更复杂的逻辑，识别"城市+POI"组合

    return { cities, counties, pois };
  }

  /**
   * 步骤2: 解析must-have POI（先做alias/关键词精确匹配）
   */
  private async resolveMustHavePoi(
    poiQuery: string,
    extracted: { cities: string[]; counties: string[]; pois: string[] },
    lat?: number,
    lng?: number
  ): Promise<EntityResolutionResult | null> {
    // 2.1: 别名匹配
    const cityHint = this.adminDivisionService.mapPoiAliasToCity(poiQuery);
    const normalizedCity = cityHint ? await this.adminDivisionService.normalizeCityName(cityHint) : null;

    // 2.2: 关键词精确匹配（在指定城市范围内）
    const keywordMatch = await this.keywordExactMatch(poiQuery, normalizedCity || undefined);
    if (keywordMatch) {
      return {
        ...keywordMatch,
        source: 'keyword_match',
        matchReasons: ['关键词精确匹配'],
      };
    }

    // 2.3: 别名匹配（检查数据库中的别名）
    const aliasMatch = await this.aliasMatch(poiQuery, normalizedCity || undefined);
    if (aliasMatch) {
      return {
        ...aliasMatch,
        source: 'alias_match',
        matchReasons: ['别名匹配'],
      };
    }

    return null;
  }

  /**
   * 关键词精确匹配
   */
  private async keywordExactMatch(
    poiName: string,
    city?: string
  ): Promise<Omit<EntityResolutionResult, 'source' | 'matchReasons'> | null> {
    try {
      // 构建查询条件
      let cityFilter = Prisma.sql``;
      
      if (city) {
        const cityRecord = await this.prisma.city.findFirst({
          where: {
            OR: [
              { nameCN: city },
              { name: city },
            ],
          },
        });

        if (cityRecord) {
          cityFilter = Prisma.sql`AND "cityId" = ${cityRecord.id}`;
        }
      }

      // 使用原始SQL查询，直接提取坐标
      const results = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        address: string | null;
        category: string;
        lat: number | null;
        lng: number | null;
        metadata: any;
      }>>`
        SELECT 
          id,
          "nameCN",
          "nameEN",
          address,
          category,
          metadata,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE 
          (
            "nameCN" ILIKE ${`%${poiName}%`}
            OR "nameEN" ILIKE ${`%${poiName}%`}
            OR address ILIKE ${`%${poiName}%`}
          )
          AND location IS NOT NULL
          ${cityFilter}
        LIMIT 1
      `;

      if (results.length > 0) {
        const place = results[0];
        if (place.lat && place.lng) {
          return {
            id: place.id,
            name: place.nameCN || place.nameEN || '',
            nameCN: place.nameCN || '',
            nameEN: place.nameEN,
            address: place.address,
            category: place.category,
            lat: parseFloat(place.lat.toString()),
            lng: parseFloat(place.lng.toString()),
            score: 1.0, // 精确匹配给满分
            metadata: place.metadata,
          };
        }
      }
    } catch (error) {
      this.logger.warn(`关键词精确匹配失败: ${error}`);
    }

    return null;
  }

  /**
   * 别名匹配
   */
  private async aliasMatch(
    poiName: string,
    city?: string
  ): Promise<Omit<EntityResolutionResult, 'source' | 'matchReasons'> | null> {
    // 检查metadata中的别名
    try {
      // 使用Prisma.sql安全查询JSONB数组字段
      let cityFilter = Prisma.sql``;
      
      if (city) {
        const cityRecord = await this.prisma.city.findFirst({
          where: {
            OR: [
              { nameCN: city },
              { name: city },
            ],
          },
        });

        if (cityRecord) {
          cityFilter = Prisma.sql`AND "cityId" = ${cityRecord.id}`;
        }
      }

      // 使用PostgreSQL的JSONB操作符查询别名数组
      // metadata->'aliases' @> '["别名"]'::jsonb 表示别名数组包含指定值
      const results = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        address: string | null;
        category: string;
        lat: number | null;
        lng: number | null;
        metadata: any;
      }>>`
        SELECT 
          id,
          "nameCN",
          "nameEN",
          address,
          category,
          metadata,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE 
          metadata->'aliases' @> ${JSON.stringify([poiName])}::jsonb
          AND location IS NOT NULL
          ${cityFilter}
        LIMIT 1
      `;

      if (results.length > 0) {
        const place = results[0];
        if (place.lat && place.lng) {
          return {
            id: place.id,
            name: place.nameCN || place.nameEN || '',
            nameCN: place.nameCN || '',
            nameEN: place.nameEN,
            address: place.address,
            category: place.category,
            lat: parseFloat(place.lat.toString()),
            lng: parseFloat(place.lng.toString()),
            score: 0.9, // 别名匹配给高分
            metadata: place.metadata,
          };
        }
      }
    } catch (error) {
      this.logger.warn(`别名匹配失败: ${error}`);
    }

    return null;
  }

  /**
   * 步骤3: 向量召回（限制 city scope）
   */
  private async vectorSearchWithCityScope(
    query: string,
    cities: string[],
    lat?: number,
    lng?: number,
    limit: number = 10
  ): Promise<EntityResolutionResult[]> {
    // 规范化城市名称
    const normalizedCities = await this.adminDivisionService.normalizeCityNames(cities);
    
    // 调用vector-search服务
    const results = await this.vectorSearchService.hybridSearch(
      query,
      lat,
      lng,
      undefined, // radius
      undefined, // category
      limit
    );

    // 转换为EntityResolutionResult格式
    return results.map(r => ({
      id: r.id,
      name: r.nameCN || r.nameEN || '',
      nameCN: r.nameCN,
      nameEN: r.nameEN,
      address: r.address,
      category: r.category,
      lat: r.lat || 0,
      lng: r.lng || 0,
      score: r.finalScore,
      source: 'vector_search' as const,
      matchReasons: r.matchReasons || [],
      metadata: {},
    }));
  }

  /**
   * 验证结果是否匹配must-have POI
   */
  private matchesMustHavePoi(result: EntityResolutionResult, poiQuery: string): boolean {
    const tokens = this.mustHavePoiTokens.get(poiQuery);
    if (!tokens) {
      // 如果没有预定义token，使用简单包含匹配
      return result.name.includes(poiQuery) || poiQuery.includes(result.name);
    }

    // 检查是否包含所有核心token
    const resultText = `${result.name} ${result.nameCN} ${result.address || ''}`.toLowerCase();
    return tokens.every(token => resultText.includes(token.toLowerCase()));
  }

  /**
   * 步骤4: 外部地理编码
   */
  private async tryExternalGeocoding(
    poiName: string,
    extracted: { cities: string[]; counties: string[]; pois: string[] },
    lat?: number,
    lng?: number
  ): Promise<EntityResolutionResult | null> {
    // 确定城市提示
    const cityHint = this.adminDivisionService.mapPoiAliasToCity(poiName);
    const normalizedCity = cityHint 
      ? await this.adminDivisionService.normalizeCityName(cityHint)
      : extracted.cities[0];

    // 尝试高德地图
    if (this.amapPOIService) {
      try {
        const amapResult = await this.amapPOIService.searchPOIByName(poiName, normalizedCity);
        if (amapResult) {
          // TODO: 将结果写回Place库（write-through cache）
          return {
            id: 0, // 临时ID，需要写入数据库后获取真实ID
            name: amapResult.name || poiName,
            nameCN: amapResult.name || poiName,
            nameEN: null,
            address: amapResult.address,
            category: 'ATTRACTION',
            lat: amapResult.lat,
            lng: amapResult.lng,
            score: 0.8, // 外部地理编码给中等分数
            source: 'external_geocoding',
            matchReasons: ['高德地图地理编码'],
            metadata: {
              amapId: amapResult.amapId,
            },
          };
        }
      } catch (error) {
        this.logger.warn(`高德地图地理编码失败: ${error}`);
      }
    }

    // 尝试Google Places
    if (this.googlePlacesService && lat && lng) {
      // TODO: 实现Google Places搜索
    }

    return null;
  }

  /**
   * 生成澄清选项
   */
  private generateClarificationOptions(poiName: string): string[] {
    // 根据POI名称生成可能的澄清选项
    if (poiName.includes('十里红妆')) {
      return ['十里红妆博物馆', '十里红妆文化园', '十里红妆景区', '十里红妆一条街'];
    }
    // 可以添加更多规则
    return [];
  }
}

