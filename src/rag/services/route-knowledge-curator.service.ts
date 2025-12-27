// src/rag/services/route-knowledge-curator.service.ts
/**
 * Route Knowledge Curator（路线知识整理 Agent）
 * 
 * 用途：
 * - 给某条 RouteDirection 拉：真实游记、当地攻略、Mountaineering / Hiking 报告
 * - 生成：更丰富的 philosophy 文案、推荐理由、用户看到的故事层描述
 * 
 * 这会让你的 RD 不只是几个字段，而是「有灵魂的路线人格」。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { LlmExtractionService } from './llm-extraction.service';

/**
 * 路线哲学叙事
 */
export interface RoutePhilosophyNarrative {
  routeDirectionId: string;
  philosophyExplanation: string;  // 路线哲学的文字说明
  whyThisRoute: string[];         // 为什么选择这条路
  whatToExpect: string[];         // 预期体验
  commonMistakes: string[];        // 常见错误
  evidenceSnippets: string[];      // 原文引用
}

/**
 * 路线段叙事
 */
export interface SegmentNarrative {
  segmentId: string;
  dayIndex: number;
  storyText: string;           // 故事感文案
  practicalTips: string[];     // 实用建议
  localInsights: string[];      // 当地洞察
  evidenceSnippets: string[];    // 原文引用片段
}

@Injectable()
export class RouteKnowledgeCurator {
  private readonly logger = new Logger(RouteKnowledgeCurator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly llmExtraction: LlmExtractionService,
  ) {}

  /**
   * 为 RouteDirection 生成丰富的叙事内容
   */
  async enrichRouteNarrative(
    routeDirectionId: string,
    countryCode?: string
  ): Promise<RoutePhilosophyNarrative> {
    this.logger.debug(`生成路线叙事: routeDirectionId=${routeDirectionId}`);

    try {
      // 1. 获取 RouteDirection 信息
      // @ts-ignore - Prisma client will be generated after migration
      const routeDirection = await this.prisma.routeDirection.findUnique({
        where: { id: parseInt(routeDirectionId) },
      });

      if (!routeDirection) {
        throw new Error(`RouteDirection not found: ${routeDirectionId}`);
      }

      const targetCountryCode = countryCode || routeDirection.countryCode;

      // 2. RAG 检索相关游记、攻略
      const query = `${routeDirection.nameCN || routeDirection.nameEN} ${targetCountryCode} travel guide experience`;
      const snippets = await this.ragService.retrieve({
        query,
        collection: 'travel_guides',
        countryCode: targetCountryCode,
        limit: 20,
      });

      if (snippets.length === 0) {
        this.logger.warn(`未找到相关游记: routeDirectionId=${routeDirectionId}`);
        // 返回基础叙事（基于 RouteDirection 本身的信息）
        return this.generateBasicNarrative(routeDirectionId, routeDirection);
      }

      // 3. LLM 生成叙事内容
      const prompt = `Based on the following travel guides and route information, write a narrative explanation for the route "${routeDirection.nameCN || routeDirection.nameEN}".

Route Information:
- Name: ${routeDirection.nameCN || routeDirection.nameEN}
- Country: ${targetCountryCode}
- Description: ${routeDirection.description || 'N/A'}

Travel Guides:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please generate:
1. philosophyExplanation: A narrative explanation of the route's philosophy and essence (2-3 paragraphs)
2. whyThisRoute: An array of reasons why this route is special (3-5 items)
3. whatToExpect: An array of what travelers can expect (3-5 items)
4. commonMistakes: An array of common mistakes to avoid (2-4 items)
5. evidenceSnippets: Key quotes from the travel guides (3-5 short snippets)

Return as JSON object.`;

      const schema = {
        type: 'object',
        properties: {
          philosophyExplanation: { type: 'string' },
          whyThisRoute: { type: 'array', items: { type: 'string' } },
          whatToExpect: { type: 'array', items: { type: 'string' } },
          commonMistakes: { type: 'array', items: { type: 'string' } },
          evidenceSnippets: { type: 'array', items: { type: 'string' } },
        },
        required: ['philosophyExplanation', 'whyThisRoute', 'whatToExpect', 'commonMistakes', 'evidenceSnippets'],
      };

      const narrative = await this.llmExtraction.extractStructured<Omit<RoutePhilosophyNarrative, 'routeDirectionId'>>(
        prompt,
        schema
      );

      return {
        routeDirectionId,
        ...narrative,
      };
    } catch (error: any) {
      this.logger.error(`生成路线叙事失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 生成基础叙事（当没有找到相关游记时）
   */
  private generateBasicNarrative(
    routeDirectionId: string,
    routeDirection: any
  ): RoutePhilosophyNarrative {
    return {
      routeDirectionId,
      philosophyExplanation: routeDirection.description || `This is a ${routeDirection.nameCN || routeDirection.nameEN} route.`,
      whyThisRoute: [
        'Unique landscape and experience',
        'Well-established route',
      ],
      whatToExpect: [
        'Scenic views',
        'Cultural experiences',
      ],
      commonMistakes: [
        'Not preparing adequately',
        'Underestimating difficulty',
      ],
      evidenceSnippets: [],
    };
  }

  /**
   * 为路线段生成叙事内容
   */
  async enrichSegmentNarrative(
    segmentId: string,
    dayIndex: number,
    segmentInfo: {
      name?: string;
      description?: string;
      countryCode?: string;
    }
  ): Promise<SegmentNarrative> {
    this.logger.debug(`生成路线段叙事: segmentId=${segmentId}, dayIndex=${dayIndex}`);

    try {
      // 1. RAG 检索相关游记片段
      const query = `${segmentInfo.name || segmentId} ${segmentInfo.countryCode || ''} day ${dayIndex} experience tips`;
      const snippets = await this.ragService.retrieve({
        query,
        collection: 'travel_guides',
        countryCode: segmentInfo.countryCode,
        limit: 10,
      });

      if (snippets.length === 0) {
        return {
          segmentId,
          dayIndex,
          storyText: segmentInfo.description || `Day ${dayIndex} of the journey.`,
          practicalTips: [],
          localInsights: [],
          evidenceSnippets: [],
        };
      }

      // 2. LLM 生成叙事内容
      const prompt = `Based on the following travel guide snippets, write a narrative for day ${dayIndex} of the route.

Segment: ${segmentInfo.name || segmentId}
Description: ${segmentInfo.description || 'N/A'}

Travel Guide Snippets:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please generate:
1. storyText: A narrative description of this day's experience (1-2 paragraphs)
2. practicalTips: Practical tips for this day (3-5 items)
3. localInsights: Local insights and cultural notes (2-4 items)
4. evidenceSnippets: Key quotes from the travel guides (2-3 short snippets)

Return as JSON object.`;

      const schema = {
        type: 'object',
        properties: {
          storyText: { type: 'string' },
          practicalTips: { type: 'array', items: { type: 'string' } },
          localInsights: { type: 'array', items: { type: 'string' } },
          evidenceSnippets: { type: 'array', items: { type: 'string' } },
        },
        required: ['storyText', 'practicalTips', 'localInsights', 'evidenceSnippets'],
      };

      const narrative = await this.llmExtraction.extractStructured<Omit<SegmentNarrative, 'segmentId' | 'dayIndex'>>(
        prompt,
        schema
      );

      return {
        segmentId,
        dayIndex,
        ...narrative,
      };
    } catch (error: any) {
      this.logger.error(`生成路线段叙事失败: ${error.message}`, error.stack);
      return {
        segmentId,
        dayIndex,
        storyText: segmentInfo.description || `Day ${dayIndex} of the journey.`,
        practicalTips: [],
        localInsights: [],
        evidenceSnippets: [],
      };
    }
  }

  /**
   * 批量生成路线叙事（用于初始化）
   */
  async enrichMultipleRoutes(
    routeDirectionIds: string[],
    countryCode?: string
  ): Promise<RoutePhilosophyNarrative[]> {
    const narratives: RoutePhilosophyNarrative[] = [];

    for (const routeId of routeDirectionIds) {
      try {
        const narrative = await this.enrichRouteNarrative(routeId, countryCode);
        narratives.push(narrative);
      } catch (error: any) {
        this.logger.error(`批量生成路线叙事失败: routeId=${routeId}, error=${error.message}`);
      }
    }

    return narratives;
  }
}

