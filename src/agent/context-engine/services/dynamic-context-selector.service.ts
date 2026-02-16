// src/agent/context-engine/services/dynamic-context-selector.service.ts
/**
 * Dynamic Context Selector
 *
 * Context Orchestrator 核心：根据 userQuery + phase 动态推断所需/排除的主题
 *
 * 原则：按需注入，减少 Token 浪费，提升推理质量
 */

import { Injectable, Logger } from '@nestjs/common';

/** 国家包主题（countryPack.getBlocks 的 topics 参数） */
export type CountryPackTopic =
  | 'VISA'
  | 'DRONE'
  | 'ROAD_RULES'
  | 'MONEY'
  | 'SAFETY'
  | 'WEATHER_WINDOWS'
  | 'LOCAL_TRANSPORT'
  | 'BOOKING_NORMS';

/** Block 类型（用于 excludeTopics 过滤） */
export type ExcludeBlockType =
  | 'WORLD_MODEL'
  | 'COUNTRY_VISA'
  | 'COUNTRY_DRONE'
  | 'COUNTRY_ROAD_RULES'
  | 'COUNTRY_MONEY'
  | 'COUNTRY_SAFETY'
  | 'COUNTRY_WEATHER'
  | 'COUNTRY_TRANSPORT'
  | 'COUNTRY_BOOKING'
  | 'ABU_RULES'
  | 'DRDRE_RULES'
  | 'NEPTUNE_RULES'
  | 'PLAN_SUMMARY'
  | 'PLAN_DAY'
  | 'PLAN_SEGMENT'
  | 'DECISION_LOG'
  | 'REJECTION_LOG'
  | 'TOOL_OUTPUT'
  | 'USER_PROFILE'
  | 'CONSTRAINTS';

export interface DynamicContextSelectResult {
  /** 需要包含的国家包主题（传给 buildCountryPackBlocks） */
  requiredTopics: CountryPackTopic[];
  /** 需要排除的 Block 类型（用于 sortAndTrimBlocks 过滤） */
  excludeBlockTypes: ExcludeBlockType[];
}

/** 关键词 -> 国家包主题 映射规则 */
const QUERY_TO_TOPICS: Array<{
  keywords: (string | RegExp)[];
  topics: CountryPackTopic[];
}> = [
  // 安全相关
  {
    keywords: ['安全', '风险', '危险', '自驾', '开车', '驾驶', '封路', '路况'],
    topics: ['SAFETY', 'ROAD_RULES', 'WEATHER_WINDOWS'],
  },
  {
    keywords: ['签证', '证件', '入境', '申根', '免签', '过境签', 'visa'],
    topics: ['VISA'],
  },
  {
    keywords: ['无人机', 'drone'],
    topics: ['DRONE'],
  },
  {
    keywords: ['天气', '气候', '雨季', '冬季', '封山'],
    topics: ['WEATHER_WINDOWS'],
  },
  {
    keywords: ['货币', '换汇', '支付', '预算', '费用', '花钱', '多少钱', '花费', '人均', '便宜', '贵不贵', 'budget', 'cost'],
    topics: ['MONEY'],
  },
  {
    keywords: ['交通', '公交', '租车', '渡轮', '大巴', '自驾'],
    topics: ['LOCAL_TRANSPORT'],
  },
  {
    keywords: ['预订', '酒店', '住宿', '民宿', 'airbnb', 'booking', '住哪', '住在哪'],
    topics: ['BOOKING_NORMS'],
  },
];

/** Phase 默认主题（当无法从 query 推断时的 fallback） */
const PHASE_DEFAULT_TOPICS: Record<string, CountryPackTopic[]> = {
  planning: ['VISA', 'SAFETY', 'WEATHER_WINDOWS', 'ROAD_RULES'],
  intake: ['VISA', 'SAFETY', 'WEATHER_WINDOWS'],
  decision: ['SAFETY', 'ROAD_RULES', 'WEATHER_WINDOWS'],
  adjustment: ['ROAD_RULES', 'WEATHER_WINDOWS'],
  repair: ['ROAD_RULES', 'SAFETY'],
  readiness: ['VISA', 'MONEY', 'LOCAL_TRANSPORT'],
};

/** 关键词 -> 需要排除的 Block 类型 */
const QUERY_TO_EXCLUDE: Array<{
  keywords: (string | RegExp)[];
  exclude: ExcludeBlockType[];
}> = [
  {
    keywords: ['安全吗', '自驾安全', '危险吗'],
    exclude: ['PLAN_DAY', 'PLAN_SEGMENT', 'COUNTRY_BOOKING', 'COUNTRY_MONEY'],
  },
  {
    keywords: ['签证', '申根', '免签'],
    exclude: ['PLAN_DAY', 'PLAN_SEGMENT', 'COUNTRY_BOOKING'],
  },
  {
    keywords: ['天气', '气候'],
    exclude: ['COUNTRY_BOOKING', 'COUNTRY_MONEY'],
  },
  {
    keywords: ['预算', '多少钱', '花费', '费用', '便宜', '贵不贵', 'budget', 'cost'],
    exclude: ['PLAN_DAY', 'PLAN_SEGMENT', 'COUNTRY_VISA', 'COUNTRY_DRONE'],
  },
  {
    keywords: ['酒店', '住宿', '民宿', 'airbnb', '住哪', '住在哪'],
    exclude: ['COUNTRY_VISA', 'COUNTRY_DRONE', 'COUNTRY_ROAD_RULES'],
  },
];

@Injectable()
export class DynamicContextSelectorService {
  private readonly logger = new Logger(DynamicContextSelectorService.name);

  /**
   * 根据 userQuery 和 phase 动态推断所需主题与排除块
   *
   * @param userQuery 用户请求
   * @param phase 规划阶段
   * @param agent 当前 Agent（可选，用于细化）
   */
  select(userQuery: string, phase: string, agent?: string): DynamicContextSelectResult {
    const queryLower = userQuery?.trim().toLowerCase() || '';
    const phaseLower = phase?.toLowerCase() || '';

    // 1. 从 query 推断 requiredTopics
    const inferredTopics = this.inferTopicsFromQuery(queryLower);

    // 2. 合并 phase 默认主题（取并集，优先 query 推断）
    const phaseDefaults = PHASE_DEFAULT_TOPICS[phaseLower] || PHASE_DEFAULT_TOPICS.planning;
    const requiredTopics = this.mergeTopics(inferredTopics, phaseDefaults);

    // 3. 从 query 推断 excludeBlockTypes
    const excludeBlockTypes = this.inferExcludeFromQuery(queryLower);

    this.logger.debug(
      `dynamicContextSelect: query="${queryLower.substring(0, 50)}...", ` +
        `phase=${phase}, requiredTopics=[${requiredTopics.join(',')}], ` +
        `excludeBlockTypes=[${excludeBlockTypes.join(',')}]`,
    );

    return {
      requiredTopics,
      excludeBlockTypes,
    };
  }

  private inferTopicsFromQuery(query: string): CountryPackTopic[] {
    const matched = new Set<CountryPackTopic>();

    for (const rule of QUERY_TO_TOPICS) {
      const hasMatch = rule.keywords.some((kw) => {
        if (typeof kw === 'string') {
          return query.includes(kw.toLowerCase());
        }
        return kw.test(query);
      });
      if (hasMatch) {
        rule.topics.forEach((t) => matched.add(t));
      }
    }

    return Array.from(matched);
  }

  private mergeTopics(
    inferred: CountryPackTopic[],
    phaseDefaults: CountryPackTopic[],
  ): CountryPackTopic[] {
    if (inferred.length > 0) {
      return Array.from(new Set([...inferred]));
    }
    return Array.from(new Set(phaseDefaults));
  }

  private inferExcludeFromQuery(query: string): ExcludeBlockType[] {
    const exclude = new Set<ExcludeBlockType>();

    for (const rule of QUERY_TO_EXCLUDE) {
      const hasMatch = rule.keywords.some((kw) => {
        if (typeof kw === 'string') {
          return query.includes(kw.toLowerCase());
        }
        return kw.test(query);
      });
      if (hasMatch) {
        rule.exclude.forEach((e) => exclude.add(e));
      }
    }

    return Array.from(exclude);
  }
}
