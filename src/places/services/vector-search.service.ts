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

    // 1. 生成查询向量
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    
    // 检查是否为降级后的零向量（embedding 失败时的降级策略）
    const isZeroVector = queryEmbedding.every(v => v === 0);
    
    if (isZeroVector) {
      this.logger.warn('检测到零向量（embedding 失败），降级到纯关键词搜索');
      // 直接使用关键词搜索，跳过向量搜索
      const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, limit);
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

    // 2. 向量搜索
    const vectorResults = await this.vectorSearch(
      queryEmbedding,
      lat,
      lng,
      radius,
      category,
      limit * 2 // 召回更多结果用于混合
    );

    // 3. 关键词搜索
    const keywordResults = await this.keywordSearch(
      query,
      lat,
      lng,
      radius,
      category,
      limit * 2
    );

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
      } else {
        resultMap.set(result.id, {
          id: result.id,
          nameCN: result.nameCN,
          nameEN: result.nameEN,
          address: result.address,
          category: result.category,
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
    limit: number = 20
  ): Promise<VectorSearchResult[]> {
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

    const distanceSelect = lat && lng
      ? Prisma.sql`, ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters`
      : Prisma.sql``;

    // 使用 pgvector 的余弦相似度（<=> 操作符）
    // 1 - (embedding <=> query) 得到相似度分数（0-1）
    const results = await this.prisma.$queryRaw<VectorSearchResult[]>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        1 - (embedding <=> ${queryEmbedding}::vector) as "vectorScore"
        ${distanceSelect}
      FROM "Place"
      WHERE embedding IS NOT NULL
        ${categoryFilter}
        ${locationFilter}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      ...r,
      vectorScore: parseFloat(r.vectorScore as any),
      distance: r.distance ? parseFloat(r.distance as any) : undefined,
    }));
  }

  /**
   * 从整句中提取关键词（城市 + POI 词列表）
   * 
   * 示例：
   * "规划5天北京游，包含故宫、天安门" -> ["北京", "故宫", "天安门"]
   */
  private extractKeywords(raw: string): string[] {
    // 移除常见的时间、规划类词汇
    const q = raw
      .replace(/\s+/g, '')
      .replace(/规划|安排|行程|旅行|旅游|游玩|游|天|日|一共|包含|包括|想去|打卡|去|到|在/g, ' ')
      .replace(/[，,。.!！？?]/g, ' ')
      .replace(/[、/]/g, ' ')
      .replace(/和|以及|还有|跟|与/g, ' ');

    // 分割成词
    let terms = q.split(' ').map(s => s.trim()).filter(Boolean);

    // 如果仍然只有一条很长的，再按中文逗号/顿号切一次
    terms = terms.flatMap(t => t.split(/[，、,]/)).map(s => s.trim()).filter(Boolean);

    // 去重并过滤太短的词（少于2个字符）
    const uniqueTerms = Array.from(new Set(terms))
      .filter(term => term.length >= 2)
      .slice(0, 8); // 最多8个关键词

    this.logger.debug(`关键词抽取: "${raw}" -> [${uniqueTerms.join(', ')}]`);
    return uniqueTerms;
  }

  /**
   * 关键词搜索（使用抽取的关键词做 OR 查询）
   */
  private async keywordSearch(
    query: string,
    lat?: number,
    lng?: number,
    radius?: number,
    category?: string,
    limit: number = 20
  ): Promise<KeywordSearchResult[]> {
    // 抽取关键词
    const keywords = this.extractKeywords(query);
    
    // 如果没有关键词，使用原始 query（降级）
    if (keywords.length === 0) {
      this.logger.warn(`关键词抽取失败，使用原始 query: ${query}`);
      keywords.push(query);
    }

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
        ${locationFilter}
      ORDER BY "keywordScore" DESC
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      ...r,
      keywordScore: parseFloat(r.keywordScore as any),
      lat: r.lat ? parseFloat(r.lat as any) : undefined,
      lng: r.lng ? parseFloat(r.lng as any) : undefined,
      distance: r.distance ? parseFloat(r.distance as any) : undefined,
    }));
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
          const uniqueKeywords = [...new Set(keywords)];
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

