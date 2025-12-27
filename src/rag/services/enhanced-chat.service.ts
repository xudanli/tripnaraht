// src/rag/services/enhanced-chat.service.ts
/**
 * Enhanced Chat Service（增强对话服务）
 * 
 * 用途：
 * - 回答用户关于路线的问题
 * - 提供详细的路线解释（结合结构化数据和 RAG 内容）
 * - 回答路线细节问题
 * 
 * 关键点：
 * - 安全 & 路线选择 = 内核逻辑（结构化数据）
 * - 氛围 & 细节 & 软知识 = RAG 加持
 */

import { Injectable, Logger } from '@nestjs/common';
import { RagService } from './rag.service';
import { RouteKnowledgeCurator } from './route-knowledge-curator.service';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 路线问答上下文
 */
export interface RouteQuestionContext {
  routeDirectionId?: string;
  countryCode?: string;
  segmentId?: string;
  dayIndex?: number;
  tripId?: string;
}

/**
 * 增强的回答结果
 */
export interface EnhancedAnswer {
  answer: string;
  source: 'STRUCTURED' | 'RAG' | 'HYBRID';
  structuredData?: any;
  ragSnippets?: Array<{
    content: string;
    source?: string;
    score: number;
  }>;
  localInsights?: Array<{
    content: string;
    tags: string[];
  }>;
}

@Injectable()
export class EnhancedChatService {
  private readonly logger = new Logger(EnhancedChatService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly routeKnowledgeCurator: RouteKnowledgeCurator,
    private readonly localInsightService: LocalInsightService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 回答用户关于路线的问题
   */
  async answerRouteQuestion(
    question: string,
    context: RouteQuestionContext
  ): Promise<EnhancedAnswer> {
    this.logger.debug(`回答路线问题: "${question}"`);

    try {
      // 1. 先尝试用结构化数据回答（核心决策逻辑）
      const structuredAnswer = await this.answerFromStructuredData(question, context);
      
      if (structuredAnswer.confident) {
        this.logger.debug('使用结构化数据回答');
        return {
          answer: structuredAnswer.answer,
          source: 'STRUCTURED',
          structuredData: structuredAnswer.data,
        };
      }

      // 2. 如果结构化数据不够，用 RAG 补充
      const ragAnswer = await this.answerWithRAG(question, context, structuredAnswer.answer);

      return ragAnswer;
    } catch (error: any) {
      this.logger.error(`回答路线问题失败: ${error.message}`, error.stack);
      return {
        answer: '抱歉，我无法回答这个问题。请尝试更具体的问题。',
        source: 'STRUCTURED',
      };
    }
  }

  /**
   * 从结构化数据回答（核心决策逻辑）
   */
  private async answerFromStructuredData(
    question: string,
    context: RouteQuestionContext
  ): Promise<{
    confident: boolean;
    answer: string;
    data?: any;
  }> {
    const lowerQuestion = question.toLowerCase();

    // 检查是否是路线选择相关的问题
    if (context.routeDirectionId && (
      lowerQuestion.includes('为什么') || 
      lowerQuestion.includes('why') ||
      lowerQuestion.includes('为什么选') ||
      lowerQuestion.includes('为什么推荐')
    )) {
      try {
        // 获取路线方向的解释
        // @ts-ignore - Prisma client will be generated after migration
        const routeDirection = await this.prisma.routeDirection.findUnique({
          where: { id: parseInt(context.routeDirectionId) },
        });

        if (routeDirection) {
          return {
            confident: true,
            answer: `这条路线（${routeDirection.nameCN || routeDirection.nameEN}）是根据您的偏好和当前条件推荐的。${routeDirection.description || ''}`,
            data: {
              routeDirectionId: routeDirection.id,
              name: routeDirection.nameCN || routeDirection.nameEN,
              description: routeDirection.description,
            },
          };
        }
      } catch (error: any) {
        this.logger.warn(`获取路线方向失败: ${error.message}`);
      }
    }

    // 检查是否是路线细节问题（需要 RAG 补充）
    if (
      lowerQuestion.includes('什么感觉') ||
      lowerQuestion.includes('怎么样') ||
      lowerQuestion.includes('体验') ||
      lowerQuestion.includes('建议') ||
      lowerQuestion.includes('tips') ||
      lowerQuestion.includes('需要注意')
    ) {
        return {
          confident: false,
          answer: '', // 需要 RAG 补充
        };
      }

    return {
      confident: false,
      answer: '',
    };
  }

  /**
   * 使用 RAG 回答（结合结构化数据和 RAG 内容）
   */
  private async answerWithRAG(
    question: string,
    context: RouteQuestionContext,
    structuredAnswer?: string
  ): Promise<EnhancedAnswer> {
    // 1. RAG 检索相关文档
    const ragSnippets = await this.ragService.retrieve({
      query: question,
      collection: 'travel_guides',
      countryCode: context.countryCode,
      limit: 5,
    });

    // 2. 获取当地洞察（如果相关）
    let localInsights: Array<{ content: string; tags: string[] }> = [];
    if (context.countryCode) {
      try {
        const insights = await this.localInsightService.getLocalInsight(
          context.countryCode,
          this.extractTagsFromQuestion(question)
        );
        localInsights = insights.map(insight => ({
          content: insight.content,
          tags: insight.tags,
        }));
      } catch (error: any) {
        this.logger.warn(`获取当地洞察失败: ${error.message}`);
      }
    }

    // 3. 生成回答
    let answer = structuredAnswer || '';

    if (ragSnippets.length > 0) {
      const ragContent = ragSnippets
        .map(s => s.content.substring(0, 200))
        .join('\n\n');
      
      if (answer) {
        answer += '\n\n根据相关游记和攻略：\n' + ragContent.substring(0, 500);
      } else {
        answer = ragContent.substring(0, 500);
      }
    }

    if (localInsights.length > 0) {
      const insightsText = localInsights
        .map(i => `• ${i.content.substring(0, 150)}`)
        .join('\n');
      answer += '\n\n当地建议：\n' + insightsText;
    }

    return {
      answer: answer || '抱歉，我无法找到相关信息。',
      source: structuredAnswer ? 'HYBRID' : 'RAG',
      structuredData: structuredAnswer ? { answer: structuredAnswer } : undefined,
      ragSnippets: ragSnippets.map(s => ({
        content: s.content,
        source: s.source,
        score: s.score,
      })),
      localInsights,
    };
  }

  /**
   * 回答"为什么不是另一条路线？"
   */
  async explainWhyNotOtherRoute(
    selectedRouteId: string,
    alternativeRouteId: string,
    countryCode: string
  ): Promise<EnhancedAnswer> {
    this.logger.debug(`解释为什么不是另一条路线: selected=${selectedRouteId}, alternative=${alternativeRouteId}`);

    try {
      // 1. 获取两条路线的信息
      // @ts-ignore
      const selected = await this.prisma.routeDirection.findUnique({
        where: { id: parseInt(selectedRouteId) },
      });
      // @ts-ignore
      const alternative = await this.prisma.routeDirection.findUnique({
        where: { id: parseInt(alternativeRouteId) },
      });

      if (!selected || !alternative) {
        return {
          answer: '无法找到路线信息。',
          source: 'STRUCTURED',
        };
      }

      // 2. 生成基础解释
      let answer = `我们选择了"${selected.nameCN || selected.nameEN}"而不是"${alternative.nameCN || alternative.nameEN}"，因为：\n\n`;

      // 3. 使用 RAG 获取两条路线的对比信息
      const selectedRag = await this.ragService.retrieve({
        query: `${selected.nameCN || selected.nameEN} ${countryCode} experience`,
        collection: 'travel_guides',
        countryCode,
        limit: 3,
      });

      const alternativeRag = await this.ragService.retrieve({
        query: `${alternative.nameCN || alternative.nameEN} ${countryCode} experience`,
        collection: 'travel_guides',
        countryCode,
        limit: 3,
      });

      // 4. 生成对比回答
      if (selectedRag.length > 0) {
        answer += `"${selected.nameCN || selected.nameEN}"的特点：\n`;
        answer += selectedRag[0].content.substring(0, 300) + '\n\n';
      }

      if (alternativeRag.length > 0) {
        answer += `相比之下，"${alternative.nameCN || alternative.nameEN}"更适合：\n`;
        answer += alternativeRag[0].content.substring(0, 200);
      }

      return {
        answer,
        source: 'HYBRID',
        structuredData: {
          selectedRoute: {
            id: selected.id,
            name: selected.nameCN || selected.nameEN,
          },
          alternativeRoute: {
            id: alternative.id,
            name: alternative.nameCN || alternative.nameEN,
          },
        },
        ragSnippets: [
          ...selectedRag.map(s => ({
            content: s.content,
            source: s.source,
            score: s.score,
          })),
          ...alternativeRag.map(s => ({
            content: s.content,
            source: s.source,
            score: s.score,
          })),
        ],
      };
    } catch (error: any) {
      this.logger.error(`解释路线对比失败: ${error.message}`, error.stack);
      return {
        answer: '抱歉，我无法解释路线对比。',
        source: 'STRUCTURED',
      };
    }
  }

  /**
   * 回答路线细节问题（如"F26 这段路冬天能走吗？"）
   */
  async answerRouteDetailQuestion(
    question: string,
    context: RouteQuestionContext
  ): Promise<EnhancedAnswer> {
    this.logger.debug(`回答路线细节问题: "${question}"`);

    const lowerQuestion = question.toLowerCase();

    // 检查是否是可达性问题（应该用结构化数据回答）
    if (
      lowerQuestion.includes('能走') ||
      lowerQuestion.includes('可以') ||
      lowerQuestion.includes('能不能') ||
      lowerQuestion.includes('是否') ||
      lowerQuestion.includes('closed') ||
      lowerQuestion.includes('open')
    ) {
      // 这类问题应该从 PhysicalRealityModel 回答，不是 RAG
      return {
        answer: '关于路线是否可达的问题，请查看路线的详细信息和当前状态。',
        source: 'STRUCTURED',
      };
    }

    // 其他细节问题用 RAG 回答
    return this.answerWithRAG(question, context);
  }

  /**
   * 获取路线叙事内容（用于展示）
   */
  async getRouteNarrative(
    routeDirectionId: string,
    countryCode?: string
  ): Promise<{
    narrative?: any;
    localInsights?: any[];
  }> {
    try {
      const narrative = await this.routeKnowledgeCurator.enrichRouteNarrative(
        routeDirectionId,
        countryCode
      );

      const insights = countryCode
        ? await this.localInsightService.getLocalInsight(countryCode, ['travel-guide'])
        : [];

      return {
        narrative,
        localInsights: insights,
      };
    } catch (error: any) {
      this.logger.error(`获取路线叙事失败: ${error.message}`, error.stack);
      return {};
    }
  }

  /**
   * 从问题中提取标签
   */
  private extractTagsFromQuestion(question: string): string[] {
    const tags: string[] = [];
    const lowerQuestion = question.toLowerCase();

    // 活动类型
    if (lowerQuestion.includes('hiking') || lowerQuestion.includes('徒步')) {
      tags.push('hiking');
    }
    if (lowerQuestion.includes('driving') || lowerQuestion.includes('驾驶') || lowerQuestion.includes('开车')) {
      tags.push('driving');
    }
    if (lowerQuestion.includes('camping') || lowerQuestion.includes('露营')) {
      tags.push('camping');
    }

    // 路线类型
    if (lowerQuestion.includes('f-road') || lowerQuestion.includes('f路')) {
      tags.push('f-road');
    }
    if (lowerQuestion.includes('highlands') || lowerQuestion.includes('高地')) {
      tags.push('highlands');
    }

    // 通用标签
    tags.push('tips', 'local-insights');

    return tags;
  }
}

