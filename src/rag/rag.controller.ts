// src/rag/rag.controller.ts
/**
 * RAG Controller
 * 
 * 提供 RAG 相关的 API 端点
 */

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { RagService } from './services/rag.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService, RouteQuestionContext } from './services/enhanced-chat.service';
import { DocumentIndexItem } from './interfaces/rag.interface';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly complianceFactsAgent: ComplianceFactsAgent,
    private readonly routeKnowledgeCurator: RouteKnowledgeCurator,
    private readonly localInsightService: LocalInsightService,
    private readonly enhancedChat: EnhancedChatService,
  ) {}

  /**
   * 检索文档
   */
  @Get('retrieve')
  async retrieve(
    @Query('query') query: string,
    @Query('collection') collection: string,
    @Query('countryCode') countryCode?: string,
    @Query('limit') limit?: number,
  ) {
    return this.ragService.retrieve({
      query,
      collection,
      countryCode,
      limit: limit ? parseInt(limit.toString()) : 10,
    });
  }

  /**
   * 索引文档
   */
  @Post('index')
  async indexDocument(@Body() item: DocumentIndexItem) {
    const id = await this.ragService.indexDocument(item);
    return { id, success: true };
  }

  /**
   * 批量索引文档
   */
  @Post('index/batch')
  async indexDocuments(@Body() items: DocumentIndexItem[]) {
    const ids = await this.ragService.indexDocuments(items);
    return { ids, success: true, count: ids.length };
  }

  /**
   * 提取 Rail Pass 规则
   */
  @Post('compliance/rail-pass')
  async extractRailPassRules(
    @Body() body: { passType: string; countryCode: string }
  ) {
    return this.complianceFactsAgent.extractRailPassRules(
      body.passType,
      body.countryCode
    );
  }

  /**
   * 提取 Trail Access 规则
   */
  @Post('compliance/trail-access')
  async extractTrailAccessRules(
    @Body() body: { trailId: string; countryCode: string }
  ) {
    return this.complianceFactsAgent.extractTrailAccessRules(
      body.trailId,
      body.countryCode
    );
  }

  /**
   * 刷新合规规则（手动触发）
   */
  @Post('compliance/refresh')
  async refreshComplianceRules() {
    await this.complianceFactsAgent.refreshComplianceRules();
    return { success: true, message: 'Compliance rules refresh started' };
  }

  /**
   * 生成路线叙事
   */
  @Get('route-narrative/:routeDirectionId')
  async getRouteNarrative(
    @Param('routeDirectionId') routeDirectionId: string,
    @Query('countryCode') countryCode?: string,
  ) {
    return this.routeKnowledgeCurator.enrichRouteNarrative(
      routeDirectionId,
      countryCode
    );
  }

  /**
   * 生成路线段叙事
   */
  @Post('segment-narrative')
  async getSegmentNarrative(
    @Body() body: {
      segmentId: string;
      dayIndex: number;
      name?: string;
      description?: string;
      countryCode?: string;
    }
  ) {
    return this.routeKnowledgeCurator.enrichSegmentNarrative(
      body.segmentId,
      body.dayIndex,
      {
        name: body.name,
        description: body.description,
        countryCode: body.countryCode,
      }
    );
  }

  /**
   * 获取当地洞察
   */
  @Get('local-insight')
  async getLocalInsight(
    @Query('countryCode') countryCode: string,
    @Query('tags') tags: string | string[],
    @Query('region') region?: string,
  ) {
    const tagArray = Array.isArray(tags) ? tags : tags.split(',');
    return this.localInsightService.getLocalInsight(
      countryCode,
      tagArray,
      region
    );
  }

  /**
   * 刷新当地洞察
   */
  @Post('local-insight/refresh')
  async refreshLocalInsight(
    @Body() body: {
      countryCode: string;
      tags: string[];
      region?: string;
    }
  ) {
    return this.localInsightService.refreshLocalInsight(
      body.countryCode,
      body.tags,
      body.region
    );
  }

  /**
   * 回答路线问题（增强对话）
   */
  @Post('chat/answer-route-question')
  async answerRouteQuestion(
    @Body() body: {
      question: string;
      routeDirectionId?: string;
      countryCode?: string;
      segmentId?: string;
      dayIndex?: number;
      tripId?: string;
    }
  ) {
    const context: RouteQuestionContext = {
      routeDirectionId: body.routeDirectionId,
      countryCode: body.countryCode,
      segmentId: body.segmentId,
      dayIndex: body.dayIndex,
      tripId: body.tripId,
    };

    return this.enhancedChat.answerRouteQuestion(body.question, context);
  }

  /**
   * 解释为什么不是另一条路线
   */
  @Post('chat/explain-why-not-other-route')
  async explainWhyNotOtherRoute(
    @Body() body: {
      selectedRouteId: string;
      alternativeRouteId: string;
      countryCode: string;
    }
  ) {
    return this.enhancedChat.explainWhyNotOtherRoute(
      body.selectedRouteId,
      body.alternativeRouteId,
      body.countryCode
    );
  }

  /**
   * 获取路线叙事内容（增强对话）
   */
  @Get('chat/route-narrative/:routeDirectionId')
  async getRouteNarrativeForChat(
    @Param('routeDirectionId') routeDirectionId: string,
    @Query('countryCode') countryCode?: string,
  ) {
    return this.enhancedChat.getRouteNarrative(routeDirectionId, countryCode);
  }

  /**
   * 获取目的地深度实用信息（故事3.1）
   */
  @Get('destination-insights')
  @ApiOperation({
    summary: '获取目的地深度实用信息',
    description: '获取行程中目的地的特色贴士和隐藏攻略，包含文化礼仪、小众路线、实用信息等',
  })
  @ApiQuery({ name: 'placeId', description: '地点 ID', required: true })
  @ApiQuery({ name: 'tripId', description: '行程 ID（可选）', required: false })
  @ApiQuery({ name: 'countryCode', description: '国家代码（可选）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回目的地深度信息',
  })
  async getDestinationInsights(
    @Query('placeId') placeId: string,
    @Query('tripId') tripId?: string,
    @Query('countryCode') countryCode?: string,
  ) {
    try {
      // 使用 RAG 检索相关文档
      const ragResults = await this.ragService.retrieve({
        query: `目的地实用信息、特色贴士、隐藏攻略、文化礼仪`,
        collection: 'travel_guides',
        countryCode,
        limit: 10,
      });

      // 获取当地洞察
      let localInsights: any[] = [];
      if (countryCode) {
        try {
          localInsights = await this.localInsightService.getLocalInsight(
            countryCode,
            ['culture', 'tips', 'etiquette', 'hidden_gems']
          );
        } catch (error) {
          // 忽略错误
        }
      }

      // 使用增强对话服务获取路线相关问题答案
      let routeInsights: any = null;
      if (tripId) {
        try {
          const context: RouteQuestionContext = {
            tripId,
            countryCode,
          };
          routeInsights = await this.enhancedChat.answerRouteQuestion(
            `获取 ${placeId} 的深度实用信息和小众攻略`,
            context
          );
        } catch (error) {
          // 忽略错误
        }
      }

      return successResponse({
        placeId,
        insights: {
          tips: ragResults.map(r => ({
            content: r.content,
            source: r.source,
            score: r.score,
          })),
          localInsights: localInsights.map(li => ({
            content: li.content,
            tags: li.tags,
          })),
          routeInsights: routeInsights ? {
            answer: routeInsights.answer,
            source: routeInsights.source,
          } : null,
        },
        credibility: {
          ragSources: ragResults.length,
          localInsightsCount: localInsights.length,
          hasRouteContext: !!tripId,
        },
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 提取行程相关合规规则（故事3.2）
   */
  @Post('extract-compliance-rules')
  @ApiOperation({
    summary: '提取行程相关合规规则',
    description: '自动获取行程涉及的签证和交通合规信息，生成合规清单',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'countryCodes'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        countryCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '国家代码列表',
        },
        ruleTypes: {
          type: 'array',
          items: { type: 'string', enum: ['VISA', 'TRANSPORT', 'ENTRY', 'EXIT'] },
          description: '规则类型（可选）',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功提取合规规则',
  })
  async extractComplianceRules(
    @Body() body: {
      tripId: string;
      countryCodes: string[];
      ruleTypes?: string[];
    }
  ) {
    try {
      const rules: any[] = [];
      const checklist: Array<{
        category: string;
        items: Array<{
          description: string;
          required: boolean;
          deadline?: string;
          source: string;
        }>;
      }> = [];

      // 为每个国家提取合规规则
      for (const countryCode of body.countryCodes) {
        // 提取 Rail Pass 规则（如果相关）
        if (!body.ruleTypes || body.ruleTypes.includes('TRANSPORT')) {
          try {
            const railPassRules = await this.complianceFactsAgent.extractRailPassRules(
              'Eurail Global Pass',
              countryCode
            );
            if (railPassRules && railPassRules.length > 0) {
              rules.push(...railPassRules);
              checklist.push({
                category: '交通规则',
                items: railPassRules.map(rule => ({
                  description: `Pass类型: ${rule.passType}, 需要预订: ${rule.requiresReservation ? '是' : '否'}`,
                  required: rule.requiresReservation || false,
                  deadline: undefined,
                  source: 'RAG提取',
                })),
              });
            }
          } catch (error) {
            // 忽略错误
          }
        }

        // 提取 Trail Access 规则（如果相关）
        if (!body.ruleTypes || body.ruleTypes.includes('ENTRY')) {
          try {
            // 这里需要从行程中获取 trail IDs
            // 简化处理，使用通用查询
            const trailRules = await this.ragService.retrieve({
              query: `${countryCode} trail access rules permits`,
              collection: 'compliance_rules',
              countryCode,
              limit: 5,
            });

            if (trailRules.length > 0) {
              checklist.push({
                category: '路线准入规则',
                items: trailRules.map(rule => ({
                  description: rule.content.substring(0, 200),
                  required: true,
                  source: rule.source || 'RAG检索',
                })),
              });
            }
          } catch (error) {
            // 忽略错误
          }
        }

        // 提取签证规则
        if (!body.ruleTypes || body.ruleTypes.includes('VISA')) {
          try {
            const visaRules = await this.ragService.retrieve({
              query: `${countryCode} visa requirements for Chinese citizens`,
              collection: 'compliance_rules',
              countryCode,
              limit: 5,
            });

            if (visaRules.length > 0) {
              checklist.push({
                category: '签证规则',
                items: visaRules.map(rule => ({
                  description: rule.content.substring(0, 200),
                  required: true,
                  deadline: '出发前至少30天',
                  source: rule.source || 'RAG检索',
                })),
              });
            }
          } catch (error) {
            // 忽略错误
          }
        }
      }

      return successResponse({
        tripId: body.tripId,
        countryCodes: body.countryCodes,
        rules,
        checklist,
        summary: {
          totalRules: rules.length,
          totalChecklistItems: checklist.reduce((sum, cat) => sum + cat.items.length, 0),
          categories: checklist.map(cat => cat.category),
        },
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

