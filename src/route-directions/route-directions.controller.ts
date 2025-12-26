// src/route-directions/route-directions.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  ParseIntPipe,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RouteDirectionsService } from './route-directions.service';
import { RouteDirectionObservabilityService } from './services/route-direction-observability.service';
import { RouteDirectionCardService } from './services/route-direction-card.service';
import { RouteDirectionSelectorService } from './services/route-direction-selector.service';
import { RouteDirectionExplainerService } from './services/route-direction-explainer.service';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { RouteDirectionCardDto } from './dto/route-direction-card.dto';
import { RouteDirectionExplainer } from './interfaces/route-direction-explainer.interface';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';

@ApiTags('route-directions')
@Controller('route-directions')
export class RouteDirectionsController {
  private readonly logger = new Logger(RouteDirectionsController.name);

  constructor(
    private readonly routeDirectionsService: RouteDirectionsService,
    private readonly observabilityService: RouteDirectionObservabilityService,
    private readonly cardService: RouteDirectionCardService,
    private readonly selectorService: RouteDirectionSelectorService,
    private readonly explainerService: RouteDirectionExplainerService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建路线方向', description: '创建新的国家级路线方向资产' })
  @ApiBody({ type: CreateRouteDirectionDto })
  @ApiResponse({ status: 201, description: '成功创建路线方向' })
  async createRouteDirection(@Body() dto: CreateRouteDirectionDto) {
    try {
      const result = await this.routeDirectionsService.createRouteDirection(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to create route direction', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to create route direction',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: '查询路线方向', description: '根据条件查询路线方向列表' })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'tag', required: false, description: '标签' })
  @ApiQuery({ name: 'tags', required: false, description: '标签数组', type: [String] })
  @ApiQuery({ name: 'isActive', required: false, description: '是否激活', type: Boolean })
  @ApiQuery({ name: 'month', required: false, description: '月份（1-12）', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线方向列表' })
  async findRouteDirections(@Query() query: QueryRouteDirectionDto) {
    try {
      const results = await this.routeDirectionsService.findRouteDirections(query);
      return successResponse(results);
    } catch (error: any) {
      this.logger.error('Failed to find route directions', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to find route directions',
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: '获取路线方向详情', description: '根据 ID 获取路线方向详情' })
  @ApiParam({ name: 'id', description: '路线方向 ID', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线方向详情' })
  @ApiResponse({ status: 404, description: '路线方向不存在' })
  async getRouteDirectionById(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.routeDirectionsService.findRouteDirectionById(id);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error('Failed to get route direction', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction',
      );
    }
  }

  @Get('uuid/:uuid')
  @ApiOperation({ summary: '根据 UUID 获取路线方向', description: '根据 UUID 获取路线方向详情' })
  @ApiParam({ name: 'uuid', description: '路线方向 UUID', type: String })
  @ApiResponse({ status: 200, description: '成功返回路线方向详情' })
  @ApiResponse({ status: 404, description: '路线方向不存在' })
  async getRouteDirectionByUuid(@Param('uuid') uuid: string) {
    try {
      const result = await this.routeDirectionsService.findRouteDirectionByUuid(uuid);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error('Failed to get route direction', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction',
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: '更新路线方向', description: '更新路线方向信息' })
  @ApiParam({ name: 'id', description: '路线方向 ID', type: Number })
  @ApiBody({ type: CreateRouteDirectionDto })
  @ApiResponse({ status: 200, description: '成功更新路线方向' })
  @ApiResponse({ status: 404, description: '路线方向不存在' })
  async updateRouteDirection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateRouteDirectionDto>,
  ) {
    try {
      const result = await this.routeDirectionsService.updateRouteDirection(id, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error('Failed to update route direction', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to update route direction',
      );
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除路线方向', description: '软删除路线方向（设置 isActive = false）' })
  @ApiParam({ name: 'id', description: '路线方向 ID', type: Number })
  @ApiResponse({ status: 200, description: '成功删除路线方向' })
  async deleteRouteDirection(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.routeDirectionsService.deleteRouteDirection(id);
      return successResponse(null);
    } catch (error) {
      this.logger.error('Failed to delete route direction', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to delete route direction',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Post('templates')
  @ApiOperation({ summary: '创建路线模板', description: '创建基于路线方向的行程模板' })
  @ApiBody({ type: CreateRouteTemplateDto })
  @ApiResponse({ status: 201, description: '成功创建路线模板' })
  async createRouteTemplate(@Body() dto: CreateRouteTemplateDto) {
    try {
      const result = await this.routeDirectionsService.createRouteTemplate(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to create route template', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to create route template',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Get('templates/:id')
  @ApiOperation({ summary: '获取路线模板详情', description: '根据 ID 获取路线模板详情' })
  @ApiParam({ name: 'id', description: '路线模板 ID', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线模板详情' })
  @ApiResponse({ status: 404, description: '路线模板不存在' })
  async getRouteTemplateById(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.routeDirectionsService.findRouteTemplateById(id);
      return successResponse(result);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return errorResponse(
          ErrorCode.NOT_FOUND,
          error.message,
          { statusCode: 404 }
        );
      }
      this.logger.error('Failed to get route template', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get route template',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Get('by-country/:countryCode')
  @ApiOperation({
    summary: '根据国家获取路线方向',
    description: '用于 Agent 路由，根据国家代码获取可用的路线方向',
  })
  @ApiParam({ name: 'countryCode', description: '国家代码', type: String })
  @ApiQuery({ name: 'tags', required: false, description: '标签数组', type: [String] })
  @ApiQuery({ name: 'month', required: false, description: '月份（1-12）', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量限制', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线方向列表' })
  async getRouteDirectionsByCountry(
    @Param('countryCode') countryCode: string,
    @Query('tags') tags?: string[],
    @Query('month') month?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      const results = await this.routeDirectionsService.findRouteDirectionsByCountry(
        countryCode,
        {
          tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
          month: month ? parseInt(month.toString(), 10) : undefined,
          limit: limit ? parseInt(limit.toString(), 10) : undefined,
        },
      );
      return successResponse(results);
    } catch (error) {
      this.logger.error('Failed to get route directions by country', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get route directions by country',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Get('observability/trace/:requestId')
  @ApiOperation({
    summary: '获取请求 trace 报告',
    description: '获取指定请求的完整 trace 报告，用于回答"慢在哪""为什么选了这条 RD""为什么 POI pool 变小"',
  })
  @ApiParam({ name: 'requestId', description: '请求 ID', type: String })
  @ApiResponse({ status: 200, description: '成功返回 trace 报告' })
  async getTraceReport(@Param('requestId') requestId: string) {
    try {
      const report = this.observabilityService.generateTraceReport(requestId);
      return successResponse(report);
    } catch (error: any) {
      this.logger.error('Failed to get trace report', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get trace report',
      );
    }
  }

  @Get('observability/metrics')
  @ApiOperation({
    summary: '获取聚合 metrics',
    description: '获取 RouteDirection 相关的聚合 metrics（延迟、质量、错误）',
  })
  @ApiResponse({ status: 200, description: '成功返回 metrics' })
  async getMetrics() {
    try {
      const metrics = this.observabilityService.getMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      this.logger.error('Failed to get metrics', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get metrics',
      );
    }
  }

  @Get('cards')
  @ApiOperation({
    summary: '获取路线方向卡片列表',
    description: '获取面向前端/LLM 的路线方向卡片，用于在生成行程前展示',
  })
  @ApiQuery({ name: 'countryCode', required: true, description: '国家代码' })
  @ApiQuery({ name: 'month', required: false, description: '月份（1-12）', type: Number })
  @ApiQuery({ name: 'preferences', required: false, description: '偏好标签', type: [String] })
  @ApiQuery({ name: 'pace', required: false, description: '节奏偏好', enum: ['relaxed', 'moderate', 'intense'] })
  @ApiQuery({ name: 'riskTolerance', required: false, description: '风险承受度', enum: ['low', 'medium', 'high'] })
  @ApiResponse({ status: 200, description: '成功返回路线方向卡片列表', type: [RouteDirectionCardDto] })
  async getRouteDirectionCards(
    @Query('countryCode') countryCode: string,
    @Query('month') month?: number,
    @Query('preferences') preferences?: string[],
    @Query('pace') pace?: 'relaxed' | 'moderate' | 'intense',
    @Query('riskTolerance') riskTolerance?: 'low' | 'medium' | 'high',
  ) {
    try {
      // 获取路线方向推荐
      const recommendations = await this.selectorService.pickRouteDirections(
        {
          preferences: preferences ? (Array.isArray(preferences) ? preferences : [preferences]) : undefined,
          pace,
          riskTolerance,
        },
        countryCode,
        month ? parseInt(month.toString(), 10) : undefined
      );

      // 转换为 Card DTO
      const cards: RouteDirectionCardDto[] = recommendations.map(rec => {
        return this.cardService.toCard(
          rec,
          rec.scoreBreakdown,
          rec.matchedSignals
        );
      });

      return successResponse(cards);
    } catch (error: any) {
      this.logger.error('Failed to get route direction cards', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction cards',
      );
    }
  }

  @Get(':id/card')
  @ApiOperation({
    summary: '获取单个路线方向卡片',
    description: '根据 ID 获取路线方向卡片',
  })
  @ApiParam({ name: 'id', description: '路线方向 ID', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线方向卡片', type: RouteDirectionCardDto })
  async getRouteDirectionCardById(@Param('id', ParseIntPipe) id: number) {
    try {
      const routeDirection = await this.routeDirectionsService.findRouteDirectionById(id);
      
      // 创建一个临时的推荐对象
      const recommendation: any = {
        routeDirection,
        score: 0,
        reasons: [],
        constraints: routeDirection.constraints,
        riskProfile: routeDirection.riskProfile,
        signaturePois: routeDirection.signaturePois,
      };

      const card = this.cardService.toCard(recommendation);
      return successResponse(card);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error('Failed to get route direction card', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction card',
      );
    }
  }

  @Get(':id/explainer')
  @ApiOperation({
    summary: '获取路线方向说明卡',
    description: '获取可解释、可对外讲、可运营的路线方向说明卡',
  })
  @ApiParam({ name: 'id', description: '路线方向 ID', type: Number })
  @ApiResponse({ status: 200, description: '成功返回路线方向说明卡', type: Object })
  async getRouteDirectionExplainer(@Param('id', ParseIntPipe) id: number) {
    try {
      const routeDirection = await this.routeDirectionsService.findRouteDirectionById(id);
      
      // 创建一个临时的推荐对象
      const recommendation: any = {
        routeDirection,
        score: 0,
        reasons: [],
        constraints: routeDirection.constraints,
        riskProfile: routeDirection.riskProfile,
        signaturePois: routeDirection.signaturePois,
      };

      const explainer = this.explainerService.generateExplainer(recommendation);
      return successResponse(explainer);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error('Failed to get route direction explainer', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction explainer',
      );
    }
  }

  @Get('explainers')
  @ApiOperation({
    summary: '获取路线方向说明卡列表',
    description: '根据国家代码获取所有路线方向的说明卡',
  })
  @ApiQuery({ name: 'countryCode', required: true, description: '国家代码' })
  @ApiResponse({ status: 200, description: '成功返回路线方向说明卡列表', type: [Object] })
  async getRouteDirectionExplainers(@Query('countryCode') countryCode: string) {
    try {
      const routeDirections = await this.routeDirectionsService.findRouteDirectionsByCountry(
        countryCode,
        {
          includeDeprecated: false,
        }
      );

      const explainers: RouteDirectionExplainer[] = routeDirections.active.map(rd => {
        const recommendation: any = {
          routeDirection: rd,
          score: 0,
          reasons: [],
          constraints: rd.constraints,
          riskProfile: rd.riskProfile,
          signaturePois: rd.signaturePois,
        };
        return this.explainerService.generateExplainer(recommendation);
      });

      return successResponse(explainers);
    } catch (error: any) {
      this.logger.error('Failed to get route direction explainers', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to get route direction explainers',
      );
    }
  }
}

