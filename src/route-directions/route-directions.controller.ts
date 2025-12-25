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
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';

@ApiTags('route-directions')
@Controller('route-directions')
export class RouteDirectionsController {
  private readonly logger = new Logger(RouteDirectionsController.name);

  constructor(private readonly routeDirectionsService: RouteDirectionsService) {}

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
}

