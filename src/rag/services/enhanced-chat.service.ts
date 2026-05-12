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

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RouteKnowledgeCurator } from './route-knowledge-curator.service';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegratedRAGKPUService } from '../../kpu/services/integrated-rag-kpu.service';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import type { RealityPolicyCode, RealityPolicyVerdict } from '../../trips/reality-kernel/reality-policy-engine.types';
import { ChunkRetrievalService, type ChunkRetrievalParams } from './chunk-retrieval.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../reality-policy/rag-soft-world-policy';
import { resolveRagSoftWorldPolicy } from '../reality-policy/rag-soft-world-policy';

/**
 * 路线问答上下文
 */
export interface RouteQuestionContext {
  routeDirectionId?: string;
  countryCode?: string;
  segmentId?: string;
  dayIndex?: number;
  tripId?: string;
  /** Reality OS — binds soft-world retrieval to snapshot validity (required when RAG policy gate is active). */
  decisionContext?: DecisionContextV0;
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
  /** Echo Reality policy when gate evaluated soft-world retrieval */
  realityPolicy?: {
    verdict: RealityPolicyVerdict;
    codes: RealityPolicyCode[];
    rag_scope: RagSoftWorldScope;
    snapshot_id?: string;
  };
}

@Injectable()
export class EnhancedChatService {
  private readonly logger = new Logger(EnhancedChatService.name);

  constructor(
    private readonly chunkRetrieval: ChunkRetrievalService,
    private readonly routeKnowledgeCurator: RouteKnowledgeCurator,
    private readonly localInsightService: LocalInsightService,
    private readonly prisma: PrismaService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
    @Optional() private readonly integratedRAGKPU?: IntegratedRAGKPUService, // KPU服务（可选，如果未注入则不使用）
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
      const { scope, policy } = resolveRagSoftWorldPolicy(context.decisionContext);
      const policyEcho = {
        verdict: policy.verdict,
        codes: policy.codes,
        rag_scope: scope,
        snapshot_id: context.decisionContext?.snapshot_id,
      };
      if (scope === 'blocked') {
        const missing = policy.codes.includes('RAG_CONTEXT_REQUIRED');
        return {
          answer: missing
            ? '扩展知识检索需要绑定行程现实上下文（decisionContext）。请从决策引擎或附带 snapshot 的请求发起。'
            : '当前现实快照策略不允许检索扩展知识（例如快照已失效）。请刷新行程现实数据后再试。',
          source: 'STRUCTURED',
          realityPolicy: policyEcho,
        };
      }

      // 1. 先尝试用结构化数据回答（核心决策逻辑）
      const structuredAnswer = await this.answerFromStructuredData(question, context);
      
      if (structuredAnswer.confident) {
        this.logger.debug('使用结构化数据回答');
        return {
          answer: structuredAnswer.answer,
          source: 'STRUCTURED',
          structuredData: structuredAnswer.data,
          realityPolicy: policyEcho,
        };
      }

      // 2. 如果结构化数据不够，用 RAG 补充
      const ragAnswer = await this.answerWithRAG(question, context, structuredAnswer.answer, scope);

      return { ...ragAnswer, realityPolicy: { ...policyEcho, rag_scope: scope } };
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
   * 
   * 如果KPU服务可用，使用KPU的检索和验证功能
   */
  private async answerWithRAG(
    question: string,
    context: RouteQuestionContext,
    structuredAnswer: string | undefined,
    scope: RagSoftWorldScope,
  ): Promise<EnhancedAnswer> {
    // 1. RAG 检索相关文档（如果KPU可用，使用KPU的检索和验证）
    let ragSnippets: Array<{ content: string; source?: string; score: number }> = [];
    let validationResult: any = null;

    const baseChunk: ChunkRetrievalParams = {
      query: question,
      limit: 5,
      useHybridSearch: true,
      credibilityMin: 0.6,
    };
    const chunkParams = this.ragRealityPolicyGate.mergeChunkRetrievalParams(baseChunk, scope);

    try {
      // 如果KPU服务可用，使用KPU的检索和验证
      if (this.integratedRAGKPU) {
        this.logger.debug('使用KPU进行检索和验证');
        
        const { results: validatedResults } = await this.integratedRAGKPU.retrieveAndValidate({
          query: chunkParams.query ?? question,
          limit: chunkParams.limit ?? 5,
          credibilityMin: chunkParams.credibilityMin,
          chunkCategory: chunkParams.chunkCategory,
          type: chunkParams.type,
          category: chunkParams.category,
          fileId: chunkParams.fileId,
          useHybridSearch: chunkParams.useHybridSearch,
          denseWeight: chunkParams.denseWeight,
          sparseWeight: chunkParams.sparseWeight,
          useReranking: chunkParams.useReranking,
          rerankTopK: chunkParams.rerankTopK,
          useQueryExpansion: chunkParams.useQueryExpansion,
          maxQueryVariants: chunkParams.maxQueryVariants,
          useIntentClassification: chunkParams.useIntentClassification,
          enableSnippetValidation: true, // 启用片段验证
          minValidationScore: 0.6, // 最低验证得分
          validationOptions: {
            enableFactCheck: true,
            enableConsistencyCheck: true,
            enableCitationCheck: true,
          },
          context: {
            countryCode: context.countryCode,
            routeDirectionId: context.routeDirectionId,
            snapshot_id: context.decisionContext?.snapshot_id,
            rag_scope: scope,
          },
        });

        // 转换为EnhancedAnswer格式
        ragSnippets = validatedResults.map(r => ({
          content: r.content,
          source: r.sourceFile,
          score: r.validation.overallScore,
        }));

        // 如果启用生成验证，使用KPU生成并验证
        if (validatedResults.length > 0) {
          const generationResult = await this.integratedRAGKPU.generateWithValidation({
            query: question,
            validatedResults,
            retryOnFailure: true,
            context: {
              countryCode: context.countryCode,
              routeDirectionId: context.routeDirectionId,
            },
          });

          // 使用KPU生成的结果
          const answer = generationResult.answer;
          validationResult = generationResult.validation;

          // 获取当地洞察
          let localInsights: Array<{ content: string; tags: string[] }> = [];
          if (context.countryCode) {
            try {
              const insights = await this.localInsightService.getLocalInsight(
                context.countryCode,
                this.extractTagsFromQuestion(question),
                undefined,
                context.decisionContext,
              );
              localInsights = Array.isArray(insights) ? insights.map(insight => ({
                content: insight.content || '',
                tags: Array.isArray(insight.tags) ? insight.tags : [],
              })) : [];
            } catch (error: any) {
              this.logger.warn(`获取当地洞察失败: ${error?.message || 'unknown error'}`);
            }
          }

          return {
            answer: structuredAnswer ? `${structuredAnswer}\n\n${answer}` : answer,
            source: structuredAnswer ? 'HYBRID' : 'RAG',
            structuredData: structuredAnswer ? { answer: structuredAnswer } : undefined,
            ragSnippets,
            localInsights,
            // 扩展：添加验证信息（如果前端需要）
            // @ts-ignore
            validation: validationResult,
          };
        }
      } else {
        // 降级：Chunk 表检索（与 HTTP / KPU 一致的 taxonomy + Reality merge）
        this.logger.debug('KPU服务不可用，使用 Chunk 检索');
        const category = scope === 'restricted' ? 'legal_rules' : 'travel_guides';
        let retrieveParams: ChunkRetrievalParams = {
          query: question,
          limit: 5,
          useHybridSearch: true,
          credibilityMin: 0.6,
          category,
        };
        retrieveParams = this.ragRealityPolicyGate.mergeChunkRetrievalParams(retrieveParams, scope);
        const rows = await this.chunkRetrieval.retrieve(retrieveParams);
        ragSnippets = rows.map((r) => ({
          content: r.content,
          source: r.sourceFile,
          score: r.similarity ?? r.hybridScore ?? r.credibilityScore ?? 0,
        }));
      }
    } catch (error: any) {
      this.logger.warn(`RAG 检索失败: ${error?.message || 'unknown error'}`);
      ragSnippets = [];
    }

    // 2. 获取当地洞察（如果相关）— STALE/降级时不附着我方叙事库，避免“软世界”覆盖硬约束观感
    let localInsights: Array<{ content: string; tags: string[] }> = [];
    if (context.countryCode && scope === 'full') {
      try {
        const insights = await this.localInsightService.getLocalInsight(
          context.countryCode,
          this.extractTagsFromQuestion(question),
          undefined,
          context.decisionContext,
        );
        localInsights = Array.isArray(insights) ? insights.map(insight => ({
          content: insight.content || '',
          tags: Array.isArray(insight.tags) ? insight.tags : [],
        })) : [];
      } catch (error: any) {
        this.logger.warn(`获取当地洞察失败: ${error?.message || 'unknown error'}`);
      }
    }

    // 3. 生成回答
    let answer = structuredAnswer || '';

    if (ragSnippets.length > 0) {
      const ragContent = ragSnippets
        .map(s => (s.content || '').substring(0, 200))
        .join('\n\n');
      
      if (answer) {
        answer += '\n\n根据相关游记和攻略：\n' + ragContent.substring(0, 500);
      } else {
        answer = ragContent.substring(0, 500);
      }
    }

    if (localInsights.length > 0) {
      const insightsText = localInsights
        .map(i => `• ${(i.content || '').substring(0, 150)}`)
        .join('\n');
      answer += '\n\n当地建议：\n' + insightsText;
    }

    return {
      answer: answer || '抱歉，我无法找到相关信息。',
      source: structuredAnswer ? 'HYBRID' : 'RAG',
      structuredData: structuredAnswer ? { answer: structuredAnswer } : undefined,
      ragSnippets: ragSnippets.map(s => ({
        content: s.content || '',
        source: s.source,
        score: s.score || 0,
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
    countryCode: string,
    decisionContext?: DecisionContextV0,
  ): Promise<EnhancedAnswer> {
    this.logger.debug(`解释为什么不是另一条路线: selected=${selectedRouteId}, alternative=${alternativeRouteId}`);

    const { scope, policy } = resolveRagSoftWorldPolicy(decisionContext);
    const policyEcho = {
      verdict: policy.verdict,
      codes: policy.codes,
      rag_scope: scope,
      snapshot_id: decisionContext?.snapshot_id,
    };

    if (scope === 'blocked') {
      const missing = policy.codes.includes('RAG_CONTEXT_REQUIRED');
      return {
        answer: missing
          ? '路线对比需要绑定行程现实上下文（decisionContext）。'
          : '当前现实快照策略不允许检索扩展游记对比内容。请刷新行程现实数据后再试。',
        source: 'STRUCTURED',
        realityPolicy: policyEcho,
      };
    }

    const ragCollection = scope === 'restricted' ? 'legal_rules' : 'travel_guides';

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
          realityPolicy: policyEcho,
        };
      }

      // 2. 生成基础解释
      let answer = `我们选择了"${selected.nameCN || selected.nameEN}"而不是"${alternative.nameCN || alternative.nameEN}"，因为：\n\n`;

      // 3. 使用 RAG 获取两条路线的对比信息（优先 Chunk 表）
      const retrieveRouteSnippets = async (name: string) => {
        let p: ChunkRetrievalParams = {
          query: `${name} ${countryCode} experience`,
          limit: 3,
          category: ragCollection,
          useHybridSearch: true,
          credibilityMin: 0.5,
        };
        p = this.ragRealityPolicyGate.mergeChunkRetrievalParams(p, scope);
        const rows = await this.chunkRetrieval.retrieve(p);
        return rows.map((r) => ({
          content: r.content,
          source: r.sourceFile,
          score: r.similarity ?? r.hybridScore ?? 0,
        }));
      };

      const selectedRag = await retrieveRouteSnippets(String(selected.nameCN || selected.nameEN));
      const alternativeRag = await retrieveRouteSnippets(String(alternative.nameCN || alternative.nameEN));

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
        realityPolicy: policyEcho,
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

    const { scope, policy } = resolveRagSoftWorldPolicy(context.decisionContext);
    if (scope === 'blocked') {
      const missing = policy.codes.includes('RAG_CONTEXT_REQUIRED');
      return {
        answer: missing
          ? '扩展知识检索需要绑定行程现实上下文（decisionContext）。'
          : '当前现实快照策略不允许检索扩展知识。请刷新行程现实数据后再试。',
        source: 'STRUCTURED',
      };
    }

    // 其他细节问题用 RAG 回答
    return this.answerWithRAG(question, context, undefined, scope);
  }

  /**
   * 获取路线叙事内容（用于展示）
   */
  async getRouteNarrative(
    routeDirectionId: string,
    countryCode?: string,
    decisionContext?: DecisionContextV0,
  ): Promise<{
    narrative?: any;
    localInsights?: any[];
  }> {
    try {
      const narrative = await this.routeKnowledgeCurator.enrichRouteNarrative(
        routeDirectionId,
        countryCode,
        decisionContext,
      );

      const insights = countryCode
        ? await this.localInsightService.getLocalInsight(countryCode, ['travel-guide'], undefined, decisionContext)
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

