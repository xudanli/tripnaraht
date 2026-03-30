// src/trips/readiness/services/readiness-ai.service.ts

/**
 * Readiness AI Service
 * 
 * AI 增强服务
 * - 个性化清单增强（截止日期推断、办理渠道推荐、优先级排序）
 * - 风险预警增强（严重程度评估、应对措施生成）
 * - 打包清单增强（个性化推荐、数量推断）
 * - 修复方案增强（多方案生成、评估）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import { RedisService } from '../../../redis/redis.service';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import {
  AIEnhancedReadinessResult,
  UserProfile,
  DeadlineEnhancement,
  ChannelEnhancement,
  RankingEnhancement,
  RiskAIEnhancements,
  RiskSeverityEnhancement,
  MitigationEnhancement,
  EmergencyContactEnhancement,
  PackingListAIEnhancements,
  PackingItemEnhancement,
} from '../types/ai-enhanced.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessCacheService } from './readiness-cache.service';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';

@Injectable()
export class ReadinessAIService {
  private readonly logger = new Logger(ReadinessAIService.name);
  private readonly maxRetries = 2;
  private readonly timeoutMs = 5000; // 5 秒超时

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly cacheService?: ReadinessCacheService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly chunkRetrievalService?: ChunkRetrievalService,
  ) {
    if (!llmService) {
      this.logger.warn('LlmService not available, AI enhancement will be disabled');
    }
    if (!cacheService) {
      this.logger.warn('ReadinessCacheService not available, caching will be disabled');
    }
    if (!chunkRetrievalService) {
      this.logger.warn('ChunkRetrievalService not available, channel retrieval will be disabled');
    }
  }

  /**
   * 增强个性化清单
   */
  async enhancePersonalizedChecklist(
    baseResult: ReadinessCheckResult,
    userProfile: UserProfile,
    tripContext: TripContext,
    options: { enableAI: boolean } = { enableAI: true },
  ): Promise<AIEnhancedReadinessResult> {
    // 检查是否启用 AI
    if (!options.enableAI || !this.llmService) {
      return this.toBaseResult(baseResult);
    }

    // 检查缓存
    const cacheKey = this.cacheService?.generateCacheKey('checklist', baseResult, userProfile);
    if (cacheKey && this.cacheService) {
      const cached = await this.cacheService.get<AIEnhancedReadinessResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // AI 增强（带降级）
    try {
      const enhanced = await this.enhanceWithAI(baseResult, userProfile, tripContext);

      // 缓存结果
      if (cacheKey && this.cacheService) {
        await this.cacheService.set(cacheKey, enhanced, { ttl: 24 * 60 * 60 }); // 24小时
      }

      return enhanced;
    } catch (error) {
      this.logger.warn('AI enhancement failed, falling back to base result', error);
      return this.toBaseResult(baseResult);
    }
  }

  /**
   * 使用 AI 增强（内部方法）
   */
  private async enhanceWithAI(
    baseResult: ReadinessCheckResult,
    userProfile: UserProfile,
    tripContext: TripContext,
  ): Promise<AIEnhancedReadinessResult> {
    // 并行调用多个 AI 增强功能
    const [deadlines, channels, rankings] = await Promise.allSettled([
      this.inferTaskDeadlines(baseResult, tripContext),
      this.retrieveChannels(baseResult, userProfile),
      this.rankByUserProfile(baseResult, userProfile),
    ]);

    return {
      ...baseResult,
      aiEnhancements: {
        deadlines:
          deadlines.status === 'fulfilled' ? deadlines.value : undefined,
        channels:
          channels.status === 'fulfilled' ? channels.value : undefined,
        rankings:
          rankings.status === 'fulfilled' ? rankings.value : undefined,
      },
      failedFeatures: [
        deadlines.status === 'rejected' ? 'deadlines' : null,
        channels.status === 'rejected' ? 'channels' : null,
        rankings.status === 'rejected' ? 'rankings' : null,
      ].filter(Boolean) as string[],
    };
  }

  /**
   * 推断任务截止日期
   */
  private async inferTaskDeadlines(
    result: ReadinessCheckResult,
    tripContext: TripContext,
  ): Promise<DeadlineEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildDeadlinePrompt(result, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            'claude-3-5-sonnet' as any,
            prompt,
            this.getDeadlineSchema(),
          ),
        this.timeoutMs,
        'claude-3-5-sonnet',
      );

      const parsed = this.extractJSON(response);
      return parsed.deadlines || [];
    } catch (error) {
      // 降级到 DeepSeek
      try {
        const response = await this.executeWithTimeout(
          () =>
            this.llmService!.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt, this.getDeadlineSchema()),
          this.timeoutMs * 0.7,
          'deepseek',
        );
        const parsed = this.extractJSON(response);
        return parsed.deadlines || [];
      } catch (fallbackError) {
        this.logger.error('All LLM providers failed for deadline inference', fallbackError);
        return []; // 返回空数组，不影响基础功能
      }
    }
  }

  /**
   * 检索办理渠道
   */
  private async retrieveChannels(
    result: ReadinessCheckResult,
    userProfile: UserProfile,
  ): Promise<ChannelEnhancement[]> {
    if (!this.chunkRetrievalService) {
      return [];
    }

    const channels: ChannelEnhancement[] = [];

    // 为每个检查项检索办理渠道
    for (const finding of result.findings) {
      const allItems = [
        ...finding.blockers,
        ...finding.must,
        ...finding.should,
        ...finding.optional,
      ];

      for (const item of allItems) {
        try {
          // 构建查询：检查项 + 目的地 + 用户国籍
          const query = `${item.message} ${finding.destinationId} ${userProfile.nationality || ''} 办理渠道 申请方式`;
          
          // RAG 检索
          const ragResults = await this.chunkRetrievalService.retrieve({
            query,
            limit: 5,
            chunkCategory: 'RULES', // 规则类查询
            useHybridSearch: true,
            useReranking: false,
          });

          if (ragResults.length > 0) {
            // 提取渠道信息
            const channelInfo = ragResults
              .filter(r => r.similarity >= 0.6) // 相似度阈值
              .map(r => ({
                name: this.extractChannelName(r.content) || '',
                url: this.extractChannelUrl(r.content),
                description: r.content.substring(0, 200),
              }))
              .filter((c: { name: string; url?: string; description: string }) => c.name !== ''); // 过滤掉无效渠道

            if (channelInfo.length > 0) {
              channels.push({
                itemId: item.id,
                channels: channelInfo,
                evidence: ragResults.slice(0, 3).map(r => r.chunkId || ''),
                confidence: ragResults[0].similarity || 0.7,
              });
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to retrieve channels for item ${item.id}`, error);
          // 继续处理下一个检查项
        }
      }
    }

    return channels;
  }

  /**
   * 从文本中提取渠道名称
   */
  private extractChannelName(text: string): string | undefined {
    // 匹配常见的办理渠道关键词
    const patterns = [
      /(?:官网|官方网站|官方平台|在线申请|网上申请|在线办理)[：:]\s*([^\n]+)/i,
      /(?:申请网站|办理网站|预约网站)[：:]\s*([^\n]+)/i,
      /(?:网址|链接)[：:]\s*([^\n]+)/i,
      /(https?:\/\/[^\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * 从文本中提取渠道 URL
   */
  private extractChannelUrl(text: string): string | undefined {
    const urlPattern = /(https?:\/\/[^\s\)]+)/i;
    const match = text.match(urlPattern);
    return match ? match[1] : undefined;
  }

  /**
   * 基于用户画像排序
   */
  private async rankByUserProfile(
    result: ReadinessCheckResult,
    userProfile: UserProfile,
  ): Promise<RankingEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildRankingPrompt(result, userProfile);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            LlmProvider.ANTHROPIC,
            prompt,
            this.getRankingSchema(),
          ),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.rankings || [];
    } catch (error) {
      this.logger.warn('Ranking enhancement failed', error);
      return [];
    }
  }

  /**
   * 构建截止日期推断 Prompt
   */
  private buildDeadlinePrompt(
    result: ReadinessCheckResult,
    tripContext: TripContext,
  ): string {
    const startDate = tripContext.trip.startDate;
    const daysUntilTrip = startDate
      ? Math.ceil(
          (new Date(startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    // 提取所有检查项（带 ID）
    const allItems: Array<{ id: string; message: string; category: string; level: string }> = [];
    for (const finding of result.findings) {
      finding.blockers.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'blocker' });
      });
      finding.must.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'must' });
      });
      finding.should.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'should' });
      });
      finding.optional.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'optional' });
      });
    }

    return `你是一个旅行准备度专家。请为以下准备度检查项推断任务截止日期。

行程信息：
- 出发日期：${startDate || '未知'}${daysUntilTrip !== null ? ` (距离今天 ${daysUntilTrip} 天)` : ''}
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 用户国籍：${tripContext.traveler.nationality || '未知'}

准备度检查项（共 ${allItems.length} 项）：
${JSON.stringify(allItems, null, 2)}

请为每个检查项推断截止日期（ISO 日期格式 YYYY-MM-DD），考虑：
1. 签证申请通常需要提前 1-3 个月
2. 机票预订建议提前 2-4 周
3. 酒店预订建议提前 1-2 周
4. 特殊活动/许可可能需要提前 1-6 个月
5. 保险购买建议提前 1-2 周
6. 疫苗接种可能需要提前 4-8 周

返回 JSON 格式：
{
  "deadlines": [
    {
      "itemId": "检查项ID（必须与输入中的 id 字段匹配）",
      "deadline": "2024-11-15",
      "evidence": ["证据来源1", "证据来源2"],
      "confidence": 0.8
    }
  ]
}

注意：
- 只返回需要提前办理的检查项（如签证、许可、预订等）
- 如果检查项不需要提前办理，可以省略
- deadline 必须是有效的 ISO 日期格式
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 构建排序 Prompt
   */
  private buildRankingPrompt(result: ReadinessCheckResult, userProfile: UserProfile): string {
    // 提取所有检查项（带 ID 和级别）
    const allItems: Array<{ id: string; message: string; level: string; category: string }> = [];
    for (const finding of result.findings) {
      finding.blockers.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, level: 'blocker', category: finding.destinationId });
      });
      finding.must.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, level: 'must', category: finding.destinationId });
      });
      finding.should.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, level: 'should', category: finding.destinationId });
      });
      finding.optional.forEach((item) => {
        allItems.push({ id: item.id, message: item.message, level: 'optional', category: finding.destinationId });
      });
    }

    return `你是一个旅行准备度专家。请基于用户画像为准备度检查项进行个性化优先级排序。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}（影响：预算相关检查项的优先级）
- 风险承受度：${userProfile.riskTolerance || 'medium'}（影响：安全相关检查项的优先级）
- 用户标签：${userProfile.tags?.join(', ') || '无'}（影响：特定场景检查项的优先级）
- 国籍：${userProfile.nationality || '未知'}（影响：签证/入境相关检查项的优先级）

准备度检查项（共 ${allItems.length} 项）：
${JSON.stringify(allItems, null, 2)}

排序规则：
1. blocker 级别检查项：优先级 80-100（必须处理）
2. must 级别检查项：优先级 60-90（重要，但可根据用户画像调整）
3. should 级别检查项：优先级 40-70（建议，根据用户画像调整）
4. optional 级别检查项：优先级 20-50（可选，根据用户画像调整）

个性化调整原则：
- 预算水平 low：优先处理省钱/免费项目，延迟昂贵项目
- 预算水平 high：优先处理便利性/舒适性项目
- 风险承受度 low：优先处理安全/保险相关项目
- 风险承受度 high：可以延迟安全相关项目
- 标签包含 "family_with_children"：优先处理儿童相关项目
- 标签包含 "senior"：优先处理医疗/保险相关项目

返回 JSON 格式：
{
  "rankings": [
    {
      "itemId": "检查项ID（必须与输入中的 id 字段匹配）",
      "personalizedRank": 85,
      "reasoning": "基于用户预算水平为 low，此免费项目优先级较高",
      "evidence": ["用户画像：预算水平 low", "检查项级别：must"],
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有检查项返回排序结果
- personalizedRank 应该在 1-100 之间
- reasoning 应该清晰说明排序依据
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 获取截止日期 Schema
   */
  private getDeadlineSchema(): any {
    return {
      type: 'object',
      properties: {
        deadlines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              deadline: { type: 'string' },
              evidence: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['itemId', 'deadline', 'confidence'],
          },
        },
      },
      required: ['deadlines'],
    };
  }

  /**
   * 获取排序 Schema
   */
  private getRankingSchema(): any {
    return {
      type: 'object',
      properties: {
        rankings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              personalizedRank: { type: 'number', minimum: 1, maximum: 100 },
              reasoning: { type: 'string' },
              evidence: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['itemId', 'personalizedRank', 'reasoning', 'confidence'],
          },
        },
      },
      required: ['rankings'],
    };
  }

  /**
   * 执行带超时的函数
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    model: string,
  ): Promise<T> {
    return Promise.race([
      fn(),
      this.createTimeoutPromise<T>(timeoutMs, model),
    ]);
  }

  /**
   * 创建超时 Promise
   */
  private createTimeoutPromise<T>(timeoutMs: number, model: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`AI enhancement timeout for model: ${model}, timeout: ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * 提取 JSON
   */
  private extractJSON(text: string): any {
    try {
      // 尝试直接解析
      return JSON.parse(text);
    } catch (error) {
      // 尝试提取 JSON 代码块
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      throw new Error('Failed to extract JSON from LLM response');
    }
  }

  /**
   * 增强风险预警
   */
  async enhanceRiskWarnings(
    baseResult: ReadinessCheckResult,
    userProfile: UserProfile,
    tripContext: TripContext,
    options: { enableAI: boolean } = { enableAI: true },
  ): Promise<RiskAIEnhancements> {
    // 检查是否启用 AI
    if (!options.enableAI || !this.llmService) {
      return {};
    }

    // 提取所有风险
    const allRisks = baseResult.findings.flatMap((f) =>
      f.risks.map((r, idx) => ({
        id: `${f.destinationId}-${f.packId}-risk-${idx}`,
        type: r.type,
        severity: r.severity,
        summary: r.summary,
        mitigations: r.mitigations || [],
      })),
    );

    if (allRisks.length === 0) {
      return {};
    }

    // AI 增强（带降级）
    try {
      const [severityAssessments, mitigations, emergencyContacts] = await Promise.allSettled([
        this.assessRiskSeverity(allRisks, tripContext),
        this.generateMitigations(allRisks, userProfile, tripContext),
        this.retrieveEmergencyContacts(allRisks, tripContext),
      ]);

      return {
        severityAssessments:
          severityAssessments.status === 'fulfilled' ? severityAssessments.value : undefined,
        mitigations: mitigations.status === 'fulfilled' ? mitigations.value : undefined,
        emergencyContacts:
          emergencyContacts.status === 'fulfilled' ? emergencyContacts.value : undefined,
      };
    } catch (error) {
      this.logger.warn('Risk AI enhancement failed', error);
      return {};
    }
  }

  /**
   * 评估风险严重程度
   */
  private async assessRiskSeverity(
    risks: Array<{ id: string; type: string; severity: string; summary: string }>,
    tripContext: TripContext,
  ): Promise<RiskSeverityEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildRiskSeverityPrompt(risks, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            LlmProvider.ANTHROPIC,
            prompt,
            this.getRiskSeveritySchema(),
          ),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.assessments || [];
    } catch (error) {
      // 降级到 DeepSeek
      try {
        const response = await this.executeWithTimeout(
          () =>
            this.llmService!.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt, this.getRiskSeveritySchema()),
          this.timeoutMs * 0.7,
          'deepseek',
        );
        const parsed = this.extractJSON(response);
        return parsed.assessments || [];
      } catch (fallbackError) {
        this.logger.error('All LLM providers failed for risk severity assessment', fallbackError);
        return [];
      }
    }
  }

  /**
   * 生成应对措施
   */
  private async generateMitigations(
    risks: Array<{ id: string; type: string; severity: string; summary: string }>,
    userProfile: UserProfile,
    tripContext: TripContext,
  ): Promise<MitigationEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildMitigationPrompt(risks, userProfile, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            LlmProvider.ANTHROPIC,
            prompt,
            this.getMitigationSchema(),
          ),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.mitigations || [];
    } catch (error) {
      this.logger.warn('Mitigation generation failed', error);
      return [];
    }
  }

  /**
   * 检索紧急联系方式
   */
  private async retrieveEmergencyContacts(
    risks: Array<{ id: string; type: string; severity: string; summary: string }>,
    tripContext: TripContext,
  ): Promise<EmergencyContactEnhancement[]> {
    if (!this.chunkRetrievalService) {
      return [];
    }

    const contacts: EmergencyContactEnhancement[] = [];

    // 为每个高风险项检索紧急联系方式
    const highRiskItems = risks.filter((r) => r.severity === 'high');

    for (const risk of highRiskItems) {
      try {
        // 构建查询：风险类型 + 目的地 + 紧急联系方式
        const query = `${risk.type} ${tripContext.itinerary.countries?.join(' ') || ''} 紧急联系方式 救援电话 报警电话`;

        // RAG 检索
        const ragResults = await this.chunkRetrievalService.retrieve({
          query,
          limit: 5,
          chunkCategory: 'RULES',
          useHybridSearch: true,
          useReranking: false,
        });

        if (ragResults.length > 0 && ragResults[0].similarity >= 0.6) {
          // 提取联系方式
          const extractedContacts = this.extractEmergencyContacts(ragResults[0].content);

          if (extractedContacts.length > 0) {
            contacts.push({
              riskId: risk.id,
              contacts: extractedContacts,
              evidence: [ragResults[0].chunkId || ''],
              confidence: ragResults[0].similarity || 0.7,
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to retrieve emergency contacts for risk ${risk.id}`, error);
      }
    }

    return contacts;
  }

  /**
   * 从文本中提取紧急联系方式
   */
  private extractEmergencyContacts(text: string): Array<{
    type: string;
    name: string;
    phone?: string;
    email?: string;
    url?: string;
  }> {
    const contacts: Array<{
      type: string;
      name: string;
      phone?: string;
      email?: string;
      url?: string;
    }> = [];

    // 匹配电话号码
    const phonePattern = /(?:电话|Phone|Tel)[：:]\s*([+\d\s\-()]+)/gi;
    const phoneMatches = text.matchAll(phonePattern);
    for (const match of phoneMatches) {
      contacts.push({
        type: 'phone',
        name: '紧急电话',
        phone: match[1].trim(),
      });
    }

    // 匹配报警电话（常见格式）
    const emergencyPattern = /(?:报警|Emergency|Police)[：:]\s*(\d{3,4})/gi;
    const emergencyMatches = text.matchAll(emergencyPattern);
    for (const match of emergencyMatches) {
      contacts.push({
        type: 'emergency',
        name: '报警电话',
        phone: match[1].trim(),
      });
    }

    // 匹配 URL
    const urlPattern = /(https?:\/\/[^\s\)]+)/gi;
    const urlMatches = text.matchAll(urlPattern);
    for (const match of urlMatches) {
      contacts.push({
        type: 'website',
        name: '官方网站',
        url: match[1],
      });
    }

    return contacts;
  }

  /**
   * 构建风险严重程度评估 Prompt
   */
  private buildRiskSeverityPrompt(
    risks: Array<{ id: string; type: string; severity: string; summary: string }>,
    tripContext: TripContext,
  ): string {
    return `你是一个旅行安全专家。请评估以下风险的严重程度，考虑行程的具体情况。

行程信息：
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 开始日期：${tripContext.trip.startDate || '未知'}
- 活动类型：${tripContext.itinerary.activities?.join(', ') || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}

风险列表：
${JSON.stringify(risks, null, 2)}

请评估每个风险的严重程度（high/medium/low），考虑：
1. 风险发生的可能性
2. 风险发生后的影响程度
3. 行程的具体情况（目的地、活动、季节等）

返回 JSON 格式：
{
  "assessments": [
    {
      "riskId": "风险ID（必须与输入中的 id 字段匹配）",
      "originalSeverity": "原始严重程度",
      "assessedSeverity": "评估后的严重程度（high/medium/low）",
      "reasoning": "评估理由",
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有风险返回评估结果
- assessedSeverity 必须是 high、medium 或 low
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 构建应对措施生成 Prompt
   */
  private buildMitigationPrompt(
    risks: Array<{ id: string; type: string; severity: string; summary: string }>,
    userProfile: UserProfile,
    tripContext: TripContext,
  ): string {
    return `你是一个旅行安全专家。请为以下风险生成个性化的应对措施。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}
- 风险承受度：${userProfile.riskTolerance || 'medium'}
- 用户标签：${userProfile.tags?.join(', ') || '无'}

行程信息：
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 活动类型：${tripContext.itinerary.activities?.join(', ') || '未知'}

风险列表：
${JSON.stringify(risks, null, 2)}

请为每个风险生成 3-5 条个性化的应对措施，考虑：
1. 用户的风险承受度（低风险承受度用户需要更详细的措施）
2. 预算水平（提供不同成本的选择）
3. 用户标签（如 family_with_children 需要儿童相关措施）

返回 JSON 格式：
{
  "mitigations": [
    {
      "riskId": "风险ID（必须与输入中的 id 字段匹配）",
      "personalizedMitigations": [
        "应对措施1",
        "应对措施2",
        "应对措施3"
      ],
      "evidence": ["证据来源1", "证据来源2"],
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有风险返回应对措施
- personalizedMitigations 应该包含 3-5 条措施
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 获取风险严重程度评估 Schema
   */
  private getRiskSeveritySchema(): any {
    return {
      type: 'object',
      properties: {
        assessments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              riskId: { type: 'string' },
              originalSeverity: { type: 'string' },
              assessedSeverity: { type: 'string', enum: ['high', 'medium', 'low'] },
              reasoning: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['riskId', 'originalSeverity', 'assessedSeverity', 'reasoning', 'confidence'],
          },
        },
      },
      required: ['assessments'],
    };
  }

  /**
   * 获取应对措施 Schema
   */
  private getMitigationSchema(): any {
    return {
      type: 'object',
      properties: {
        mitigations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              riskId: { type: 'string' },
              personalizedMitigations: {
                type: 'array',
                items: { type: 'string' },
                minItems: 3,
                maxItems: 5,
              },
              evidence: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['riskId', 'personalizedMitigations', 'confidence'],
          },
        },
      },
      required: ['mitigations'],
    };
  }

  /**
   * 增强打包清单
   */
  async enhancePackingList(
    baseItems: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      priority: string;
    }>,
    userProfile: UserProfile,
    tripContext: TripContext,
    durationDays: number,
    options: { enableAI: boolean } = { enableAI: true },
  ): Promise<PackingListAIEnhancements> {
    // 检查是否启用 AI
    if (!options.enableAI || !this.llmService) {
      return {};
    }

    if (baseItems.length === 0) {
      return {};
    }

    // AI 增强（带降级）
    try {
      const [quantities, reasons, recommendations] = await Promise.allSettled([
        this.inferItemQuantities(baseItems, durationDays, tripContext),
        this.generateItemReasons(baseItems, tripContext),
        this.recommendPackingItems(baseItems, userProfile, tripContext),
      ]);

      // 合并增强结果
      const enhancements: PackingItemEnhancement[] = [];
      const itemMap = new Map<string, PackingItemEnhancement>();

      // 处理数量推断
      if (quantities.status === 'fulfilled' && quantities.value) {
        quantities.value.forEach((q) => {
          itemMap.set(q.itemId, { ...itemMap.get(q.itemId), ...q });
        });
      }

      // 处理推荐原因
      if (reasons.status === 'fulfilled' && reasons.value) {
        reasons.value.forEach((r) => {
          itemMap.set(r.itemId, { ...itemMap.get(r.itemId), ...r });
        });
      }

      // 处理新物品推荐
      if (recommendations.status === 'fulfilled' && recommendations.value) {
        recommendations.value.forEach((rec) => {
          if (!itemMap.has(rec.itemId)) {
            itemMap.set(rec.itemId, rec);
          }
        });
      }

      // 转换为数组
      itemMap.forEach((enhancement) => {
        enhancements.push(enhancement);
      });

      return {
        itemEnhancements: enhancements,
      };
    } catch (error) {
      this.logger.warn('Packing list AI enhancement failed', error);
      return {};
    }
  }

  /**
   * 推断物品数量
   */
  private async inferItemQuantities(
    items: Array<{ id: string; name: string; category: string; quantity: number }>,
    durationDays: number,
    tripContext: TripContext,
  ): Promise<PackingItemEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildQuantityPrompt(items, durationDays, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            LlmProvider.ANTHROPIC,
            prompt,
            this.getQuantitySchema(),
          ),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.quantities || [];
    } catch (error) {
      this.logger.warn('Quantity inference failed', error);
      return [];
    }
  }

  /**
   * 生成推荐原因
   */
  private async generateItemReasons(
    items: Array<{ id: string; name: string; category: string }>,
    tripContext: TripContext,
  ): Promise<PackingItemEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildReasonPrompt(items, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(LlmProvider.ANTHROPIC, prompt, this.getReasonSchema()),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.reasons || [];
    } catch (error) {
      this.logger.warn('Reason generation failed', error);
      return [];
    }
  }

  /**
   * 推荐个性化物品
   */
  private async recommendPackingItems(
    existingItems: Array<{ id: string; name: string; category: string }>,
    userProfile: UserProfile,
    tripContext: TripContext,
  ): Promise<PackingItemEnhancement[]> {
    if (!this.llmService) {
      return [];
    }

    const prompt = this.buildRecommendationPrompt(existingItems, userProfile, tripContext);

    try {
      const response = await this.executeWithTimeout(
        () =>
          this.llmService!.callLlmWithSchema(
            LlmProvider.ANTHROPIC,
            prompt,
            this.getRecommendationSchema(),
          ),
        this.timeoutMs,
        'anthropic',
      );

      const parsed = this.extractJSON(response);
      return parsed.recommendations || [];
    } catch (error) {
      this.logger.warn('Item recommendation failed', error);
      return [];
    }
  }

  /**
   * 构建数量推断 Prompt
   */
  private buildQuantityPrompt(
    items: Array<{ id: string; name: string; category: string; quantity: number }>,
    durationDays: number,
    tripContext: TripContext,
  ): string {
    return `你是一个旅行打包专家。请为以下打包清单物品推断合适的数量。

行程信息：
- 行程天数：${durationDays} 天
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${tripContext.itinerary.activities?.join(', ') || '未知'}

打包清单物品：
${JSON.stringify(items, null, 2)}

请为每个物品推断合适的数量，考虑：
1. 行程天数（长行程需要更多物品）
2. 物品类型（消耗品 vs 可重复使用）
3. 目的地气候和活动类型
4. 清洗频率（如衣物）

返回 JSON 格式：
{
  "quantities": [
    {
      "itemId": "物品ID（必须与输入中的 id 字段匹配）",
      "recommendedQuantity": 3,
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有物品返回数量推断
- recommendedQuantity 应该是合理的整数
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 构建推荐原因 Prompt
   */
  private buildReasonPrompt(
    items: Array<{ id: string; name: string; category: string }>,
    tripContext: TripContext,
  ): string {
    return `你是一个旅行打包专家。请为以下打包清单物品生成推荐原因。

行程信息：
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${tripContext.itinerary.activities?.join(', ') || '未知'}

打包清单物品：
${JSON.stringify(items, null, 2)}

请为每个物品生成推荐原因，说明为什么需要这个物品，考虑：
1. 目的地气候特点
2. 活动类型需求
3. 安全考虑
4. 舒适性需求

返回 JSON 格式：
{
  "reasons": [
    {
      "itemId": "物品ID（必须与输入中的 id 字段匹配）",
      "reason": "推荐原因（1-2句话）",
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有物品返回推荐原因
- reason 应该清晰、具体
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 构建物品推荐 Prompt
   */
  private buildRecommendationPrompt(
    existingItems: Array<{ id: string; name: string; category: string }>,
    userProfile: UserProfile,
    tripContext: TripContext,
  ): string {
    return `你是一个旅行打包专家。请基于用户画像和行程信息，推荐额外的打包物品。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}
- 风险承受度：${userProfile.riskTolerance || 'medium'}
- 用户标签：${userProfile.tags?.join(', ') || '无'}

行程信息：
- 目的地：${tripContext.itinerary.countries?.join(', ') || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${tripContext.itinerary.activities?.join(', ') || '未知'}

已有物品：
${JSON.stringify(existingItems, null, 2)}

请推荐 3-5 个额外的打包物品，考虑：
1. 用户画像（如 family_with_children 需要儿童相关物品）
2. 行程特点（如高海拔需要特殊装备）
3. 预算水平（提供不同成本的选择）
4. 已有物品的补充（不要重复推荐）

返回 JSON 格式：
{
  "recommendations": [
    {
      "itemId": "新物品ID（建议格式：recommended-1）",
      "name": "物品名称",
      "category": "物品类别",
      "recommendedQuantity": 1,
      "reason": "推荐原因",
      "confidence": 0.8
    }
  ]
}

注意：
- 推荐 3-5 个物品
- 不要重复已有物品
- confidence 应该在 0.5-1.0 之间`;
  }

  /**
   * 获取数量推断 Schema
   */
  private getQuantitySchema(): any {
    return {
      type: 'object',
      properties: {
        quantities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              recommendedQuantity: { type: 'number', minimum: 1 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['itemId', 'recommendedQuantity', 'confidence'],
          },
        },
      },
      required: ['quantities'],
    };
  }

  /**
   * 获取推荐原因 Schema
   */
  private getReasonSchema(): any {
    return {
      type: 'object',
      properties: {
        reasons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              reason: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['itemId', 'reason', 'confidence'],
          },
        },
      },
      required: ['reasons'],
    };
  }

  /**
   * 获取物品推荐 Schema
   */
  private getRecommendationSchema(): any {
    return {
      type: 'object',
      properties: {
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              name: { type: 'string' },
              category: { type: 'string' },
              recommendedQuantity: { type: 'number', minimum: 1 },
              reason: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['itemId', 'name', 'category', 'recommendedQuantity', 'reason', 'confidence'],
          },
          minItems: 3,
          maxItems: 5,
        },
      },
      required: ['recommendations'],
    };
  }

  /**
   * 转换为基础结果
   */
  private toBaseResult(baseResult: ReadinessCheckResult): AIEnhancedReadinessResult {
    return {
      ...baseResult,
      aiEnhancements: undefined,
      failedFeatures: [],
    };
  }
}
