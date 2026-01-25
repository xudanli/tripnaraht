// src/rag/rag.controller.ts
/**
 * RAG Controller
 * 
 * 提供 RAG 相关的 API 端点
 */

import { Controller, Get, Post, Body, Param, Query, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { RagService } from './services/rag.service';
import { ChunkRetrievalService } from './services/chunk-retrieval.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService, RouteQuestionContext } from './services/enhanced-chat.service';
import { DocumentIndexItem } from './interfaces/rag.interface';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { RAGQueryCollectorService } from './services/rag-query-collector.service';
import { EmbeddingCacheService } from './services/embedding-cache.service';
import { RAGMonitoringService } from './services/rag-monitoring.service';
import { RagTestsetService, RagEvalTestset } from './services/rag-testset.service';
import { IndexingService } from '../knowledge-base/services/indexing.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly chunkRetrieval: ChunkRetrievalService,
    private readonly complianceFactsAgent: ComplianceFactsAgent,
    private readonly routeKnowledgeCurator: RouteKnowledgeCurator,
    private readonly localInsightService: LocalInsightService,
    private readonly enhancedChat: EnhancedChatService,
    private readonly ragEvaluation: RAGEvaluationService,
    private readonly ragQueryCollector: RAGQueryCollectorService,
    private readonly embeddingCacheService: EmbeddingCacheService,
    private readonly ragMonitoringService: RAGMonitoringService,
    private readonly ragTestsetService: RagTestsetService,
    private readonly indexingService: IndexingService,
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
    description: '批量将文档添加到 RAG 知识库索引。支持两种格式：1) DocumentIndexItem数组；2) 路线JSON对象（会自动转换为文档）',
  })
  @ApiBody({ 
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { type: 'object' },
          description: '文档索引项数组'
        },
        {
          type: 'object',
          description: '路线JSON对象（包含route字段）'
        }
      ]
    }
  })
  @ApiResponse({ status: 200, description: '批量索引成功', type: ApiSuccessResponseDto })
  async indexDocuments(@Body() body: DocumentIndexItem[] | any) {
    // 处理路线JSON格式：如果body是对象且包含route字段，则转换为文档数组
    let items: DocumentIndexItem[];
    
    if (!Array.isArray(body)) {
      // 检查是否是路线JSON格式
      if (body && typeof body === 'object' && body.route) {
        items = this.convertRouteToDocuments(body);
      } else {
        // 如果不是数组也不是路线格式，尝试将其包装为数组
        items = Array.isArray(body) ? body : [body];
      }
    } else {
      items = body;
    }

    // 验证items是数组且不为空
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('请求体必须是DocumentIndexItem数组或路线JSON对象');
    }

    const ids = await this.ragService.indexDocuments(items);
    return { ids, success: true, count: ids.length };
  }

  /**
   * 将路线JSON转换为文档索引项数组
   */
  private convertRouteToDocuments(routeData: any): DocumentIndexItem[] {
    const documents: DocumentIndexItem[] = [];
    const { route, metadata, data_provenance } = routeData;

    if (!route) {
      return documents;
    }

    const routeId = route.route_id || 'unknown';
    const routeName = route.route_name || route.route_name_en || 'Unknown Route';
    const countryCode = this.extractCountryCode(route);

    // 1. 主路线文档（概述）
    documents.push({
      collection: 'travel_guides',
      title: `${routeName} - 路线概述`,
      content: this.formatRouteOverview(route),
      countryCode,
      tags: ['route', 'overview', route.route_type || 'self-drive'],
      source: `route:${routeId}`,
      metadata: {
        routeId,
        routeType: route.route_type,
        durationDays: route.duration_days,
        difficultyLevel: route.difficulty_level,
        ...metadata,
      },
    });

    // 2. 关键站点文档
    if (route.key_stops && Array.isArray(route.key_stops)) {
      route.key_stops.forEach((stop: any, index: number) => {
        documents.push({
          collection: 'travel_guides',
          title: `${routeName} - ${stop.name || stop.name_en || `站点${index + 1}`}`,
          content: this.formatStopContent(stop, route),
          countryCode,
          tags: ['route', 'stop', 'poi', stop.type || 'attraction'],
          source: `route:${routeId}:stop:${stop.stop_id || index}`,
          metadata: {
            routeId,
            stopId: stop.stop_id,
            stopIndex: index,
            coordinates: stop.coordinates,
            ...stop,
          },
        });
      });
    }

    // 3. 风险评估文档
    if (route.risk_assessment) {
      documents.push({
        collection: 'travel_guides',
        title: `${routeName} - 风险评估与安全提示`,
        content: this.formatRiskAssessment(route.risk_assessment, route),
        countryCode,
        tags: ['route', 'safety', 'risk-assessment'],
        source: `route:${routeId}:risk`,
        metadata: {
          routeId,
          riskLevel: route.risk_assessment.overall_risk_level,
          riskScore: route.risk_assessment.risk_score,
        },
      });
    }

    // 4. 季节性变化文档
    if (route.seasonal_variations) {
      Object.entries(route.seasonal_variations).forEach(([season, data]: [string, any]) => {
        documents.push({
          collection: 'travel_guides',
          title: `${routeName} - ${season === 'summer' ? '夏季' : season === 'winter' ? '冬季' : season === 'spring' ? '春季' : season === 'autumn' ? '秋季' : season}旅行指南`,
          content: this.formatSeasonalInfo(season, data, route),
          countryCode,
          tags: ['route', 'seasonal', season],
          source: `route:${routeId}:season:${season}`,
          metadata: {
            routeId,
            season,
            months: data.months,
          },
        });
      });
    }

    // 5. 决策支持文档
    if (route.decision_support_summary) {
      documents.push({
        collection: 'travel_guides',
        title: `${routeName} - 决策支持信息`,
        content: this.formatDecisionSupport(route.decision_support_summary, route),
        countryCode,
        tags: ['route', 'decision-support', 'planning'],
        source: `route:${routeId}:decision`,
        metadata: {
          routeId,
        },
      });
    }

    return documents;
  }

  /**
   * 提取国家代码
   */
  private extractCountryCode(route: any): string | undefined {
    // 从start_point或end_point提取
    if (route.start_point?.coordinates) {
      // 根据坐标推断（简化处理，实际应该使用地理编码）
      // 这里假设如果提供了坐标，可以从metadata或其他字段获取
    }
    
    // 从route_id推断（如iceland_golden_circle_001 -> IS）
    if (route.route_id) {
      const routeIdLower = route.route_id.toLowerCase();
      if (routeIdLower.includes('iceland')) return 'IS';
      if (routeIdLower.includes('japan')) return 'JP';
      if (routeIdLower.includes('switzerland')) return 'CH';
      // 可以添加更多映射
    }

    return undefined;
  }

  /**
   * 格式化路线概述
   */
  private formatRouteOverview(route: any): string {
    const parts: string[] = [];

    parts.push(`路线名称：${route.route_name || route.route_name_en || '未知路线'}`);
    if (route.route_name_en && route.route_name !== route.route_name_en) {
      parts.push(`英文名称：${route.route_name_en}`);
    }

    if (route.duration_days) {
      parts.push(`行程天数：${route.duration_days}天`);
    }
    if (route.total_distance_km) {
      parts.push(`总距离：${route.total_distance_km}公里`);
    }
    if (route.difficulty_level) {
      parts.push(`难度等级：${route.difficulty_level}`);
    }
    if (route.best_seasons && Array.isArray(route.best_seasons)) {
      parts.push(`最佳季节：${route.best_seasons.join('、')}`);
    }
    if (route.avoid_seasons && Array.isArray(route.avoid_seasons)) {
      parts.push(`避免季节：${route.avoid_seasons.join('、')}`);
    }

    if (route.rhythm_pattern) {
      parts.push(`节奏模式：${route.rhythm_pattern}`);
    }

    if (route.start_point) {
      parts.push(`起点：${route.start_point.name || route.start_point.name_en || '未知'}`);
    }
    if (route.end_point) {
      parts.push(`终点：${route.end_point.name || route.end_point.name_en || '未知'}`);
    }

    if (route.route_characteristics) {
      const rc = route.route_characteristics;
      if (rc.road_quality) {
        parts.push(`路况：${rc.road_quality.surface_type || '未知'}，${rc.road_quality.condition || '未知'}`);
        if (rc.road_quality.paved_percentage) {
          parts.push(`铺装路面比例：${rc.road_quality.paved_percentage}%`);
        }
      }
    }

    if (route.user_feedback_summary) {
      const ufs = route.user_feedback_summary;
      if (ufs.average_rating) {
        parts.push(`用户评分：${ufs.average_rating}/5.0（基于${ufs.total_reviews || 0}条评价）`);
      }
      if (ufs.common_praises && Array.isArray(ufs.common_praises)) {
        parts.push(`用户好评：${ufs.common_praises.join('、')}`);
      }
      if (ufs.tips_from_users && Array.isArray(ufs.tips_from_users)) {
        parts.push(`用户建议：${ufs.tips_from_users.join('；')}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 格式化站点内容
   */
  private formatStopContent(stop: any, route: any): string {
    const parts: string[] = [];

    parts.push(`站点名称：${stop.name || stop.name_en || '未知站点'}`);
    if (stop.name_en && stop.name !== stop.name_en) {
      parts.push(`英文名称：${stop.name_en}`);
    }

    if (stop.type) {
      parts.push(`类型：${stop.type}`);
    }

    if (stop.recommended_time_minutes) {
      parts.push(`建议游览时间：${stop.recommended_time_minutes}分钟`);
    }

    if (stop.highlights && Array.isArray(stop.highlights)) {
      parts.push(`亮点：\n${stop.highlights.map((h: string) => `- ${h}`).join('\n')}`);
    }

    if (stop.safety_warnings && Array.isArray(stop.safety_warnings)) {
      parts.push(`安全提示：\n${stop.safety_warnings.map((w: string) => `⚠️ ${w}`).join('\n')}`);
    }

    if (stop.accessibility) {
      const acc = stop.accessibility;
      if (acc.wheelchair_friendly) {
        parts.push(`无障碍设施：${acc.wheelchair_friendly}`);
      }
      if (acc.parking) {
        parts.push(`停车：${acc.parking}`);
      }
      if (acc.facilities && Array.isArray(acc.facilities)) {
        parts.push(`设施：${acc.facilities.join('、')}`);
      }
    }

    if (stop.fees) {
      const fees = stop.fees;
      const feeParts: string[] = [];
      if (fees.admission) {
        feeParts.push(`门票：${fees.admission}`);
      }
      if (fees.parking) {
        feeParts.push(`停车费：${fees.parking}`);
      }
      if (fees.parking_isk) {
        feeParts.push(`停车费：${fees.parking_isk} ISK${fees.parking_usd ? ` (约${fees.parking_usd} USD)` : ''}`);
      }
      if (fees.admission_isk) {
        feeParts.push(`门票：${fees.admission_isk} ISK${fees.admission_usd ? ` (约${fees.admission_usd} USD)` : ''}`);
      }
      if (feeParts.length > 0) {
        parts.push(`费用：${feeParts.join('；')}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 格式化风险评估
   */
  private formatRiskAssessment(risk: any, route: any): string {
    const parts: string[] = [];

    parts.push(`总体风险等级：${risk.overall_risk_level || '未知'}`);
    if (risk.risk_score !== undefined) {
      parts.push(`风险评分：${risk.risk_score}`);
    }

    if (risk.risk_breakdown) {
      parts.push('\n风险分解：');
      Object.entries(risk.risk_breakdown).forEach(([key, value]: [string, any]) => {
        const riskName = {
          weather_risk: '天气风险',
          terrain_risk: '地形风险',
          accessibility_risk: '可达性风险',
          health_risk: '健康风险',
          navigation_risk: '导航风险',
          service_risk: '服务风险',
        }[key] || key;

        parts.push(`\n${riskName}：`);
        parts.push(`- 严重程度：${value.severity || '未知'}`);
        parts.push(`- 评分：${value.score || '未知'}`);
        if (value.description) {
          parts.push(`- 描述：${value.description}`);
        }
        if (value.mitigation && Array.isArray(value.mitigation)) {
          parts.push(`- 缓解措施：\n${value.mitigation.map((m: string) => `  • ${m}`).join('\n')}`);
        }
      });
    }

    if (risk.critical_safety_notes && Array.isArray(risk.critical_safety_notes)) {
      parts.push('\n关键安全提示：');
      risk.critical_safety_notes.forEach((note: string) => {
        parts.push(`⚠️ ${note}`);
      });
    }

    if (risk.emergency_contacts && Array.isArray(risk.emergency_contacts)) {
      parts.push('\n紧急联系方式：');
      risk.emergency_contacts.forEach((contact: any) => {
        parts.push(`- ${contact.service}：${contact.number}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * 格式化季节性信息
   */
  private formatSeasonalInfo(season: string, data: any, route: any): string {
    const seasonName = {
      summer: '夏季',
      winter: '冬季',
      spring: '春季',
      autumn: '秋季',
    }[season] || season;

    const parts: string[] = [];

    parts.push(`${seasonName}旅行指南（${route.route_name || route.route_name_en || '未知路线'}）`);

    if (data.months && Array.isArray(data.months)) {
      parts.push(`月份：${data.months.join('、')}`);
    }

    if (data.characteristics) {
      const chars = data.characteristics;
      if (chars.daylight_hours) {
        parts.push(`日照时长：${chars.daylight_hours}`);
      }
      if (chars.temperature_celsius) {
        parts.push(`温度：${chars.temperature_celsius}°C`);
      }
      if (chars.weather) {
        parts.push(`天气：${chars.weather}`);
      }
      if (chars.road_conditions) {
        parts.push(`路况：${chars.road_conditions}`);
      }
      if (chars.tourist_volume) {
        parts.push(`游客量：${chars.tourist_volume}`);
      }
    }

    if (data.pros && Array.isArray(data.pros)) {
      parts.push(`\n优点：\n${data.pros.map((p: string) => `✓ ${p}`).join('\n')}`);
    }

    if (data.cons && Array.isArray(data.cons)) {
      parts.push(`\n缺点：\n${data.cons.map((c: string) => `✗ ${c}`).join('\n')}`);
    }

    if (data.recommendation) {
      parts.push(`\n推荐：${data.recommendation}`);
    }

    if (data.special_requirements && Array.isArray(data.special_requirements)) {
      parts.push(`\n特殊要求：\n${data.special_requirements.map((r: string) => `• ${r}`).join('\n')}`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化决策支持信息
   */
  private formatDecisionSupport(decision: any, route: any): string {
    const parts: string[] = [];

    if (decision.should_you_go) {
      parts.push(`是否适合：${decision.should_you_go}`);
    }

    if (decision.ideal_for && Array.isArray(decision.ideal_for)) {
      parts.push(`\n适合人群：\n${decision.ideal_for.map((item: string) => `✓ ${item}`).join('\n')}`);
    }

    if (decision.not_ideal_for && Array.isArray(decision.not_ideal_for)) {
      parts.push(`\n不适合人群：\n${decision.not_ideal_for.map((item: string) => `✗ ${item}`).join('\n')}`);
    }

    if (decision.key_decision_questions && Array.isArray(decision.key_decision_questions)) {
      parts.push(`\n关键决策问题：`);
      decision.key_decision_questions.forEach((q: any) => {
        parts.push(`\n问题：${q.question}`);
        if (q.if_yes) {
          parts.push(`如果"是"：${q.if_yes}`);
        }
        if (q.if_no) {
          parts.push(`如果"否"：${q.if_no}`);
        }
      });
    }

    return parts.join('\n');
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
  @Public()
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

  /**
   * 评估 Chunk 检索质量（新系统：Chunk 表）
   */
  @Public()
  @Post('evaluation/chunks/evaluate')
  @ApiOperation({
    summary: '评估 Chunk 检索质量',
    description: '评估新知识库系统（Chunk 表）的检索质量，返回 Recall@K、MRR、NDCG 等指标',
  })
  @ApiResponse({ status: 200, description: '评估成功', type: ApiSuccessResponseDto })
  async evaluateChunkRetrieval(
    @Body() body: {
      query: string;
      params: any;
      groundTruthChunkIds: string[];
    },
  ) {
    try {
      const result = await this.ragEvaluation.evaluateChunkRetrieval(
        body.query,
        body.params,
        body.groundTruthChunkIds,
      );
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 批量评估 Chunk 检索质量
   */
  @Public()
  @Post('evaluation/chunks/evaluate-batch')
  @ApiOperation({
    summary: '批量评估 Chunk 检索质量',
    description: '批量评估多个查询在 Chunk 检索链路下的质量指标',
  })
  @ApiResponse({ status: 200, description: '批量评估成功', type: ApiSuccessResponseDto })
  async evaluateChunkBatch(
    @Body() body: {
      testCases: Array<{
        query: string;
        params: any;
        groundTruthChunkIds: string[];
      }>;
    },
  ) {
    try {
      const result = await this.ragEvaluation.evaluateChunkBatch(body.testCases);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 测试集（文件） ====================

  @Public()
  @Get('evaluation/testset')
  @ApiOperation({
    summary: '获取 RAG 评估测试集（文件）',
    description: '读取 e2e-cases/rag-eval-testset.json（可由环境变量 RAG_EVAL_TESTSET_PATH 覆盖）',
  })
  async getEvalTestset() {
    try {
      const testset = await this.ragTestsetService.load();
      return successResponse(testset);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Put('evaluation/testset')
  @ApiOperation({
    summary: '保存 RAG 评估测试集（文件）',
    description: '写入 e2e-cases/rag-eval-testset.json',
  })
  async saveEvalTestset(@Body() body: RagEvalTestset) {
    try {
      await this.ragTestsetService.save(body);
      return successResponse({ message: 'testset saved' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('evaluation/testset/run')
  @ApiOperation({
    summary: '运行测试集评估（Chunk 链路）',
    description:
      '读取测试集并对每个 case 运行 ChunkRetrieval 评估，支持配置 Hybrid/Rerank/Expansion 参数',
  })
  async runEvalTestset(
    @Body()
    body: {
      params?: any;
      limit?: number;
    },
  ) {
    try {
      const testset = await this.ragTestsetService.load();
      const defaultParams = body.params || {};
      const limit = body.limit || 10;

      const cases = testset.testCases.map((tc) => ({
        query: tc.query,
        params: { query: tc.query, limit, ...defaultParams },
        groundTruthChunkIds: tc.groundTruthChunkIds,
      }));

      const result = await this.ragEvaluation.evaluateChunkBatch(cases);
      return successResponse({
        testset: { name: testset.name, version: testset.version, updatedAt: testset.updatedAt },
        result,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 查找与查询相关的 chunks（帮助填充 groundTruthChunkIds）
   */
  @Public()
  @Get('evaluation/testset/find-chunks')
  @ApiOperation({
    summary: '查找相关 chunks',
    description: '根据查询文本查找相关的 chunks，用于帮助填充测试集的 groundTruthChunkIds',
  })
  @ApiQuery({ name: 'query', description: '查询文本', required: true })
  @ApiQuery({ name: 'limit', description: '返回数量限制', required: false, type: Number })
  async findRelevantChunks(
    @Query('query') query: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const chunks = await this.ragTestsetService.findRelevantChunks(query, limit || 10);
      return successResponse({
        query,
        chunks,
        count: chunks.length,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 列出所有 chunks（用于浏览）
   */
  @Public()
  @Get('evaluation/testset/list-chunks')
  @ApiOperation({
    summary: '列出所有 chunks',
    description: '列出数据库中的所有 chunks，用于浏览和选择 groundTruthChunkIds',
  })
  @ApiQuery({ name: 'limit', description: '返回数量限制', required: false, type: Number })
  async listAllChunks(@Query('limit') limit?: number) {
    try {
      const chunks = await this.ragTestsetService.listAllChunks(limit || 100);
      return successResponse({
        chunks,
        count: chunks.length,
      });
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

  /**
   * 从 Chunk 表检索文档（新知识库系统，支持 Hybrid Search）
   */
  @Public()
  @Post('chunks/retrieve')
  @ApiOperation({
    summary: '从 Chunk 表检索文档（支持 Hybrid Search）',
    description: '使用新的知识库系统（KnowledgeFile + Chunk）检索文档，默认启用混合检索（Dense + Sparse）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询文本' },
        limit: { type: 'number', description: '返回数量限制', default: 10 },
        credibilityMin: { type: 'number', description: '最小可信度', default: 0.5 },
        type: { type: 'string', description: '文档类型' },
        category: { type: 'string', description: '文件分类' },
        fileId: { type: 'string', description: '文件ID' },
        useHybridSearch: { type: 'boolean', description: '是否使用混合检索（默认true）', default: true },
        denseWeight: { type: 'number', description: 'Dense检索权重（默认0.7）', default: 0.7 },
        sparseWeight: { type: 'number', description: 'Sparse检索权重（默认0.3）', default: 0.3 },
        useReranking: { type: 'boolean', description: '是否使用重排序（默认false，会增加延迟但提升准确率）', default: false },
        rerankTopK: { type: 'number', description: '重排序的Top-K数量（默认20）', default: 20 },
        useQueryExpansion: { type: 'boolean', description: '是否使用查询扩展（默认false，会增加延迟和成本但提升召回率）', default: false },
        maxQueryVariants: { type: 'number', description: '最大查询变体数量（默认3）', default: 3 },
      },
      required: ['query'],
    },
  })
  @ApiResponse({ status: 200, description: '检索成功', type: ApiSuccessResponseDto })
  async retrieveChunks(@Body() body: {
    query: string;
    limit?: number;
    credibilityMin?: number;
    type?: string;
    category?: string;
    fileId?: string;
    useHybridSearch?: boolean;
    denseWeight?: number;
    sparseWeight?: number;
    useReranking?: boolean;
    rerankTopK?: number;
    useQueryExpansion?: boolean;
    maxQueryVariants?: number;
  }) {
    try {
      const results = await this.chunkRetrieval.retrieve({
        query: body.query,
        limit: body.limit || 10,
        credibilityMin: body.credibilityMin || 0.5,
        type: body.type,
        category: body.category,
        fileId: body.fileId,
        useHybridSearch: body.useHybridSearch !== false, // 默认true
        denseWeight: body.denseWeight || 0.7,
        sparseWeight: body.sparseWeight || 0.3,
        useReranking: body.useReranking === true, // 默认false
        rerankTopK: body.rerankTopK || 20,
        useQueryExpansion: body.useQueryExpansion === true, // 默认false
        maxQueryVariants: body.maxQueryVariants || 3,
      });
      return successResponse(results);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 重建知识库索引
   */
  @Public()
  @Post('knowledge-base/rebuild-index')
  @ApiOperation({
    summary: '重建知识库索引',
    description: '清空并重新索引所有知识库文件',
  })
  @ApiResponse({ status: 200, description: '索引重建成功', type: ApiSuccessResponseDto })
  async rebuildKnowledgeBaseIndex() {
    try {
      await this.indexingService.rebuildIndex();
      return successResponse({ message: '知识库索引重建完成' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 清空知识库索引
   */
  @Public()
  @Post('knowledge-base/clear-index')
  @ApiOperation({
    summary: '清空知识库索引',
    description: '清空所有知识库文件和分块',
  })
  @ApiResponse({ status: 200, description: '索引清空成功', type: ApiSuccessResponseDto })
  async clearKnowledgeBaseIndex() {
    try {
      await this.indexingService.clearIndex();
      return successResponse({ message: '知识库索引已清空' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== Embedding 缓存管理 ====================

  /**
   * 获取 Embedding 缓存统计
   */
  @Public()
  @Get('cache/stats')
  @ApiOperation({
    summary: '获取 Embedding 缓存统计',
    description: '返回缓存命中率、延迟等统计信息',
  })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getCacheStats() {
    try {
      const stats = this.embeddingCacheService.getStats();
      return successResponse(stats);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 重置缓存统计
   */
  @Public()
  @Post('cache/reset-stats')
  @ApiOperation({
    summary: '重置缓存统计',
    description: '重置缓存命中率等统计信息',
  })
  @ApiResponse({ status: 200, description: '重置成功', type: ApiSuccessResponseDto })
  async resetCacheStats() {
    try {
      this.embeddingCacheService.resetStats();
      return successResponse({ message: '缓存统计已重置' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 清空 Embedding 缓存
   */
  @Public()
  @Post('cache/clear')
  @ApiOperation({
    summary: '清空 Embedding 缓存',
    description: '清空所有缓存的 embedding（注意：Redis缓存需要手动清空）',
  })
  @ApiResponse({ status: 200, description: '清空成功', type: ApiSuccessResponseDto })
  async clearCache() {
    try {
      await this.embeddingCacheService.clear();
      return successResponse({ message: 'Embedding缓存已清空（内存缓存），Redis缓存需要手动清空' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== RAG 监控 ====================

  /**
   * 获取 RAG 监控指标
   */
  @Public()
  @Get('monitoring/metrics')
  @ApiOperation({
    summary: '获取 RAG 监控指标',
    description: '返回性能、质量、成本、缓存等监控指标',
  })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getMonitoringMetrics() {
    try {
      const metrics = this.ragMonitoringService.getAllMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取性能指标
   */
  @Public()
  @Get('monitoring/performance')
  @ApiOperation({
    summary: '获取性能指标',
    description: '返回检索延迟、吞吐量、错误率等性能指标',
  })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getPerformanceMetrics() {
    try {
      const metrics = this.ragMonitoringService.getPerformanceMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取质量指标
   */
  @Public()
  @Get('monitoring/quality')
  @ApiOperation({
    summary: '获取质量指标',
    description: '返回 Recall@K、MRR、NDCG 等质量指标（需要有 Ground Truth 数据）',
  })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getQualityMetrics() {
    try {
      const metrics = this.ragMonitoringService.getQualityMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取成本指标
   */
  @Public()
  @Get('monitoring/cost')
  @ApiOperation({
    summary: '获取成本指标',
    description: '返回 Embedding 和 LLM API 调用成本',
  })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getCostMetrics() {
    try {
      const metrics = this.ragMonitoringService.getCostMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 重置监控指标
   */
  @Public()
  @Post('monitoring/reset')
  @ApiOperation({
    summary: '重置监控指标',
    description: '清空所有监控指标数据',
  })
  @ApiResponse({ status: 200, description: '重置成功', type: ApiSuccessResponseDto })
  async resetMonitoringMetrics() {
    try {
      this.ragMonitoringService.resetMetrics();
      return successResponse({ message: '监控指标已重置' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

