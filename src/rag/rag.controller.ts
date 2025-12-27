// src/rag/rag.controller.ts
/**
 * RAG Controller
 * 
 * 提供 RAG 相关的 API 端点
 */

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { RagService } from './services/rag.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService, RouteQuestionContext } from './services/enhanced-chat.service';
import { DocumentIndexItem } from './interfaces/rag.interface';

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
}

