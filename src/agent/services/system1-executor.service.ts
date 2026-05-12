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
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { DateTime } from 'luxon';
import { EnhancedChatService } from '../../rag/services/enhanced-chat.service';
import { System1InfoCardService } from './system1-info-card.service';
import { System1Result } from '../interfaces/system1-info-card.interface';

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
        };
      } else if (route === RouteType.SYSTEM1_RAG) {
        const ragResult = await this.executeRAG(state);
        return {
          success: ragResult.success,
          result: ragResult.result,
          answerText: ragResult.answerText,
          cardType: 'RAG_RESULT',
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
   * 执行 API 路径（CRUD 操作）
   */
  private async executeAPI(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
  }> {
    const input = state.user_input.toLowerCase();

    // 删除操作
    if (/删除|移除/.test(input)) {
      // 提取 POI 名称
      const match = input.match(/删除|移除\s*(.+)/);
      if (match && match[1]) {
        const targetName = match[1].trim();
        
        // 尝试解析实体：搜索匹配的 POI
        try {
          const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
          
          if (searchResults.length === 0) {
            return {
              success: false,
              result: { action: 'delete', target: targetName, resolved: false },
              answerText: `未找到"${targetName}"，请检查名称是否正确`,
            };
          }

          // 如果找到唯一匹配，返回成功
          if (searchResults.length === 1) {
            const poi = searchResults[0];
            
            // 实际调用删除服务
            if (!state.trip.trip_id) {
              return {
                success: false,
                result: { action: 'delete', target: targetName, resolved: false },
                answerText: '未找到行程信息，无法执行删除操作',
              };
            }

            try {
              // 获取行程的所有 items，找到匹配的项
              const trip = await this.tripsService.findOne(state.trip.trip_id);
              const itemsToDelete: string[] = [];

              // 遍历所有天的所有 items，找到匹配 placeId 的项
              for (const day of trip.days || []) {
                for (const item of day.items || []) {
                  if (item.placeId === poi.id) {
                    itemsToDelete.push(item.id);
                  }
                }
              }

              if (itemsToDelete.length === 0) {
                return {
                  success: false,
                  result: { action: 'delete', target: targetName, resolved: false },
                  answerText: `未找到行程中包含"${poi.nameCN || poi.nameEN}"的项目`,
                };
              }

              // 删除所有匹配的 items
              for (const itemId of itemsToDelete) {
                await this.itineraryItemsService.remove(itemId);
              }

              return {
                success: true,
                result: { 
                  action: 'delete', 
                  target: targetName,
                  resolved: true,
                  poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                  deletedCount: itemsToDelete.length
                },
                answerText: `已删除 ${itemsToDelete.length} 个包含"${poi.nameCN || poi.nameEN}"的行程项`,
              };
            } catch (error: any) {
              this.logger.error(`删除操作失败: ${error?.message || String(error)}`);
              return {
                success: false,
                result: { action: 'delete', target: targetName, resolved: false },
                answerText: `删除操作失败：${error?.message || String(error)}`,
              };
            }
          }

          // 多个匹配，返回候选列表
          return {
            success: false,
            result: { 
              action: 'delete', 
              target: targetName,
              resolved: false,
              candidates: searchResults.slice(0, 5).map(p => ({
                id: p.id,
                name: p.nameCN || p.nameEN,
              }))
            },
            answerText: `找到多个匹配的"${targetName}"，请选择要删除的具体地点`,
          };
        } catch (error: any) {
          this.logger.error(`实体解析失败: ${error?.message || String(error)}`);
          return {
            success: false,
            result: { action: 'delete', target: targetName, resolved: false },
            answerText: `解析"${targetName}"时出错，请重试`,
          };
        }
      }
    }

    // 添加操作
    if (/添加|加入/.test(input)) {
      const match = input.match(/添加|加入\s*(.+)/);
      if (match && match[1]) {
        const targetName = match[1].trim();
        
        // 尝试解析实体：搜索匹配的 POI
        try {
          const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
          
          if (searchResults.length === 0) {
            return {
              success: false,
              result: { action: 'add', target: targetName, resolved: false },
              answerText: `未找到"${targetName}"，请检查名称是否正确或提供更多信息`,
            };
          }

          // 如果找到唯一匹配，返回成功
          if (searchResults.length === 1) {
            const poi = searchResults[0];
            
            // 实际调用添加服务
            if (!state.trip.trip_id) {
              return {
                success: false,
                result: { action: 'add', target: targetName, resolved: false },
                answerText: '未找到行程信息，无法执行添加操作',
              };
            }

            try {
              // 获取行程信息，找到第一个可用的 day
              const trip = await this.tripsService.findOne(state.trip.trip_id);
              
              if (!trip.days || trip.days.length === 0) {
                return {
                  success: false,
                  result: { action: 'add', target: targetName, resolved: false },
                  answerText: '行程中没有可用的日期',
                };
              }

              // 使用第一个 day（可以后续优化为找到最合适的 day）
              const firstDay = trip.days[0];
              
              // 获取该 day 的所有 items 以确定合适的时间
              const existingItems = firstDay.items || [];
              const dayDate = DateTime.fromJSDate(firstDay.date);
              
              // 确定添加时间：如果已有 items，添加到最后一个之后；否则使用默认时间（10:00-12:00）
              let startTime: Date;
              let endTime: Date;
              
              if (existingItems.length > 0 && existingItems[existingItems.length - 1].endTime) {
                // 添加到最后一个 item 之后，默认持续 2 小时
                const lastEndTime = DateTime.fromJSDate(existingItems[existingItems.length - 1].endTime);
                startTime = lastEndTime.toJSDate();
                endTime = lastEndTime.plus({ hours: 2 }).toJSDate();
              } else {
                // 使用默认时间：10:00-12:00
                startTime = dayDate.set({ hour: 10, minute: 0, second: 0 }).toJSDate();
                endTime = dayDate.set({ hour: 12, minute: 0, second: 0 }).toJSDate();
              }

              // 创建新的 itinerary item
              const newItem = await this.itineraryItemsService.create({
                tripDayId: firstDay.id,
                placeId: poi.id,
                type: ItemType.ACTIVITY,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
              });

              return {
                success: true,
                result: { 
                  action: 'add', 
                  target: targetName,
                  resolved: true,
                  poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                  item: { id: newItem.id, startTime, endTime }
                },
                answerText: `已添加：${poi.nameCN || poi.nameEN || targetName}`,
              };
            } catch (error: any) {
              this.logger.error(`添加操作失败: ${error?.message || String(error)}`);
              return {
                success: false,
                result: { action: 'add', target: targetName, resolved: false },
                answerText: `添加操作失败：${error?.message || String(error)}`,
              };
            }
          }

          // 多个匹配，返回候选列表
          return {
            success: false,
            result: { 
              action: 'add', 
              target: targetName,
              resolved: false,
              candidates: searchResults.slice(0, 5).map(p => ({
                id: p.id,
                name: p.nameCN || p.nameEN,
              }))
            },
            answerText: `找到多个匹配的"${targetName}"，请选择要添加的具体地点`,
          };
        } catch (error: any) {
          this.logger.error(`实体解析失败: ${error?.message || String(error)}`);
          return {
            success: false,
            result: { action: 'add', target: targetName, resolved: false },
            answerText: `解析"${targetName}"时出错，请重试`,
          };
        }
      }
    }

    // 默认：返回需要更多信息，并提供友好的引导
    const hasTripId = !!state.trip.trip_id;
    
    let guidanceMessage = '';
    if (hasTripId) {
      guidanceMessage = `我可以帮您：\n\n` +
        `• **添加地点**：例如"添加东京塔"或"在行程中加入浅草寺"\n` +
        `• **删除地点**：例如"删除浅草寺"或"移除东京塔"\n` +
        `• **查询地点**：例如"推荐新宿的拉面店"或"附近有什么景点"\n` +
        `• **规划行程**：例如"规划5天东京游"或"帮我规划行程"\n\n` +
        `请告诉我您想要做什么？`;
    } else {
      guidanceMessage = `我可以帮您：\n\n` +
        `• **规划行程**：例如"规划5天东京游"或"帮我规划冰岛7日行程"\n` +
        `• **查询地点**：例如"推荐新宿的拉面店"或"东京有什么好玩的"\n` +
        `• **搜索景点**：例如"搜索东京塔"或"查找浅草寺"\n` +
        `• **创建行程**：告诉我目的地、日期和偏好，我来为您规划\n\n` +
        `请告诉我您想要做什么？`;
    }
    
    return {
      success: false,
      result: null,
      answerText: guidanceMessage,
    };
  }

  /**
   * 执行 RAG 路径（知识库检索）
   * 
   * 增强功能：
   * - 检测路线相关问题，使用 EnhancedChatService
   * - 其他问题继续使用地点搜索
   */
  private async executeRAG(state: AgentState): Promise<{
    success: boolean;
    result: any;
    answerText: string;
  }> {
    const input = state.user_input;

    try {
      // 1. 检测是否是路线相关问题
      if (this.enhancedChat && this.isRouteQuestion(input)) {
        const context = this.extractRouteContext(state);
        const enhancedAnswer = await this.enhancedChat.answerRouteQuestion(input, context);
        
        return {
          success: true,
          result: {
            type: 'rag',
            query: input,
            source: enhancedAnswer.source,
            structuredData: enhancedAnswer.structuredData,
            ragSnippets: enhancedAnswer.ragSnippets,
            localInsights: enhancedAnswer.localInsights,
          },
          answerText: enhancedAnswer.answer,
        };
      }

      // 2. 使用 PlacesService 的搜索功能（关键词搜索）
      const results = await this.placesService.search(input, undefined, undefined, undefined, undefined, 10);

      if (results.length === 0) {
        if (this.isGeneralTravelEnquiry(input)) {
          const llmText = await this.fallbackLlmTravelQa(input, state);
          if (llmText) {
            this.logger.log(`[System1] POI 搜索无结果，已使用 LLM 常识兜底: queryLen=${input.length}`);
            return {
              success: true,
              result: {
                type: 'rag',
                query: input,
                results: [],
                source: 'llm_fallback',
                reason: 'places_empty_general_enquiry',
              },
              answerText: llmText,
            };
          }
        }
        return {
          success: true,
          result: {
            type: 'rag',
            query: input,
            results: [],
          },
          answerText: `未找到与"${input}"相关的地点信息。`,
        };
      }

      // 格式化结果
      const formattedResults = results.map((place, index) => ({
        rank: index + 1,
        id: place.id,
        name: place.nameCN || place.nameEN,
        category: place.category,
        address: place.address,
        rating: place.rating,
      }));

      // 生成自然语言回答
      const topResult = results[0];
      const answerText = results.length === 1
        ? `找到了"${topResult.nameCN || topResult.nameEN}"。${topResult.address ? `地址：${topResult.address}` : ''}`
        : `找到了 ${results.length} 个相关地点，推荐：${topResult.nameCN || topResult.nameEN}${results.length > 1 ? ` 等` : ''}`;

      return {
        success: true,
        result: {
          type: 'rag',
          query: input,
          results: formattedResults,
          top_result: formattedResults[0],
        },
        answerText,
      };
    } catch (error: any) {
      this.logger.error(`RAG execution error: ${error?.message || String(error)}`);
      return {
        success: false,
        result: null,
        answerText: '查询知识库时出错',
      };
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

