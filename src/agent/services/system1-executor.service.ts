// src/agent/services/system1-executor.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RouteType } from '../interfaces/router.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';
import { PlacesService } from '../../places/places.service';
import { TripsService } from '../../trips/trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { EnhancedChatService } from '../../rag/services/enhanced-chat.service';
import { System1InfoCardService } from './system1-info-card.service';
import { System1Result } from '../interfaces/system1-info-card.interface';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  adaptAssumedKnowledgeHit,
  adaptPlaceSearchHits,
  adaptRagSnippets,
  buildKnowledgeQaClaims,
  buildSystem1WriteEscalationAnswerZh,
  compileSystem1AcquisitionPlan,
  compileSystem1TaskFrame,
  ensureSystem1CrePlan,
  evaluateSystem1Authority,
  finalizeSystem1KnowledgeAnswer,
  projectSystem1TurnTrace,
  runSystem1DecisionRuntime,
  type System1Evidence,
  type System1TurnTrace,
} from '../system1-runtime';

/**
 * System 1 Executor Service
 * 
 * 快速路径执行器：API 和 RAG
 */
@Injectable()
export class System1ExecutorService {
  private readonly logger = new Logger(System1ExecutorService.name);

  constructor(
    private placesService: PlacesService,
    private tripsService: TripsService,
    private itineraryItemsService: ItineraryItemsService,
    @Optional() private enhancedChat?: EnhancedChatService,
    @Optional() private infoCardService?: System1InfoCardService,
    /** 地点搜索无命中时，行前类问题走单次 LLM 常识兜底（与 QA_LIGHT 对齐） */
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  /**
   * 执行 System 1 路由
   */
  async execute(
    route: RouteType,
    state: AgentState
  ): Promise<System1Result> {
    const startTime = Date.now();

    try {
      const taskFrame = compileSystem1TaskFrame({
        message: state.user_input,
        tripId: state.trip.trip_id,
      });
      const authority = evaluateSystem1Authority(taskFrame, state.user_input);
      if (!authority.allowed) {
        const runtime = runSystem1DecisionRuntime({
          message: state.user_input,
          tripId: state.trip.trip_id,
          evidence: [],
          draftAnswer: buildSystem1WriteEscalationAnswerZh({ frame: taskFrame, decision: authority }),
        });
        this.logger.warn(
          `[System1] AUTHORITY_GATE blocked WRITE reason=${authority.reason} request_id=${state.request_id}`,
        );
        return {
          success: true,
          result: {
            action: authority.changeProposal?.kind ?? 'WRITE',
            applied: false,
            authority: 'ESCALATED',
            changeProposal: authority.changeProposal,
            taskFrame,
          },
          answerText: runtime.finalAnswer,
          cardType: 'AUTHORITY_ESCALATION',
          appliedToItinerary: false,
          system1Runtime: projectSystem1TurnTrace(runtime),
        };
      }

      // 检查是否需要生成信息卡片（路线查询）
      if (this.shouldGenerateInfoCard(state)) {
        return await this.generateInfoCard(state);
      }

      if (route === RouteType.SYSTEM1_API) {
        const apiResult = await this.executeAPI(state);
        return {
          success: apiResult.success,
          result: apiResult.result,
          answerText: apiResult.answerText,
          cardType: 'API_RESULT',
          appliedToItinerary: false,
          system1Runtime: projectSystem1TurnTrace(apiResult.runtime),
        };
      } else if (route === RouteType.SYSTEM1_RAG) {
        const ragResult = await this.executeRAG(state);
        return {
          success: ragResult.success,
          result: ragResult.result,
          answerText: ragResult.answerText,
          cardType: 'RAG_RESULT',
          appliedToItinerary: false,
          system1Runtime: projectSystem1TurnTrace(ragResult.runtime),
        };
      } else {
        throw new Error(`Unsupported System1 route: ${route}`);
      }
    } catch (error: any) {
      this.logger.error(`System1 execution error: ${error?.message || String(error)}`, error?.stack);
      return {
        success: false,
        result: null,
        answerText: `处理请求时出错：${error?.message || String(error)}`,
        cardType: undefined,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.debug(`System1 execution completed in ${latency}ms`);
    }
  }

  /**
   * 检查是否应该生成信息卡片
   */
  private shouldGenerateInfoCard(state: AgentState): boolean {
    if (!this.infoCardService) {
      return false;
    }

    const input = state.user_input.toLowerCase();
    // 检测路线查询关键词
    const routeKeywords = ['路线', 'route', '路线信息', '路线详情', '路线卡片'];
    return routeKeywords.some(keyword => input.includes(keyword));
  }

  /**
   * 生成信息卡片
   */
  private async generateInfoCard(state: AgentState): Promise<System1Result> {
    if (!this.infoCardService) {
      return {
        success: false,
        result: null,
        answerText: '信息卡片服务不可用',
        cardType: undefined,
      };
    }

    try {
      // 从用户输入中提取路线ID（简化实现）
      const routeId = this.extractRouteId(state.user_input);
      
      if (!routeId) {
        return {
          success: false,
          result: null,
          answerText: '未找到路线ID，请提供路线名称或ID',
          cardType: undefined,
        };
      }

      const infoCard = await this.infoCardService.generateInfoCard(routeId, state);

      return {
        success: true,
        result: infoCard,
        answerText: null, // System 1不再返回文本回答
        cardType: 'INFO_CARD',
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate info card: ${error?.message}`, error?.stack);
      return {
        success: false,
        result: null,
        answerText: `生成信息卡片失败：${error?.message || String(error)}`,
        cardType: undefined,
      };
    }
  }

  /**
   * 从用户输入中提取路线ID（简化实现）
   */
  private extractRouteId(input: string): string | null {
    // 简化实现：尝试从输入中提取ID
    // 实际应该使用NLP或实体识别
    const idMatch = input.match(/route[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
    if (idMatch) {
      return idMatch[1];
    }

    // 尝试提取UUID格式
    const uuidMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      return uuidMatch[0];
    }

    return null;
  }

  /**
   * 执行 API 路径（只读查询引导）。
   * P0：禁止在此 create/remove 行程项；WRITE 一律升级 Draft。
   * 不再引导用户用 System1 添加/删除地点。
   */
  private async executeAPI(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
    runtime: System1TurnTrace;
  }> {
    const frame = compileSystem1TaskFrame({
      message: state.user_input,
      tripId: state.trip.trip_id,
    });
    const authority = evaluateSystem1Authority(frame, state.user_input);
    if (!authority.allowed) {
      const runtime = runSystem1DecisionRuntime({
        message: state.user_input,
        tripId: state.trip.trip_id,
        evidence: [],
        draftAnswer: buildSystem1WriteEscalationAnswerZh({ frame, decision: authority }),
      });
      return {
        success: true,
        result: {
          action: authority.changeProposal?.kind ?? 'WRITE',
          applied: false,
          authority: 'ESCALATED',
          changeProposal: authority.changeProposal,
        },
        answerText: runtime.finalAnswer,
        runtime,
      };
    }

    void this.effectivePlanWriteGuard;
    void this.itineraryItemsService;
    void this.tripsService;

    const crePlan = ensureSystem1CrePlan({
      family: 'KNOWLEDGE_QA',
      message: state.user_input,
      tripId: state.trip.trip_id,
    });
    const compiled = compileSystem1AcquisitionPlan({
      family: 'KNOWLEDGE_QA',
      evidence: [],
      tripId: state.trip.trip_id,
      skipExternalFetch: true,
      crePlan,
    });
    const guidance =
      `System1 只能查询事实，不能直接改行程。\n\n` +
      `可以说：查询地点、路线注意事项、行程里哪天没住宿、今天怎么安排。` +
      `若要改行程，会生成变更提案并升级 System2。`;
    const runtime = runSystem1DecisionRuntime({
      message: state.user_input,
      tripId: state.trip.trip_id,
      family: 'KNOWLEDGE_QA',
      creOperation: crePlan.operation,
      evidence: [],
      claims: buildKnowledgeQaClaims({ text: guidance }),
      draftAnswer: guidance,
      acquisition: compiled.plan,
      requiredEvidence: compiled.required,
      cre: compiled.cre,
    });
    runtime.finalAnswer = guidance;
    return {
      success: false,
      result: null,
      answerText: runtime.finalAnswer,
      runtime,
    };
  }

  /**
   * 执行 RAG 路径：Knowledge 是 Evidence Source，不是直接答。
   * 无 VERIFIED 命中不得 STRONG；LLM 兜底记 ASSUMED → CONDITIONAL。
   */
  private async executeRAG(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
    runtime: System1TurnTrace;
  }> {
    const input = state.user_input;
    const tripId = state.trip.trip_id;
    const crePlan = ensureSystem1CrePlan({
      family: 'KNOWLEDGE_QA',
      message: input,
      tripId,
    });
    const compiled = compileSystem1AcquisitionPlan({
      family: 'KNOWLEDGE_QA',
      evidence: [],
      tripId,
      crePlan,
    });

    const finish = (
      draftAnswer: string,
      evidence: System1Evidence[],
      result: any,
      success: boolean,
      fetchLog: Array<{ key: string; ok: boolean; count: number; detail?: string }>,
    ) => {
      const assumed = evidence.some((e) => e.status === 'ASSUMED');
      const post = compileSystem1AcquisitionPlan({
        family: 'KNOWLEDGE_QA',
        evidence,
        tripId,
        alreadyFetched: compiled.plan.fetchKeys,
        crePlan,
      });
      const runtime = runSystem1DecisionRuntime({
        message: input,
        tripId,
        family: 'KNOWLEDGE_QA',
        creOperation: crePlan.operation,
        evidence,
        claims: buildKnowledgeQaClaims({ text: draftAnswer, assumed }),
        draftAnswer,
        acquisition: {
          ...post.plan,
          fetchedKeys: compiled.plan.fetchKeys,
          fetchLog,
        },
        requiredEvidence: compiled.required,
        cre: compiled.cre,
      });
      runtime.finalAnswer = finalizeSystem1KnowledgeAnswer({
        draftAnswer,
        trace: runtime,
      });
      return {
        success,
        result,
        answerText: runtime.finalAnswer,
        runtime,
      };
    };

    try {
      if (this.enhancedChat && this.isRouteQuestion(input)) {
        const context = this.extractRouteContext(state);
        const enhancedAnswer = await this.enhancedChat.answerRouteQuestion(input, context);
        const snippets = adaptRagSnippets(enhancedAnswer.ragSnippets ?? []);
        const evidence =
          snippets.length > 0
            ? snippets
            : [adaptAssumedKnowledgeHit(enhancedAnswer.answer, 'enhanced_chat')];
        return finish(
          enhancedAnswer.answer,
          evidence,
          {
            type: 'rag',
            query: input,
            source: enhancedAnswer.source,
            structuredData: enhancedAnswer.structuredData,
            ragSnippets: enhancedAnswer.ragSnippets,
            localInsights: enhancedAnswer.localInsights,
          },
          true,
          [
            {
              key: 'knowledge.hit',
              ok: snippets.length > 0,
              count: snippets.length || 1,
              detail: snippets.length ? 'rag_snippets' : 'enhanced_assumed',
            },
          ],
        );
      }

      const results = await this.placesService.search(
        input,
        undefined,
        undefined,
        undefined,
        undefined,
        10,
      );

      if (results.length === 0) {
        if (this.isGeneralTravelEnquiry(input)) {
          const llmText = await this.fallbackLlmTravelQa(input, state);
          if (llmText) {
            this.logger.log(
              `[System1] POI 搜索无结果，已使用 LLM 常识兜底: queryLen=${input.length}`,
            );
            return finish(
              llmText,
              [adaptAssumedKnowledgeHit(llmText, 'llm_fallback')],
              {
                type: 'rag',
                query: input,
                results: [],
                source: 'llm_fallback',
                reason: 'places_empty_general_enquiry',
              },
              true,
              [{ key: 'knowledge.hit', ok: false, count: 1, detail: 'llm_assumed' }],
            );
          }
        }
        return finish(
          `未找到与"${input}"相关的地点信息。`,
          [
            {
              evidenceId: 's1ev:knowledge.hit:unavailable',
              key: 'knowledge.hit',
              sourceType: 'KNOWLEDGE',
              value: null,
              status: 'UNAVAILABLE',
            },
          ],
          { type: 'rag', query: input, results: [] },
          true,
          [{ key: 'knowledge.hit', ok: false, count: 0, detail: 'empty' }],
        );
      }

      const formattedResults = results.map((place, index) => ({
        rank: index + 1,
        id: place.id,
        name: place.nameCN || place.nameEN,
        category: place.category,
        address: place.address,
        rating: place.rating,
      }));
      const topResult = results[0];
      const answerText =
        results.length === 1
          ? `找到了"${topResult.nameCN || topResult.nameEN}"。${topResult.address ? `地址：${topResult.address}` : ''}`
          : `找到了 ${results.length} 个相关地点，推荐：${topResult.nameCN || topResult.nameEN}${results.length > 1 ? ` 等` : ''}`;
      return finish(
        answerText,
        adaptPlaceSearchHits(results),
        {
          type: 'rag',
          query: input,
          results: formattedResults,
          top_result: formattedResults[0],
        },
        true,
        [{ key: 'knowledge.hit', ok: true, count: results.length }],
      );
    } catch (error: any) {
      this.logger.error(`RAG execution error: ${error?.message || String(error)}`);
      return finish(
        '查询知识库时出错',
        [
          {
            evidenceId: 's1ev:knowledge.hit:error',
            key: 'knowledge.hit',
            sourceType: 'KNOWLEDGE',
            value: null,
            status: 'UNAVAILABLE',
            provenance: { provider: error?.message || 'error' },
          },
        ],
        null,
        false,
        [{ key: 'knowledge.hit', ok: false, count: 0, detail: error?.message }],
      );
    }
  }

  /**
   * 是否像「行前咨询 / 装备 / 季节 / 如何准备」而非纯地点名词检索。
   * 纯短地点名（如单查「浅草寺」）不视为 general，保留原「未找到地点」体验。
   */
  private isGeneralTravelEnquiry(input: string): boolean {
    const t = input.trim();
    if (t.length < 2) return false;
    const low = t.toLowerCase();

    const placeOnlyCandidate = t.length <= 10 && !/[?？吗呢么如何怎么要不要需不需要]/.test(t) && !/\d/.test(t);
    if (placeOnlyCandidate) {
      const hasTravelVerb =
        /(?:装备|冰爪|穿衣|签证|天气|预算|攻略|建议|注意|安全|自驾|徒步|高原)/.test(t) ||
        /(?:crampon|pack|bring|wear|visa|weather|budget)/i.test(low);
      if (!hasTravelVerb) return false;
    }

    const signalsZh = [
      '吗',
      '呢',
      '么',
      '如何',
      '怎么',
      '要不要',
      '需不需要',
      '要不要',
      '建议',
      '注意',
      '装备',
      '带什么',
      '穿什么',
      '冰爪',
      '徒步',
      '自驾',
      '路况',
      '季节',
      '月初',
      '月中',
      '预算',
      '攻略',
      '签证',
      '天气',
      '安全',
    ];
    const signalsEn = [
      'should i',
      'do i need',
      'how to',
      'what to',
      'crampon',
      'crampons',
      'pack',
      'bring',
      'wear',
    ];
    if (signalsEn.some((k) => low.includes(k))) return true;
    if (signalsZh.some((k) => t.includes(k))) return true;
    return false;
  }

  /**
   * 地点与路线 RAG 均未命中时，用单次 LLM 回答常识类行前问题（非 POI 数据编造）。
   */
  private async fallbackLlmTravelQa(input: string, state: AgentState): Promise<string | null> {
    if (!this.llmService) {
      this.logger.debug('[System1] LlmService 未注入，跳过 LLM 兜底');
      return null;
    }
    try {
      const provider: LlmProvider = this.llmService.getDefaultProvider();
      const prompt = [
        '你是专业旅行顾问。用户问题不是查询具体景点 POI，而是行前咨询（装备、季节、注意事项、是否携带某物等）。',
        '用清晰中文直接回答；需要分情况时说明条件；不要编造用户未提供的具体行程或预订信息。',
        '',
        `用户问题：${input}`,
      ].join('\n');
      const text = await this.llmService.callLlmWithSchema(provider, prompt, undefined, {
        request_id: state.request_id,
        state_machine_step: 'INTAKE' as OrchestrationStep,
        sub_agent: 'Orchestrator' as SubAgentType,
      });
      const out = text?.trim();
      return out || null;
    } catch (e: any) {
      this.logger.warn(`[System1] LLM 兜底失败: ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * 检测是否是路线相关问题
   */
  private isRouteQuestion(input: string): boolean {
    const lowerInput = input.toLowerCase();
    const routeKeywords = [
      '路线', 'route', '路线方向', 'route direction',
      '为什么选', '为什么推荐', 'why', 'why this',
      '什么感觉', '怎么样', '体验', 'experience',
      '建议', 'tips', '需要注意', '注意',
      'f-road', 'f路', 'highlands', '高地',
      'ebc', '徒步', 'hiking', 'trekking',
    ];

    return routeKeywords.some(keyword => lowerInput.includes(keyword));
  }

  /**
   * 从 AgentState 提取路线上下文
   */
  private extractRouteContext(state: AgentState): {
    routeDirectionId?: string;
    countryCode?: string;
    segmentId?: string;
    dayIndex?: number;
    tripId?: string;
  } {
    return {
      tripId: (state as any).trip_id || undefined,
      // 可以从 state 的其他字段提取更多上下文
      // 例如：state.current_route_direction_id, state.country_code 等
    };
  }
}

