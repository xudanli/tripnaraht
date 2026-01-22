// src/rag/rag.controller.ts
/**
 * RAG Controller
 * 
 * 提供 RAG 相关的 API 端点
 */

import { Controller, Get, Post, Body, Param, Query, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { RagService } from './services/rag.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService, RouteQuestionContext } from './services/enhanced-chat.service';
import { DocumentIndexItem } from './interfaces/rag.interface';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { RAGQueryCollectorService } from './services/rag-query-collector.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly complianceFactsAgent: ComplianceFactsAgent,
    private readonly routeKnowledgeCurator: RouteKnowledgeCurator,
    private readonly localInsightService: LocalInsightService,
    private readonly enhancedChat: EnhancedChatService,
    private readonly ragEvaluation: RAGEvaluationService,
    private readonly ragQueryCollector: RAGQueryCollectorService,
  ) {}

  /**
   * 检索文档
   */
  @Public()
  @Get('retrieve')
  @ApiOperation({
    summary: '检索文档',
    description: '从 RAG 知识库中检索相关文档',
  })
  @ApiQuery({ name: 'query', description: '查询文本', required: true })
  @ApiQuery({ name: 'collection', description: '集合名称', required: true })
  @ApiQuery({ name: 'countryCode', description: '国家代码', required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制', required: false, type: Number })
  @ApiResponse({ status: 200, description: '检索成功', type: ApiSuccessResponseDto })
  async retrieve(
    @Query('query') query: string,
    @Query('collection') collection: string,
    @Query('countryCode') countryCode?: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const results = await this.ragService.retrieve({
        query,
        collection,
        countryCode,
        limit: limit ? parseInt(limit.toString()) : 10,
      });
      return successResponse(results);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * RAG 搜索（POST 版本，支持更复杂的查询参数）
   */
  @Public()
  @Post('search')
  @ApiOperation({
    summary: 'RAG 搜索',
    description: '从 RAG 知识库中搜索相关文档，支持更复杂的查询参数',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询文本' },
        collection: { type: 'string', description: '集合名称' },
        countryCode: { type: 'string', description: '国家代码' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        limit: { type: 'number', description: '返回数量限制', default: 10 },
        minScore: { type: 'number', description: '最小相似度分数', default: 0.5 },
      },
      required: ['query', 'collection'],
    },
  })
  @ApiResponse({ status: 200, description: '搜索成功', type: ApiSuccessResponseDto })
  async search(
    @Body() body: {
      query: string;
      collection: string;
      countryCode?: string;
      tags?: string[];
      limit?: number;
      minScore?: number;
    },
  ) {
    try {
      const results = await this.ragService.retrieve({
        query: body.query,
        collection: body.collection,
        countryCode: body.countryCode,
        tags: body.tags,
        limit: body.limit || 10,
        minScore: body.minScore || 0.5,
      });
      return successResponse(results);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * RAG 统计
   */
  @Public()
  @Get('stats')
  @ApiOperation({
    summary: 'RAG 统计',
    description: '获取 RAG 知识库的统计信息，包括文档数量、集合统计等',
  })
  @ApiQuery({ name: 'collection', description: '集合名称（可选，不提供则返回所有集合的统计）', required: false })
  @ApiResponse({ status: 200, description: '统计成功', type: ApiSuccessResponseDto })
  async getStats(@Query('collection') collection?: string) {
    try {
      const stats = await this.ragService.getStats(collection);
      return successResponse(stats);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 索引文档
   */
  @Public()
  @Post('index')
  @ApiOperation({
    summary: '索引文档',
    description: '将文档添加到 RAG 知识库索引',
  })
  @ApiBody({ type: Object, description: '文档索引项' })
  @ApiResponse({ status: 200, description: '索引成功', type: ApiSuccessResponseDto })
  async indexDocument(@Body() item: DocumentIndexItem) {
    const id = await this.ragService.indexDocument(item);
    return { id, success: true };
  }

  /**
   * 批量索引文档
   */
  @Public()
  @Post('index/batch')
  @ApiOperation({
    summary: '批量索引文档',
    description: '批量将文档添加到 RAG 知识库索引',
  })
  @ApiBody({ type: [Object], description: '文档索引项数组' })
  @ApiResponse({ status: 200, description: '批量索引成功', type: ApiSuccessResponseDto })
  async indexDocuments(@Body() items: DocumentIndexItem[]) {
    const ids = await this.ragService.indexDocuments(items);
    return { ids, success: true, count: ids.length };
  }

  /**
   * 提取 Rail Pass 规则
   */
  @Public()
  @Post('compliance/rail-pass')
  @ApiOperation({
    summary: '提取 Rail Pass 规则',
    description: '从文档中提取铁路通票相关的合规规则',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        passType: { type: 'string', description: '通票类型' },
        countryCode: { type: 'string', description: '国家代码' },
      },
      required: ['passType', 'countryCode'],
    },
  })
  @ApiResponse({ status: 200, description: '提取成功', type: ApiSuccessResponseDto })
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
  @Public()
  @Post('compliance/trail-access')
  @ApiOperation({
    summary: '提取 Trail Access 规则',
    description: '从文档中提取步道访问相关的合规规则',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trailId: { type: 'string', description: '步道 ID' },
        countryCode: { type: 'string', description: '国家代码' },
      },
      required: ['trailId', 'countryCode'],
    },
  })
  @ApiResponse({ status: 200, description: '提取成功', type: ApiSuccessResponseDto })
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
  @ApiOperation({
    summary: '刷新合规规则缓存',
    description: '手动触发合规规则缓存刷新，用于后台管理系统。会重新从知识库加载最新的合规规则。',
  })
  @ApiResponse({ 
    status: 200, 
    description: '刷新启动成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Compliance rules refresh started' },
      },
    },
  })
  async refreshComplianceRules() {
    await this.complianceFactsAgent.refreshComplianceRules();
    return { success: true, message: 'Compliance rules refresh started' };
  }

  /**
   * 生成路线叙事
   */
  @Public()
  @Get('route-narrative/:routeDirectionId')
  @ApiOperation({
    summary: '生成路线叙事',
    description: '为指定路线生成丰富的叙事内容。可通过 includeLocalInsights 参数选择是否包含当地洞察信息。',
  })
  @ApiParam({ name: 'routeDirectionId', description: '路线方向 ID' })
  @ApiQuery({ name: 'countryCode', description: '国家代码', required: false })
  @ApiQuery({ name: 'includeLocalInsights', description: '是否包含当地洞察信息', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: '生成成功', type: ApiSuccessResponseDto })
  async getRouteNarrative(
    @Param('routeDirectionId') routeDirectionId: string,
    @Query('countryCode') countryCode?: string,
    @Query('includeLocalInsights') includeLocalInsights?: string,
  ) {
    const narrative = await this.routeKnowledgeCurator.enrichRouteNarrative(
      routeDirectionId,
      countryCode
    );

    // 如果需要包含当地洞察，则添加
    if (includeLocalInsights === 'true' && countryCode) {
      const insights = await this.localInsightService.getLocalInsight(
        countryCode,
        ['travel-guide']
      );
      return {
        narrative,
        localInsights: insights,
      };
    }

    return narrative;
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
  @Public()
  @Get('local-insight')
  @ApiOperation({
    summary: '获取当地洞察',
    description: '获取指定地区的当地洞察信息',
  })
  @ApiQuery({ name: 'countryCode', description: '国家代码', required: true })
  @ApiQuery({ name: 'tags', description: '标签（逗号分隔或数组）', required: true })
  @ApiQuery({ name: 'region', description: '地区', required: false })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
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
  @ApiOperation({
    summary: '刷新当地洞察缓存',
    description: '手动触发指定地区的当地洞察信息缓存刷新，用于后台管理系统。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        countryCode: { type: 'string', description: '国家代码', example: 'IS' },
        tags: { 
          type: 'array', 
          items: { type: 'string' },
          description: '标签列表',
          example: ['culture', 'tips', 'etiquette'],
        },
        region: { type: 'string', description: '地区（可选）', example: 'Reykjavik' },
      },
      required: ['countryCode', 'tags'],
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: '刷新成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        refreshedAt: { type: 'string', format: 'date-time' },
        countryCode: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  })
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
  @Public()
  @Post('chat/answer-route-question')
  @ApiOperation({
    summary: '回答路线问题',
    description: '使用增强对话功能回答关于路线的问题',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题文本' },
        routeDirectionId: { type: 'string', description: '路线方向 ID' },
        countryCode: { type: 'string', description: '国家代码' },
        segmentId: { type: 'string', description: '路线段 ID' },
        dayIndex: { type: 'number', description: '天数索引' },
        tripId: { type: 'string', description: '行程 ID' },
      },
      required: ['question'],
    },
  })
  @ApiResponse({ status: 200, description: '回答成功', type: ApiSuccessResponseDto })
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
  @Public()
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

  // ==================== 后台管理接口：文档管理 ====================

  /**
   * 获取文档列表（后台管理）
   */
  @Public()
  @Get('documents')
  @ApiOperation({
    summary: '获取文档列表（后台管理）',
    description: '获取 RAG 知识库中的文档列表，支持分页、筛选等功能',
  })
  @ApiQuery({ name: 'collection', required: false, description: '集合名称' })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'tags', required: false, description: '标签（逗号分隔）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，从1开始', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量', example: 20 })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词（标题或内容）' })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getDocuments(
    @Query('collection') collection?: string,
    @Query('countryCode') countryCode?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
  ) {
    try {
      const pageNum = page ? parseInt(page.toString()) : 1;
      const size = pageSize ? parseInt(pageSize.toString()) : 20;
      const tagArray = tags ? tags.split(',').map(t => t.trim()) : undefined;

      const result = await this.ragService.getDocuments({
        collection,
        countryCode,
        tags: tagArray,
        search,
        page: pageNum,
        pageSize: size,
      });

      // 截断内容预览
      const documentsWithPreview = result.documents.map(doc => ({
        ...doc,
        contentPreview: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
      }));

      return successResponse({
        documents: documentsWithPreview,
        pagination: result.pagination,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取文档详情（后台管理）
   */
  @Public()
  @Get('documents/:id')
  @ApiOperation({
    summary: '获取文档详情（后台管理）',
    description: '根据文档 ID 获取文档的详细信息',
  })
  @ApiParam({ name: 'id', description: '文档 ID' })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getDocument(@Param('id') id: string) {
    try {
      const document = await this.ragService.getDocument(id);

      if (!document) {
        return errorResponse(ErrorCode.NOT_FOUND, '文档不存在');
      }

      return successResponse(document);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 更新文档（后台管理）
   */
  @Public()
  @Put('documents/:id')
  @ApiOperation({
    summary: '更新文档（后台管理）',
    description: '更新 RAG 知识库中的文档，如果内容更新会自动重新生成 embedding',
  })
  @ApiParam({ name: 'id', description: '文档 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文档标题' },
        content: { type: 'string', description: '文档内容' },
        collection: { type: 'string', description: '集合名称' },
        countryCode: { type: 'string', description: '国家代码' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        source: { type: 'string', description: '文档来源' },
        metadata: { type: 'object', description: '元数据' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '更新成功', type: ApiSuccessResponseDto })
  async updateDocument(
    @Param('id') id: string,
    @Body() item: Partial<DocumentIndexItem>,
  ) {
    try {
      await this.ragService.updateDocument(id, item);
      return successResponse({ id, message: '文档更新成功' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 删除文档（后台管理）
   */
  @Public()
  @Delete('documents/:id')
  @ApiOperation({
    summary: '删除文档（后台管理）',
    description: '从 RAG 知识库中删除指定文档',
  })
  @ApiParam({ name: 'id', description: '文档 ID' })
  @ApiResponse({ status: 200, description: '删除成功', type: ApiSuccessResponseDto })
  async deleteDocument(@Param('id') id: string) {
    try {
      await this.ragService.deleteDocument(id);
      return successResponse({ id, message: '文档删除成功' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return errorResponse(ErrorCode.NOT_FOUND, '文档不存在');
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== RAG 检索质量评估 ====================

  /**
   * 评估单次检索质量
   */
  @Public()
  @Post('evaluation/evaluate')
  @ApiOperation({
    summary: '评估单次检索质量',
    description: '评估 RAG 检索的质量，返回 Recall@K、MRR、NDCG 等指标',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询文本' },
        params: {
          type: 'object',
          description: '检索参数',
          properties: {
            query: { type: 'string' },
            collection: { type: 'string' },
            countryCode: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' },
            minScore: { type: 'number' },
          },
        },
        groundTruthDocumentIds: {
          type: 'array',
          items: { type: 'string' },
          description: '正确答案文档 ID 列表',
        },
      },
      required: ['query', 'params', 'groundTruthDocumentIds'],
    },
  })
  @ApiResponse({ status: 200, description: '评估成功', type: ApiSuccessResponseDto })
  async evaluateRetrieval(
    @Body() body: {
      query: string;
      params: {
        query: string;
        collection: string;
        countryCode?: string;
        tags?: string[];
        limit?: number;
        minScore?: number;
      };
      groundTruthDocumentIds: string[];
    },
  ) {
    try {
      const result = await this.ragEvaluation.evaluateRetrieval(
        body.query,
        body.params,
        body.groundTruthDocumentIds,
      );
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 批量评估检索质量
   */
  @Public()
  @Post('evaluation/evaluate-batch')
  @ApiOperation({
    summary: '批量评估检索质量',
    description: '批量评估多个查询的检索质量',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        testCases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              params: { type: 'object' },
              groundTruthDocumentIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['testCases'],
    },
  })
  @ApiResponse({ status: 200, description: '批量评估成功', type: ApiSuccessResponseDto })
  async evaluateBatch(
    @Body() body: {
      testCases: Array<{
        query: string;
        params: any;
        groundTruthDocumentIds: string[];
      }>;
    },
  ) {
    try {
      const result = await this.ragEvaluation.evaluateBatch(body.testCases);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== query-document 对收集 ====================

  /**
   * 收集 query-document 对
   */
  @Public()
  @Post('query-pairs/collect')
  @ApiOperation({
    summary: '收集 query-document 对',
    description: '收集用户查询和正确答案文档的配对，用于 RAG 评估和微调',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询文本' },
        correctDocumentIds: {
          type: 'array',
          items: { type: 'string' },
          description: '正确答案文档 ID 列表',
        },
        metadata: {
          type: 'object',
          description: '元数据',
          properties: {
            source: { type: 'string' },
            userId: { type: 'string' },
            sessionId: { type: 'string' },
            collection: { type: 'string' },
            countryCode: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['query', 'correctDocumentIds'],
    },
  })
  @ApiResponse({ status: 200, description: '收集成功', type: ApiSuccessResponseDto })
  async collectQueryDocumentPair(
    @Body() body: {
      query: string;
      correctDocumentIds: string[];
      metadata?: {
        source?: string;
        userId?: string;
        sessionId?: string;
        collection?: string;
        countryCode?: string;
        tags?: string[];
      };
    },
  ) {
    try {
      const pairId = await this.ragQueryCollector.collectQueryDocumentPair(
        body.query,
        body.correctDocumentIds,
        body.metadata,
      );
      return successResponse({
        pairId,
        message: 'query-document 对已收集',
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 从用户查询自动收集
   */
  @Public()
  @Post('query-pairs/collect-from-query')
  @ApiOperation({
    summary: '从用户查询自动收集 query-document 对',
    description: '基于检索结果和用户反馈自动收集 query-document 对',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询文本' },
        retrievedResults: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              score: { type: 'number' },
            },
          },
          description: '检索结果',
        },
        userFeedback: {
          type: 'object',
          properties: {
            clickedDocumentIds: { type: 'array', items: { type: 'string' } },
            relevantDocumentIds: { type: 'array', items: { type: 'string' } },
            irrelevantDocumentIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['query', 'retrievedResults'],
    },
  })
  @ApiResponse({ status: 200, description: '收集成功', type: ApiSuccessResponseDto })
  async collectFromUserQuery(
    @Body() body: {
      query: string;
      retrievedResults: Array<{ id: string; score: number }>;
      userFeedback?: {
        clickedDocumentIds?: string[];
        relevantDocumentIds?: string[];
        irrelevantDocumentIds?: string[];
      };
    },
  ) {
    try {
      const pairId = await this.ragQueryCollector.collectFromUserQuery(
        body.query,
        body.retrievedResults,
        body.userFeedback,
      );

      if (!pairId) {
        return successResponse({
          message: '没有收集到 query-document 对（可能没有正确答案）',
        });
      }

      return successResponse({
        pairId,
        message: 'query-document 对已收集',
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 批量收集 query-document 对
   */
  @Public()
  @Post('query-pairs/collect-batch')
  @ApiOperation({
    summary: '批量收集 query-document 对',
    description: '批量收集多个 query-document 对',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              correctDocumentIds: { type: 'array', items: { type: 'string' } },
              metadata: { type: 'object' },
            },
          },
        },
      },
      required: ['pairs'],
    },
  })
  @ApiResponse({ status: 200, description: '批量收集成功', type: ApiSuccessResponseDto })
  async collectBatch(
    @Body() body: {
      pairs: Array<{
        query: string;
        correctDocumentIds: string[];
        metadata?: any;
      }>;
    },
  ) {
    try {
      const pairIds = await this.ragQueryCollector.collectBatch(body.pairs);
      return successResponse({
        pairIds,
        successCount: pairIds.length,
        totalCount: body.pairs.length,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取收集的 query-document 对
   */
  @Public()
  @Get('query-pairs')
  @ApiOperation({
    summary: '获取收集的 query-document 对',
    description: '获取已收集的 query-document 对列表',
  })
  @ApiQuery({ name: 'source', required: false, description: '来源过滤' })
  @ApiQuery({ name: 'collection', required: false, description: '集合过滤' })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码过滤' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量限制' })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getQueryPairs(
    @Query('source') source?: string,
    @Query('collection') collection?: string,
    @Query('countryCode') countryCode?: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const pairs = await this.ragQueryCollector.getCollectedPairs({
        source,
        collection,
        countryCode,
        limit: limit ? parseInt(limit.toString()) : undefined,
      });
      return successResponse({
        pairs,
        total: pairs.length,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 导出为评估数据集格式
   */
  @Public()
  @Post('query-pairs/export-for-evaluation')
  @ApiOperation({
    summary: '导出为评估数据集格式',
    description: '将 query-document 对导出为评估数据集格式',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              correctDocumentIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['pairs'],
    },
  })
  @ApiResponse({ status: 200, description: '导出成功', type: ApiSuccessResponseDto })
  async exportForEvaluation(
    @Body() body: {
      pairs: Array<{
        query: string;
        correctDocumentIds: string[];
      }>;
    },
  ) {
    try {
      const evaluationDataset = await this.ragQueryCollector.exportForEvaluation(body.pairs);
      return successResponse({
        evaluationDataset,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

