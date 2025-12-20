// src/places/services/vector-search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmbeddingService } from './embedding.service';

/**
 * 向量搜索结果
 */
interface VectorSearchResult {
  id: number;
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  category: string;
  vectorScore: number;
  lat?: number;
  lng?: number;
  distance?: number;
}

/**
 * 关键词搜索结果
 */
interface KeywordSearchResult {
  id: number;
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  category: string;
  keywordScore: number;
  lat?: number;
  lng?: number;
  distance?: number;
}

/**
 * 混合搜索结果
 */
export interface HybridSearchResult {
  id: number;
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  category: string;
  lat?: number;
  lng?: number;
  vectorScore: number;
  keywordScore: number;
  finalScore: number;
  matchReasons: string[];
  distance?: number;
}

/**
 * 向量搜索服务
 * 
 * 实现混合搜索：向量搜索 + 关键词搜索
 */
@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private readonly embeddingDimension: number;

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService
  ) {
    this.embeddingDimension = this.embeddingService.getEmbeddingDimension();
  }

  /**
   * 混合搜索
   * 
   * @param query 搜索查询（自然语言）
   * @param lat 纬度（可选，用于距离排序）
   * @param lng 经度（可选，用于距离排序）
   * @param radius 搜索半径（米，可选）
   * @param category 类别过滤（可选）
   * @param limit 返回数量限制（默认 20）
   * @returns 搜索结果列表
   */
  async hybridSearch(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    limit: number = 20
  ): Promise<HybridSearchResult[]> {
    this.logger.debug(`混合搜索: ${query}, limit: ${limit}`);

    // 诊断信息：打印查询参数
    const { city, keywords } = this.extractKeywords(query);
    const cities = this.extractCities(query);
    
    // 如果检测到多个城市，按实体拆分搜索
    if (cities.length >= 2) {
      this.logger.debug(`[hybridSearch] 检测到多城市查询: [${cities.join(', ')}]，按实体拆分搜索`);
      return this.hybridSearchMultiCity(query, cities, keywords, lat, lng, radius, category, limit);
    }
    
    // 单城市查询：使用原有逻辑
    const effectiveCity = city;
    
    this.logger.debug(`[hybridSearch] 查询参数: {
  query: "${query}",
  cities: [${cities.join(', ')}],
  city: ${effectiveCity || 'null'} (单城市),
  keywords: [${keywords.join(', ')}],
  lat: ${lat || 'null'},
  lng: ${lng || 'null'},
  radius: ${radius || 'null'},
  category: ${category || 'null'},
  limit: ${limit}
}`);

    // 0. 检查数据库中是否有 embedding 数据（如果没有，直接使用关键词搜索）
    const placesWithEmbedding = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
    const embeddingCount = Number(placesWithEmbedding[0]?.count || 0);
    
    if (embeddingCount === 0) {
      this.logger.warn('[hybridSearch] 数据库中没有 embedding 数据，直接使用关键词搜索');
      const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit);
      this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);
      return keywordResults.map(r => ({
        id: r.id,
        nameCN: r.nameCN,
        nameEN: r.nameEN,
        address: r.address,
        category: r.category,
        lat: r.lat,
        lng: r.lng,
        vectorScore: 0,
        keywordScore: r.keywordScore,
        finalScore: r.keywordScore,
        matchReasons: ['关键词匹配（无 embedding 数据）'],
        distance: r.distance,
      }));
    }

    // 1. 生成查询向量
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    
    // 检查是否为降级后的零向量（embedding 失败时的降级策略）
    const isZeroVector = queryEmbedding.every(v => v === 0);
    
    this.logger.debug(`[hybridSearch] Embedding 信息: {
  dimension: ${queryEmbedding.length},
  isZeroVector: ${isZeroVector},
  placesWithEmbedding: ${embeddingCount}
}`);
    
    if (isZeroVector) {
      this.logger.warn('检测到零向量（embedding 失败），降级到纯关键词搜索');
      // 直接使用关键词搜索，跳过向量搜索
      const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit);
      this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);
      return keywordResults.map(r => ({
        id: r.id,
        nameCN: r.nameCN,
        nameEN: r.nameEN,
        address: r.address,
        category: r.category,
        lat: r.lat,
        lng: r.lng,
        vectorScore: 0,
        keywordScore: r.keywordScore,
        finalScore: r.keywordScore,
        matchReasons: ['关键词匹配（embedding 降级）'],
        distance: r.distance,
      }));
    }

    // 2. 向量搜索（传递 city 参数以支持城市过滤）
    this.logger.debug(`[hybridSearch] 开始向量搜索，topK: ${limit * 2}, city: ${effectiveCity || 'null'}`);
    const vectorResults = await this.vectorSearch(
      queryEmbedding,
      lat,
      lng,
      radius,
      category,
      effectiveCity, // 单城市时使用 city，多城市时为 null
      limit * 2 // 召回更多结果用于混合
    );
    this.logger.debug(`[hybridSearch] 向量搜索结果数: ${vectorResults.length}`);

    // 3. 关键词搜索
    this.logger.debug(`[hybridSearch] 开始关键词搜索，topK: ${limit * 2}, city: ${effectiveCity || 'null'}`);
    const keywordResults = await this.keywordSearch(
      query,
      lat,
      lng,
      radius,
      category,
      effectiveCity, // 单城市时使用 city，多城市时为 null
      limit * 2
    );
    this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);

    // 4. 合并结果并计算混合得分
    const resultMap = new Map<number, HybridSearchResult>();

    // 添加向量搜索结果
    vectorResults.forEach((result) => {
      resultMap.set(result.id, {
        id: result.id,
        nameCN: result.nameCN,
        nameEN: result.nameEN,
        address: result.address,
        category: result.category,
        lat: result.lat ? parseFloat(result.lat as any) : undefined,
        lng: result.lng ? parseFloat(result.lng as any) : undefined,
        vectorScore: result.vectorScore,
        keywordScore: 0,
        finalScore: result.vectorScore * 0.7, // 向量搜索权重 0.7
        matchReasons: [],
        distance: result.distance,
      });
    });

    // 合并关键词搜索结果
    keywordResults.forEach((result) => {
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.keywordScore = result.keywordScore;
        existing.finalScore = existing.vectorScore * 0.7 + result.keywordScore * 0.3;
        // 如果向量搜索结果没有 lat/lng，使用关键词搜索的结果
        if (!existing.lat && result.lat) {
          existing.lat = result.lat ? parseFloat(result.lat as any) : undefined;
          existing.lng = result.lng ? parseFloat(result.lng as any) : undefined;
        }
      } else {
        resultMap.set(result.id, {
          id: result.id,
          nameCN: result.nameCN,
          nameEN: result.nameEN,
          address: result.address,
          category: result.category,
          lat: result.lat ? parseFloat(result.lat as any) : undefined,
          lng: result.lng ? parseFloat(result.lng as any) : undefined,
          vectorScore: 0,
          keywordScore: result.keywordScore,
          finalScore: result.keywordScore * 0.3, // 关键词搜索权重 0.3
          matchReasons: [],
          distance: result.distance,
        });
      }
    });

    // 5. 获取完整地点信息并生成推荐原因
    const results = Array.from(resultMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    // 6. 为每个结果生成推荐原因
    const placeIds = results.map((r) => r.id);
    const places = await this.prisma.place.findMany({
      where: { id: { in: placeIds } },
      select: {
        id: true,
        metadata: true,
      },
    });

    const placeMap = new Map(places.map((p) => [p.id, p]));

    return results.map((result) => {
      const place = placeMap.get(result.id);
      if (place) {
        result.matchReasons = this.extractMatchReasons(
          place,
          query,
          result.vectorScore,
          result.keywordScore
        );
      }
      return result;
    });
  }

  /**
   * 向量搜索
   */
  private async vectorSearch(
    queryEmbedding: number[],
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    city?: string | null,
    limit: number = 20
  ): Promise<VectorSearchResult[]> {
    // 诊断信息：打印过滤条件
    const filterInfo = {
      locationFilter: lat && lng && radius ? `ST_DWithin(${lat}, ${lng}, ${radius}m)` : 'none',
      categoryFilter: category || 'none',
      cityFilter: city || 'none',
      embeddingDimension: queryEmbedding.length,
      limit,
    };
    this.logger.debug(`[vectorSearch] 过滤条件: ${JSON.stringify(filterInfo, null, 2)}`);

    const locationFilter = lat && lng && radius
      ? Prisma.sql`AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
      : Prisma.sql``;

    const categoryFilter = category
      ? Prisma.sql`AND category = ${category}::"PlaceCategory"`
      : Prisma.sql``;
    
    // 城市过滤：如果 query 明确提到城市，先查询 City 表获取 cityId，然后用 cityId 过滤
    let cityFilter = Prisma.sql``;
    if (city) {
      // 先查询 City 表获取匹配的 cityId（支持模糊匹配）
      const matchingCities = await this.prisma.$queryRaw<Array<{ id: number; nameCN: string; name: string }>>`
        SELECT id, "nameCN", name FROM "City" 
        WHERE "nameCN" = ${city} 
           OR "nameCN" LIKE ${`%${city}%`}
           OR name = ${city}
           OR name LIKE ${`%${city}%`}
           OR "nameEN" = ${city}
           OR "nameEN" LIKE ${`%${city}%`}
        LIMIT 10
      `;
      
      const cityIds = matchingCities.map(c => c.id);
      
      if (cityIds.length > 0) {
        // 使用 IN 子查询过滤，比 EXISTS 更高效
        const cityIdSqls = cityIds.map(id => Prisma.sql`${id}`);
        cityFilter = Prisma.sql`AND "cityId" IN (${Prisma.join(cityIdSqls, ', ')})`;
        this.logger.debug(`[vectorSearch] 城市过滤: ${city} -> cityIds: [${cityIds.join(', ')}] (匹配到: ${matchingCities.map(c => `${c.nameCN}/${c.name}`).join(', ')})`);
      } else {
        this.logger.warn(`[vectorSearch] 未找到匹配的城市: ${city}，将搜索所有城市`);
        // 如果找不到匹配的城市，不添加过滤条件（返回所有城市的 POI）
      }
    }

    const distanceSelect = lat && lng
      ? Prisma.sql`, ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters`
      : Prisma.sql``;

    // 使用 pgvector 的余弦相似度（<=> 操作符）
    // 1 - (embedding <=> query) 得到相似度分数（0-1）
    // 关键：提取 location 的经纬度（与 keywordSearch 保持一致）
    const results = await this.prisma.$queryRaw<VectorSearchResult[]>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        1 - (embedding <=> ${queryEmbedding}::vector) as "vectorScore",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
        ${distanceSelect}
      FROM "Place"
      WHERE embedding IS NOT NULL
        ${categoryFilter}
        ${cityFilter}
        ${locationFilter}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;

    this.logger.debug(`[vectorSearch] 数据库查询结果数: ${results.length}`);
    
    // 检查是否有 embedding 字段的数据
    const totalCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
    this.logger.debug(`[vectorSearch] 数据库中有 embedding 的 Place 总数: ${totalCount[0]?.count || 0}`);

    return results.map((r) => ({
      ...r,
      vectorScore: parseFloat(r.vectorScore as any),
      distance: r.distance ? parseFloat(r.distance as any) : undefined,
    }));
  }

  /**
   * 从整句中提取城市名
   * 
   * 示例：
   * "规划5天北京游" -> "北京"
   * "去上海旅游" -> "上海"
   */
  private extractCityName(raw: string): string | null {
    // 常见城市名称（中国主要城市）
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安', 
                   '天津', '苏州', '长沙', '郑州', '青岛', '大连', '厦门', '福州', '济南', '合肥',
                   '昆明', '哈尔滨', '长春', '沈阳', '石家庄', '太原', '南昌', '南宁', '海口', '贵阳',
                   '乌鲁木齐', '拉萨', '银川', '西宁', '呼和浩特', '宁波', '温州', '台州', '嘉兴', '湖州',
                   '绍兴', '金华', '衢州', '舟山', '丽水', '宁海', '象山', '余姚', '慈溪', '奉化'];
    
    for (const city of cities) {
      if (raw.includes(city)) {
        return city;
      }
    }
    
    return null;
  }

  /**
   * 提取多个城市名称（用于检测跨城查询）
   */
  private extractCities(raw: string): string[] {
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安', 
                   '天津', '苏州', '长沙', '郑州', '青岛', '大连', '厦门', '福州', '济南', '合肥',
                   '昆明', '哈尔滨', '长春', '沈阳', '石家庄', '太原', '南昌', '南宁', '海口', '贵阳',
                   '乌鲁木齐', '拉萨', '银川', '西宁', '呼和浩特', '宁波', '温州', '台州', '嘉兴', '湖州',
                   '绍兴', '金华', '衢州', '舟山', '丽水', '宁海', '象山', '余姚', '慈溪', '奉化'];
    
    const foundCities: string[] = [];
    for (const city of cities) {
      if (raw.includes(city)) {
        foundCities.push(city);
      }
    }
    
    return foundCities;
  }

  /**
   * 从整句中提取关键词（城市 + POI 词列表）
   * 
   * 示例：
   * "规划5天北京游，包含故宫、天安门" -> { city: "北京", keywords: ["故宫", "天安门"] }
   * 
   * 关键规则：
   * 1. 保留原始短语实体：对 2-3 字地标，不要二次切分
   * 2. 先提取已知地标，再处理其他词汇
   */
  private extractKeywords(raw: string): { city: string | null; keywords: string[] } {
    // 不再硬编码地标列表，使用模式匹配提取"城市+POI"组合
    // 例如："杭州西湖" -> 提取"西湖"
    
    const foundLandmarks: string[] = [];
    let remainingText = raw;
    
    // 先提取所有城市名
    const cities = this.extractCities(raw);
    
    // 使用正则匹配"城市+景点"模式，如"杭州西湖" -> 提取"西湖"
    // 支持更长的POI名称（最多30个字符，如"十里红妆"）
    // 注意：需要处理嵌套城市名的情况，如"宁波宁海十里红妆"
    const cityPattern = /(?:北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|宁波|温州|台州|嘉兴|湖州|绍兴|金华|衢州|舟山|丽水|宁海|象山|余姚|慈溪|奉化)([^\s，,。.!！？?和以及还有跟与省市县区]{2,30})/g;
    let match;
    const matchedRanges: Array<{ start: number; end: number; landmark: string }> = [];
    while ((match = cityPattern.exec(raw)) !== null) {
      const matchedCity = match[0].substring(0, match[0].length - match[1].length); // 提取匹配到的城市名
      const landmark = match[1];
      // 验证：POI名称应该是2-30个字符，且不包含常见行政区划词
      // 特别检查：如果landmark包含其他城市名（如"宁海十里红妆"中的"宁海"），需要特殊处理
      if (landmark.length >= 2 && landmark.length <= 30 && !/省|市|县|区|镇|村/.test(landmark)) {
        // 检查landmark是否包含其他城市名（排除当前匹配的城市名）
        let containsOtherCity = false;
        for (const otherCity of cities) {
          // 确保 otherCity 不是当前匹配的城市名，且 landmark 包含它
          if (otherCity !== matchedCity && landmark.includes(otherCity)) {
            // 如果landmark包含其他城市名，提取城市名之后的部分
            const otherCityIndex = landmark.indexOf(otherCity);
            if (otherCityIndex >= 0) {
              const afterOtherCity = landmark.substring(otherCityIndex + otherCity.length);
              // 支持更长的POI名称（最多30个字符）
              if (afterOtherCity.length >= 2 && afterOtherCity.length <= 30) {
                // 找到"城市+POI"组合，如"宁海十里红妆" -> "十里红妆"
                foundLandmarks.push(afterOtherCity);
                matchedRanges.push({
                  start: match.index,
                  end: match.index + match[0].length,
                  landmark: afterOtherCity
                });
                containsOtherCity = true;
                break;
              }
            }
          }
        }
        
        // 如果landmark不包含其他城市名，直接使用
        if (!containsOtherCity) {
          foundLandmarks.push(landmark);
          matchedRanges.push({
            start: match.index,
            end: match.index + match[0].length,
            landmark: landmark
          });
        }
      }
    }
    
    // 从后往前替换，避免索引偏移
    matchedRanges.sort((a, b) => b.start - a.start);
    for (const range of matchedRanges) {
      remainingText = remainingText.substring(0, range.start) + ' ' + remainingText.substring(range.end);
    }
    
    // 处理剩余文本：移除常见的时间、规划类词汇（但要小心不要误删地标中的字）
    // 注意：不要替换"天"字，因为"天安门"、"天坛"都包含它
    // 先处理分隔符，避免破坏"城市+POI"组合
    const q = remainingText
      .replace(/规划|安排|行程|旅行|旅游|游玩|游|日|一共|包含|包括|想去|打卡|去|到|在/g, ' ')
      .replace(/[，,。.!！？?]/g, ' ')
      .replace(/和|以及|还有|跟|与/g, ' ')
      .replace(/\s+/g, ' '); // 统一多个空格为单个空格

    // 分割成词（先按空格分割）
    let terms = q.split(' ').map(s => s.trim()).filter(Boolean);

    // 如果仍然只有一条很长的，再按中文逗号/顿号切一次
    // 但要注意：不要破坏"城市+POI"组合（如"宁波宁海十里红妆"）
    terms = terms.flatMap(t => {
      // 如果包含多个城市名，不要按顿号分割（保持完整，由实体拆分逻辑处理）
      const cityCount = cities.filter(city => t.includes(city)).length;
      if (cityCount > 1) {
        return [t]; // 保持完整
      }
      // 否则按顿号分割
      return t.split(/[、,]/).map(s => s.trim()).filter(Boolean);
    });

    // 合并地标和其他词汇
    const allTerms = [...foundLandmarks, ...terms];

    // 提取城市名（用于后续过滤）
    const city = this.extractCityName(raw);

    // 去重并过滤：
    // 1. 太短的词（少于2个字符）
    // 2. 包含城市名的词（如"5天北京"、"北京游"等，这些不是 POI 实体）
    // 3. 纯数字词（如"5天"、"3日"等）
    // 4. 包含省份名的词（如"5天浙江省"）
    const uniqueTerms = Array.from(new Set(allTerms))
      .filter(term => {
        if (term.length < 2) return false;
        if (/^\d+$/.test(term)) return false; // 纯数字
        if (city && term.includes(city)) return false; // 包含城市名（如"5天北京"）
        // 过滤包含省份名的词（如"5天浙江省"、"浙江省游"），但保留已识别的地标
        if (/省|市|县|区/.test(term) && !foundLandmarks.includes(term)) return false;
        // 过滤包含城市名但长度过短的词（如"宁波宁海十"）
        if (cities.some(c => term.includes(c) && term.length < 4)) return false;
        return true;
      })
      .slice(0, 8); // 最多8个关键词

    this.logger.debug(`关键词抽取: "${raw}" -> city: ${city || 'null'}, keywords: [${uniqueTerms.join(', ')}]`);
    return { city, keywords: uniqueTerms };
  }

  /**
   * 关键词搜索（使用抽取的关键词做 OR 查询）
   * 
   * 增强功能：
   * 1. 城市过滤：如果 query 明确提到城市，只返回该城市的 POI
   * 2. 类别过滤：如果检测到地标关键词（如"故宫"、"天安门"），优先 ATTRACTION
   */
  private async keywordSearch(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    city?: string | null, // 允许外部传入 city（可能为 null 表示禁用过滤）
    limit: number = 20
  ): Promise<KeywordSearchResult[]> {
    // 抽取关键词和城市（如果外部未传入 city）
    const extracted = this.extractKeywords(query);
    const effectiveCity = city !== undefined ? city : extracted.city;
    
    // 如果没有关键词，使用原始 query（降级）
    const keywords = extracted.keywords.length > 0 ? extracted.keywords : [query];
    
    // 检测地标关键词，如果存在则优先 ATTRACTION 类别
    const landmarkKeywords = ['故宫', '天安门', '长城', '颐和园', '天坛', '圆明园', '北海', '景山'];
    const hasLandmark = keywords.some(k => landmarkKeywords.includes(k));
    const preferredCategory = hasLandmark && !category ? 'ATTRACTION' : category;

    // 构建 OR 查询条件：每个关键词匹配 nameCN、nameEN 或 address
    const keywordConditions = keywords.map(keyword => 
      Prisma.sql`(
        "nameCN" ILIKE ${`%${keyword}%`} OR
        "nameEN" ILIKE ${`%${keyword}%`} OR
        address ILIKE ${`%${keyword}%`}
      )`
    );

    // 所有关键词条件用 OR 连接
    const searchCondition = keywordConditions.length > 0
      ? Prisma.sql`(${Prisma.join(keywordConditions, ' OR ')})`
      : Prisma.sql`FALSE`;

    // 类别过滤：优先 ATTRACTION（如果检测到地标），否则使用传入的 category
    const categoryFilter = preferredCategory
      ? Prisma.sql`AND category = ${preferredCategory}::"PlaceCategory"`
      : Prisma.sql``;
    
    // 城市过滤：如果 query 明确提到城市，先查询 City 表获取 cityId，然后用 cityId 过滤
    let cityFilter = Prisma.sql``;
    if (city) {
      // 先查询 City 表获取匹配的 cityId（支持模糊匹配）
      const matchingCities = await this.prisma.$queryRaw<Array<{ id: number; nameCN: string; name: string }>>`
        SELECT id, "nameCN", name FROM "City" 
        WHERE "nameCN" = ${city} 
           OR "nameCN" LIKE ${`%${city}%`}
           OR name = ${city}
           OR name LIKE ${`%${city}%`}
           OR "nameEN" = ${city}
           OR "nameEN" LIKE ${`%${city}%`}
        LIMIT 10
      `;
      
      const cityIds = matchingCities.map(c => c.id);
      
      if (cityIds.length > 0) {
        // 使用 IN 子查询过滤，比 EXISTS 更高效
        // 将 cityIds 转换为 Prisma.sql 数组
        const cityIdSqls = cityIds.map(id => Prisma.sql`${id}`);
        cityFilter = Prisma.sql`AND "cityId" IN (${Prisma.join(cityIdSqls, ', ')})`;
        this.logger.debug(`[keywordSearch] 城市过滤: ${effectiveCity} -> cityIds: [${cityIds.join(', ')}] (匹配到: ${matchingCities.map(c => `${c.nameCN}/${c.name}`).join(', ')})`);
      } else {
        this.logger.warn(`[keywordSearch] 未找到匹配的城市: ${effectiveCity}，将搜索所有城市`);
        // 如果找不到匹配的城市，不添加过滤条件（返回所有城市的 POI）
      }
    }

    const locationFilter = lat && lng && radius
      ? Prisma.sql`AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
      : Prisma.sql``;

    const distanceSelect = lat && lng
      ? Prisma.sql`, ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters`
      : Prisma.sql``;

    // 构建评分逻辑：检查是否有任何关键词匹配
    // 优先匹配 nameCN（1.0），然后是 nameEN（0.8），最后是 address（0.6）
    // 如果匹配多个关键词，分数累加（但不超过 1.0）
    const keywordMatches = keywords.map(keyword => 
      Prisma.sql`(
        CASE WHEN "nameCN" ILIKE ${`%${keyword}%`} THEN 1.0
             WHEN "nameEN" ILIKE ${`%${keyword}%`} THEN 0.8
             WHEN address ILIKE ${`%${keyword}%`} THEN 0.6
             ELSE 0 END
      )`
    );

    const scoreCase = keywordMatches.length > 0
      ? Prisma.sql`LEAST(${Prisma.join(keywordMatches, ' + ')}, 1.0)`
      : Prisma.sql`0.4`;

    // 诊断信息：打印 SQL 查询条件
    this.logger.debug(`[keywordSearch] SQL 查询条件: {
  keywords: [${keywords.join(', ')}],
  cityFilter: ${city || 'none'},
  categoryFilter: ${preferredCategory || 'none'},
  locationFilter: ${lat && lng && radius ? `ST_DWithin(${lat}, ${lng}, ${radius}m)` : 'none'},
  limit: ${limit}
}`);

    const results = await this.prisma.$queryRaw<KeywordSearchResult[]>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        ${scoreCase} as "keywordScore"
        ${distanceSelect}
      FROM "Place"
      WHERE ${searchCondition}
        ${categoryFilter}
        ${cityFilter}
        ${locationFilter}
      ORDER BY "keywordScore" DESC
      LIMIT ${limit}
    `;

    this.logger.debug(`[keywordSearch] 数据库查询结果数: ${results.length}`);
    
    // 检查总数据量
    const totalCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place"
    `;
    this.logger.debug(`[keywordSearch] 数据库中 Place 总数: ${totalCount[0]?.count || 0}`);
    
    // 检查城市匹配的数据量
    if (city) {
      const cityCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "Place" p
        INNER JOIN "City" c ON c.id = p."cityId"
        WHERE c."nameCN" = ${city} OR c.name = ${city}
      `;
      this.logger.debug(`[keywordSearch] 数据库中 ${city} 的 Place 总数: ${cityCount[0]?.count || 0}`);
    }

    return results.map((r) => ({
      ...r,
      keywordScore: parseFloat(r.keywordScore as any),
      lat: r.lat ? parseFloat(r.lat as any) : undefined,
      lng: r.lng ? parseFloat(r.lng as any) : undefined,
      distance: r.distance ? parseFloat(r.distance as any) : undefined,
    }));
  }

  /**
   * 多城市查询：按实体拆分搜索
   * 
   * 策略：将查询拆分为多个实体片段，每个实体关联一个城市提示
   * 例如："杭州西湖 + 宁波宁海十里红妆" -> 
   *   - 实体1: "西湖" + cityHint: "杭州"
   *   - 实体2: "十里红妆" + cityHint: "宁波" 或 "宁海"
   */
  private async hybridSearchMultiCity(
    query: string,
    cities: string[],
    keywords: string[],
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    limit: number = 20
  ): Promise<HybridSearchResult[]> {
    this.logger.debug(`[hybridSearchMultiCity] 开始多城市拆分搜索: cities=[${cities.join(', ')}], keywords=[${keywords.join(', ')}]`);
    
    // 1. 将查询拆分为实体片段（每个实体关联一个城市）
    const entities = this.splitQueryIntoEntities(query, cities, keywords);
    
    this.logger.debug(`[hybridSearchMultiCity] 拆分后的实体: ${JSON.stringify(entities, null, 2)}`);
    
    // 2. 对每个实体分别搜索
    const searchPromises = entities.map(async (entity) => {
      const entityQuery = entity.name;
      const entityCity = entity.cityHint;
      
      this.logger.debug(`[hybridSearchMultiCity] 搜索实体: "${entityQuery}" (cityHint: ${entityCity || 'null'})`);
      
      // 使用单实体搜索逻辑（传入 cityHint）
      const results = await this.hybridSearchSingleEntity(
        entityQuery,
        entityCity,
        lat,
        lng,
        radius,
        category,
        Math.ceil(limit / entities.length) // 每个实体分配一部分 limit
      );
      
      return results;
    });
    
    // 3. 等待所有搜索完成
    const allResults = await Promise.all(searchPromises);
    
    // 4. 合并结果并去重（按 id）
    const resultMap = new Map<number, HybridSearchResult>();
    
    for (const results of allResults) {
      for (const result of results) {
        const existing = resultMap.get(result.id);
        if (existing) {
          // 如果已存在，保留分数更高的
          if (result.finalScore > existing.finalScore) {
            resultMap.set(result.id, result);
          }
        } else {
          resultMap.set(result.id, result);
        }
      }
    }
    
    // 5. 按分数排序并返回
    const mergedResults = Array.from(resultMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
    
    this.logger.debug(`[hybridSearchMultiCity] 合并后结果数: ${mergedResults.length}`);
    
    return mergedResults;
  }

  /**
   * 单实体搜索（内部方法，用于多城市拆分搜索）
   */
  private async hybridSearchSingleEntity(
    query: string,
    cityHint: string | null,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    limit: number = 20
  ): Promise<HybridSearchResult[]> {
    // 检查数据库中是否有 embedding 数据
    const placesWithEmbedding = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
    const embeddingCount = Number(placesWithEmbedding[0]?.count || 0);
    
    if (embeddingCount === 0) {
      // 无 embedding 数据，使用关键词搜索
      const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit);
      return keywordResults.map(r => ({
        id: r.id,
        nameCN: r.nameCN,
        nameEN: r.nameEN,
        address: r.address,
        category: r.category,
        lat: r.lat,
        lng: r.lng,
        vectorScore: 0,
        keywordScore: r.keywordScore,
        finalScore: r.keywordScore,
        matchReasons: ['关键词匹配（无 embedding 数据）'],
        distance: r.distance,
      }));
    }

    // 生成查询向量
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    const isZeroVector = queryEmbedding.every(v => v === 0);
    
    if (isZeroVector) {
      // 零向量，降级到关键词搜索
      const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit);
      return keywordResults.map(r => ({
        id: r.id,
        nameCN: r.nameCN,
        nameEN: r.nameEN,
        address: r.address,
        category: r.category,
        lat: r.lat,
        lng: r.lng,
        vectorScore: 0,
        keywordScore: r.keywordScore,
        finalScore: r.keywordScore,
        matchReasons: ['关键词匹配（embedding 降级）'],
        distance: r.distance,
      }));
    }

    // 向量搜索 + 关键词搜索
    const vectorResults = await this.vectorSearch(
      queryEmbedding,
      lat,
      lng,
      radius,
      category,
      cityHint, // 使用 cityHint 而不是 null
      limit * 2
    );
    
    const keywordResults = await this.keywordSearch(
      query,
      lat,
      lng,
      radius,
      category,
      cityHint, // 使用 cityHint 而不是 null
      limit * 2
    );

    // 合并结果
    const resultMap = new Map<number, HybridSearchResult>();
    
    vectorResults.forEach((result) => {
      resultMap.set(result.id, {
        id: result.id,
        nameCN: result.nameCN,
        nameEN: result.nameEN,
        address: result.address,
        category: result.category,
        lat: result.lat ? parseFloat(result.lat as any) : undefined,
        lng: result.lng ? parseFloat(result.lng as any) : undefined,
        vectorScore: result.vectorScore,
        keywordScore: 0,
        finalScore: result.vectorScore * 0.7,
        matchReasons: [],
        distance: result.distance,
      });
    });
    
    keywordResults.forEach((result) => {
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.keywordScore = result.keywordScore;
        existing.finalScore = existing.vectorScore * 0.7 + result.keywordScore * 0.3;
        if (!existing.lat && result.lat) {
          existing.lat = result.lat ? parseFloat(result.lat as any) : undefined;
          existing.lng = result.lng ? parseFloat(result.lng as any) : undefined;
        }
      } else {
        resultMap.set(result.id, {
          id: result.id,
          nameCN: result.nameCN,
          nameEN: result.nameEN,
          address: result.address,
          category: result.category,
          lat: result.lat ? parseFloat(result.lat as any) : undefined,
          lng: result.lng ? parseFloat(result.lng as any) : undefined,
          vectorScore: 0,
          keywordScore: result.keywordScore,
          finalScore: result.keywordScore * 0.3,
          matchReasons: [],
          distance: result.distance,
        });
      }
    });

    // 获取完整地点信息并生成推荐原因
    const results = Array.from(resultMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    const placeIds = results.map((r) => r.id);
    const places = await this.prisma.place.findMany({
      where: { id: { in: placeIds } },
      select: {
        id: true,
        metadata: true,
      },
    });

    const placeMap = new Map(places.map((p) => [p.id, p]));

    return results.map((result) => {
      const place = placeMap.get(result.id);
      if (place) {
        result.matchReasons = this.extractMatchReasons(
          place,
          query,
          result.vectorScore,
          result.keywordScore
        );
      }
      return result;
    });
  }

  /**
   * 将查询拆分为实体片段
   * 
   * 示例：
   * "5天浙江省，包含杭州西湖和宁波宁海十里红妆" ->
   * [
   *   { name: "西湖", cityHint: "杭州" },
   *   { name: "十里红妆", cityHint: "宁波" }
   * ]
   */
  private splitQueryIntoEntities(
    query: string,
    cities: string[],
    keywords: string[]
  ): Array<{ name: string; cityHint: string | null }> {
    const entities: Array<{ name: string; cityHint: string | null }> = [];
    const processedKeywords = new Set<string>();
    
    // 策略1: 识别"城市+POI"组合（如"杭州西湖"、"宁波宁海十里红妆"）
    // 对于每个城市，查找紧邻的POI关键词（使用模式匹配，不依赖硬编码列表）
    for (const city of cities) {
      const cityIndex = query.indexOf(city);
      if (cityIndex >= 0) {
        // 查找城市后面的文本（最多30个字符，支持更长的POI名称）
        const afterCity = query.substring(cityIndex + city.length, cityIndex + city.length + 30);
        
        // 使用正则匹配：城市后面跟着2-8个中文字符的POI名称
        // 匹配模式：城市名 + 2-8个中文字符（排除标点、空格、常见连接词）
        // 注意：需要排除下一个城市名（如"宁波宁海十里红妆"中，"宁海"是下一个城市）
        const poiPattern = /^([^\s，,。.!！？?和以及还有跟与省市县区]{2,8})/;
        const match = afterCity.match(poiPattern);
        
        if (match && match[1]) {
          const landmark = match[1];
          
          // 检查landmark是否包含其他城市名（如"宁海十里红妆"中的"宁海"）
          let foundNestedCity = false;
          for (const otherCity of cities) {
            if (otherCity !== city && landmark.includes(otherCity)) {
              // 如果landmark包含其他城市名，尝试提取城市名之后的部分
              const otherCityIndex = landmark.indexOf(otherCity);
              if (otherCityIndex >= 0) {
                const afterOtherCity = landmark.substring(otherCityIndex + otherCity.length);
                // 支持更长的POI名称（最多30个字符）
                if (afterOtherCity.length >= 2 && afterOtherCity.length <= 30) {
                  // 找到"城市+POI"组合，如"宁海十里红妆" -> "十里红妆"
                  entities.push({
                    name: afterOtherCity,
                    cityHint: otherCity,
                  });
                  processedKeywords.add(afterOtherCity);
                  foundNestedCity = true;
                  break;
                }
              }
            }
          }
          
          // 如果landmark不包含其他城市名，且不包含当前城市名，则作为POI
          if (!foundNestedCity && landmark.length >= 2 && landmark.length <= 30 && !landmark.includes(city)) {
            entities.push({
              name: landmark,
              cityHint: city,
            });
            processedKeywords.add(landmark);
          }
        }
      }
    }
    
    // 策略2: 处理剩余的关键词（从 extractKeywords 提取的关键词）
    for (const keyword of keywords) {
      // 跳过已经匹配的关键词
      if (processedKeywords.has(keyword) || entities.some(e => e.name === keyword || keyword.includes(e.name) || e.name.includes(keyword))) {
        continue;
      }
      
      // 检查关键词是否包含城市名，或者关键词在查询中紧邻城市名
      let matchedCity: string | null = null;
      
      for (const city of cities) {
        // 如果关键词包含城市名，或者关键词在查询中紧邻城市名
        if (keyword.includes(city) || query.includes(`${city}${keyword}`) || query.includes(`${keyword}${city}`)) {
          matchedCity = city;
          break;
        }
      }
      
      // 如果没有直接匹配，尝试根据查询中的位置推断
      if (!matchedCity && cities.length > 0) {
        // 查找关键词在查询中的位置，找到最近的城市
        const keywordIndex = query.indexOf(keyword);
        if (keywordIndex >= 0) {
          let minDistance = Infinity;
          let nearestCity: string | null = null;
          
          for (const city of cities) {
            const cityIndex = query.indexOf(city);
            if (cityIndex >= 0) {
              const distance = Math.abs(cityIndex - keywordIndex);
              if (distance < minDistance && distance < 10) { // 只考虑距离小于10个字符的城市
                minDistance = distance;
                nearestCity = city;
              }
            }
          }
          
          matchedCity = nearestCity;
        }
      }
      
      // 如果仍然没有匹配，跳过这个关键词（可能是无效关键词如"5天浙江省"）
      if (!matchedCity) {
        continue;
      }
      
      entities.push({
        name: keyword,
        cityHint: matchedCity,
      });
      processedKeywords.add(keyword);
    }
    
    // 如果没有找到任何实体，使用原始查询（但禁用城市过滤）
    if (entities.length === 0) {
      entities.push({
        name: query,
        cityHint: null, // 多城市时禁用过滤
      });
    }
    
    return entities;
  }

  /**
   * 提取匹配原因
   */
  private extractMatchReasons(
    place: { id: number; metadata: any },
    query: string,
    vectorScore: number,
    keywordScore: number
  ): string[] {
    const reasons: string[] = [];
    const metadata = place.metadata as any;

    // 向量相似度高，提取语义匹配原因
    if (vectorScore > 0.7) {
      // 检查评论中的关键词
      if (metadata?.reviews) {
        const reviews = Array.isArray(metadata.reviews) ? metadata.reviews : [];
        const keywords: string[] = [];

        reviews.forEach((review: any) => {
          const text = (review.text || '').toLowerCase();
          // 提取与查询相关的关键词（简化版）
          if (text.includes('安静') || text.includes('静谧')) keywords.push('静谧');
          if (text.includes('日式') || text.includes('和风')) keywords.push('日式');
          if (text.includes('庭院') || text.includes('花园')) keywords.push('庭院');
          if (text.includes('冥想') || text.includes('静心')) keywords.push('适合冥想');
        });

        if (keywords.length > 0) {
          const uniqueKeywords = Array.from(new Set(keywords));
          reasons.push(`根据评论提到的"${uniqueKeywords.join('"、"')}"推荐`);
        }
      }

      // 检查标签
      if (metadata?.tags) {
        const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
        const matchingTags = tags.filter((tag: string) => {
          const tagLower = tag.toLowerCase();
          return (
            tagLower.includes('日式') ||
            tagLower.includes('庭院') ||
            tagLower.includes('安静') ||
            tagLower.includes('静谧') ||
            tagLower.includes('京都')
          );
        });

        if (matchingTags.length > 0) {
          reasons.push(`标签：${matchingTags.join('、')}`);
        }
      }

      // 检查描述
      if (metadata?.description) {
        const desc = (metadata.description as string).toLowerCase();
        if (desc.includes('日式') || desc.includes('和风')) {
          reasons.push('描述中提到日式风格');
        }
        if (desc.includes('安静') || desc.includes('静谧')) {
          reasons.push('描述中提到安静氛围');
        }
      }
    }

    // 关键词匹配
    if (keywordScore > 0.5) {
      if (metadata?.nameCN?.includes(query)) {
        reasons.push(`名称包含"${query}"`);
      } else if (metadata?.nameEN?.toLowerCase().includes(query.toLowerCase())) {
        reasons.push(`英文名称包含"${query}"`);
      }
    }

    // 如果没有找到具体原因，使用通用原因
    if (reasons.length === 0) {
      if (vectorScore > 0.7) {
        reasons.push('语义相似度高');
      } else if (keywordScore > 0.5) {
        reasons.push('关键词匹配');
      }
    }

    return reasons;
  }
}

