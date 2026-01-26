// src/rag/services/query-intent.service.ts
/**
 * Query意图分类服务
 * 
 * 职责：
 * - 分析用户查询的意图类型
 * - 自动推荐chunkCategory过滤
 * - 提供同义词扩展建议
 * 
 * 意图类型：
 * - ROUTE: 路线规划、行程、自驾
 * - WEATHER: 天气、气候、季节
 * - POI: 景点、住宿、餐厅
 * - SAFETY: 安全、危险、注意事项
 * - RENTAL: 租车、保险、费用
 * - GENERAL: 通用查询
 */

import { Injectable, Logger } from '@nestjs/common';

export type QueryIntentType = 'ROUTE' | 'WEATHER' | 'POI' | 'SAFETY' | 'RENTAL' | 'GENERAL';

export interface QueryIntent {
  type: QueryIntentType;
  confidence: number; // 0-1
  suggestedChunkCategory?: string; // 建议的chunkCategory过滤
  expandedKeywords: string[]; // 扩展的关键词
  reasoning: string; // 分类原因
}

// 意图关键词映射
const INTENT_KEYWORDS: Record<QueryIntentType, { 
  keywords: string[]; 
  chunkCategory?: string;
  synonyms: Record<string, string[]>;
}> = {
  ROUTE: {
    keywords: ['路线', '环岛', '自驾', '行程', '几天', '天数', '规划', 'ring road', '一号公路', '环线', '绕岛'],
    // ROUTE类型不使用category过滤，因为路线信息分布在多个category中
    // 依赖Sparse检索的关键词扩展（环岛→ring-road）来提高召回
    chunkCategory: undefined,
    synonyms: {
      '环岛': ['ring road', 'ring-road', 'route 1', '一号公路', '环线', '绕岛一圈'],
      '路线': ['route', '行程', '路径', 'itinerary'],
      '自驾': ['驾车', '开车', '租车自驾', 'self-drive'],
    },
  },
  WEATHER: {
    keywords: ['天气', '气候', '温度', '几月', '季节', '下雨', '下雪', '极光', '日照', 'weather', 'climate'],
    chunkCategory: 'WEATHER',
    synonyms: {
      '天气': ['气候', '气温', 'weather'],
      '极光': ['北极光', 'aurora', 'northern lights'],
      '季节': ['月份', '时节'],
    },
  },
  POI: {
    keywords: ['景点', '住宿', '酒店', '餐厅', '瀑布', '冰川', '温泉', '蓝湖', 'blue lagoon', '冰河湖', '黑沙滩'],
    chunkCategory: 'POI_INFO',
    synonyms: {
      '蓝湖': ['blue lagoon', '蓝色温泉'],
      '冰河湖': ['jökulsárlón', '杰古沙龙'],
      '住宿': ['酒店', '民宿', '旅馆', 'hotel'],
    },
  },
  SAFETY: {
    keywords: ['安全', '危险', '注意', '风险', '事故', '警告', '禁止', 'F路', '高地', '浪', '规则'],
    chunkCategory: 'RULES',
    synonyms: {
      '安全': ['危险', '风险', '注意事项'],
      'F路': ['f-road', '高地路', 'highland'],
    },
  },
  RENTAL: {
    keywords: ['租车', '保险', '费用', '价格', '预算', '租金', '车型', '四驱'],
    chunkCategory: 'GENERAL',
    synonyms: {
      '租车': ['car rental', '租赁', '借车'],
      '保险': ['insurance', '全险', '碎石险'],
      '四驱': ['4x4', 'SUV', '四驱车'],
    },
  },
  GENERAL: {
    keywords: [],
    synonyms: {},
  },
};

@Injectable()
export class QueryIntentService {
  private readonly logger = new Logger(QueryIntentService.name);

  /**
   * 分析查询意图
   */
  classifyIntent(query: string): QueryIntent {
    const normalizedQuery = query.toLowerCase().trim();
    
    // 计算每个意图类型的匹配分数
    const scores: Record<QueryIntentType, { score: number; matches: string[] }> = {
      ROUTE: { score: 0, matches: [] },
      WEATHER: { score: 0, matches: [] },
      POI: { score: 0, matches: [] },
      SAFETY: { score: 0, matches: [] },
      RENTAL: { score: 0, matches: [] },
      GENERAL: { score: 0, matches: [] },
    };

    // 遍历每个意图类型
    for (const [intentType, config] of Object.entries(INTENT_KEYWORDS) as [QueryIntentType, typeof INTENT_KEYWORDS[QueryIntentType]][]) {
      for (const keyword of config.keywords) {
        if (normalizedQuery.includes(keyword.toLowerCase())) {
          scores[intentType].score += 1;
          scores[intentType].matches.push(keyword);
        }
      }
    }

    // 找到最高分的意图类型
    let maxScore = 0;
    let maxIntent: QueryIntentType = 'GENERAL';
    let maxMatches: string[] = [];

    for (const [intentType, result] of Object.entries(scores) as [QueryIntentType, { score: number; matches: string[] }][]) {
      if (result.score > maxScore) {
        maxScore = result.score;
        maxIntent = intentType;
        maxMatches = result.matches;
      }
    }

    // 计算置信度
    const totalKeywords = Object.values(INTENT_KEYWORDS)
      .flatMap(c => c.keywords)
      .filter(k => normalizedQuery.includes(k.toLowerCase())).length;
    const confidence = totalKeywords > 0 ? Math.min(maxScore / totalKeywords, 1) : 0.5;

    // 收集扩展关键词
    const expandedKeywords = this.expandKeywords(normalizedQuery, maxIntent);

    const config = INTENT_KEYWORDS[maxIntent];
    
    const result: QueryIntent = {
      type: maxIntent,
      confidence,
      suggestedChunkCategory: config.chunkCategory,
      expandedKeywords,
      reasoning: maxMatches.length > 0 
        ? `匹配关键词: ${maxMatches.join(', ')}`
        : '无明确关键词匹配，默认为通用查询',
    };

    this.logger.debug(
      `Query意图分类: "${query.substring(0, 50)}..." → ${result.type} (confidence: ${result.confidence.toFixed(2)})`
    );

    return result;
  }

  /**
   * 扩展查询关键词
   */
  expandKeywords(query: string, intentType: QueryIntentType): string[] {
    const config = INTENT_KEYWORDS[intentType];
    const expanded: Set<string> = new Set();
    const normalizedQuery = query.toLowerCase();

    // 添加同义词扩展
    for (const [keyword, synonyms] of Object.entries(config.synonyms)) {
      if (normalizedQuery.includes(keyword.toLowerCase())) {
        synonyms.forEach(syn => expanded.add(syn));
      }
      // 反向：如果查询中包含同义词，也添加原关键词
      for (const syn of synonyms) {
        if (normalizedQuery.includes(syn.toLowerCase())) {
          expanded.add(keyword);
          synonyms.forEach(s => expanded.add(s));
        }
      }
    }

    return Array.from(expanded);
  }

  /**
   * 获取查询的关键词增强版本
   */
  enhanceQuery(query: string): string {
    const intent = this.classifyIntent(query);
    
    if (intent.expandedKeywords.length === 0) {
      return query;
    }

    // 将扩展关键词添加到查询中（用于Sparse检索增强）
    const enhancedParts = [query, ...intent.expandedKeywords.slice(0, 3)];
    return enhancedParts.join(' ');
  }

  /**
   * 判断是否应该使用chunkCategory过滤
   */
  shouldFilterByCategory(intent: QueryIntent): boolean {
    // 只有高置信度且明确类型时才建议过滤
    return intent.confidence >= 0.6 && intent.type !== 'GENERAL' && !!intent.suggestedChunkCategory;
  }
}
