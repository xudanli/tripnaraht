/**
 * Airbnb MCP Controller
 * 
 * 提供 Airbnb 房源搜索和详情查询的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AirbnbService } from './airbnb.service';
import { AirbnbMonitoringService } from './airbnb-monitoring.service';
import { AirbnbSearchDto } from './dto/airbnb-search.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('airbnb')
@Controller('airbnb')
@Public() // 临时开放，生产环境可能需要认证
export class AirbnbController {
  private readonly logger = new Logger(AirbnbController.name);

  constructor(
    private readonly airbnbService: AirbnbService,
    private readonly monitoring: AirbnbMonitoringService,
  ) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '搜索 Airbnb 房源',
    description: '根据位置、日期、人数等条件搜索 Airbnb 房源',
  })
  @ApiBody({ type: AirbnbSearchDto })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: '服务器错误',
    type: ApiErrorResponseDto,
  })
  async search(@Body() dto: AirbnbSearchDto) {
    try {
      this.logger.log(`Searching listings for location: ${dto.location}`);
      
      const result = await this.airbnbService.searchListings({
        location: dto.location,
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
        pets: dto.pets,
        checkin: dto.checkin,
        checkout: dto.checkout,
        page: dto.page,
        ignoreRobotsText: dto.ignoreRobotsText,
      });

      // 解析结果
      if (result && result.content && result.content[0]) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            
            if (data.error) {
              return errorResponse(
                ErrorCode.INTERNAL_ERROR,
                data.error,
                { suggestion: data.suggestion, url: data.url },
              );
            }

            return successResponse({
              searchUrl: data.searchUrl,
              results: data.searchResults || [],
              total: data.searchResults?.length || 0,
            });
          } catch (parseError) {
            return successResponse({ raw: content.text });
          }
        }
      }

      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Search failed:', error);
      
      if (error.message?.includes('OAuth authorization required')) {
        return errorResponse(
          ErrorCode.UNAUTHORIZED,
          '需要完成 OAuth 认证',
          {
            message: error.message,
            authorizationUrl: error.message.split('Visit: ')[1] || '',
          },
        );
      }

      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '搜索失败',
      );
    }
  }

  @Get('listing/:listingId')
  @ApiOperation({
    summary: '获取房源详情',
    description: '根据房源 ID 获取详细信息',
  })
  @ApiParam({
    name: 'listingId',
    description: '房源 ID',
    example: '1573970428683000922',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '房源不存在',
    type: ApiErrorResponseDto,
  })
  async getListingDetails(
    @Param('listingId') listingId: string,
    @Query('checkin') checkin?: string,
    @Query('checkout') checkout?: string,
    @Query('adults') adults?: number,
    @Query('children') children?: number,
    @Query('infants') infants?: number,
    @Query('pets') pets?: number,
    @Query('ignoreRobotsText') ignoreRobotsText?: boolean,
  ) {
    try {
      this.logger.log(`Getting details for listing: ${listingId}`);
      
      const result = await this.airbnbService.getListingDetails({
        listingId,
        checkin,
        checkout,
        adults: adults ? parseInt(adults.toString()) : undefined,
        children: children ? parseInt(children.toString()) : undefined,
        infants: infants ? parseInt(infants.toString()) : undefined,
        pets: pets ? parseInt(pets.toString()) : undefined,
        ignoreRobotsText,
      });

      // 解析结果
      if (result && result.content && result.content[0]) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            return successResponse(data);
          } catch (parseError) {
            return successResponse({ raw: content.text });
          }
        }
      }

      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Get listing details failed:', error);
      
      if (error.message?.includes('OAuth authorization required')) {
        return errorResponse(
          ErrorCode.UNAUTHORIZED,
          '需要完成 OAuth 认证',
          {
            message: error.message,
            authorizationUrl: error.message.split('Visit: ')[1] || '',
          },
        );
      }

      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取房源详情失败',
      );
    }
  }

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 Airbnb MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      const result = await this.airbnbService.listTools();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('auth/status')
  @ApiOperation({
    summary: '检查授权状态',
    description: '检查当前是否已完成 Airbnb OAuth 授权',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async checkAuthStatus() {
    try {
      const status = await this.airbnbService.checkAuthStatus();
      return successResponse(status);
    } catch (error: any) {
      this.logger.error('Check auth status failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查授权状态失败',
      );
    }
  }

  @Get('auth/url')
  @ApiOperation({
    summary: '获取授权 URL',
    description: '获取 Airbnb OAuth 授权 URL，用户需要访问此 URL 完成授权',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '已授权或获取失败',
    type: ApiErrorResponseDto,
  })
  async getAuthorizationUrl() {
    try {
      const result = await this.airbnbService.getAuthorizationUrl();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Get authorization URL failed:', error);
      
      if (error.message?.includes('Already authorized')) {
        return errorResponse(
          ErrorCode.BAD_REQUEST,
          '已经完成授权，无需再次授权',
        );
      }

      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取授权 URL 失败',
      );
    }
  }

  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证授权',
    description: '验证指定的 connectionId 是否已完成授权',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: '连接 ID（从授权 URL 获取）',
          example: 'meadowlark-bEDi',
        },
      },
      required: ['connectionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '验证成功',
    type: ApiSuccessResponseDto,
  })
  async verifyAuthorization(@Body('connectionId') connectionId: string) {
    try {
      if (!connectionId) {
        return errorResponse(
          ErrorCode.BAD_REQUEST,
          'connectionId 不能为空',
        );
      }

      const result = await this.airbnbService.verifyAuthorization(connectionId);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Verify authorization failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '验证授权失败',
      );
    }
  }

  @Get('monitoring/stats')
  @ApiOperation({
    summary: '获取 Airbnb API 使用统计',
    description: '获取最近 N 天的 Airbnb API 调用统计、性能指标和成本估算',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: '统计天数（默认 7 天）',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async getStats(@Query('days') days?: string) {
    try {
      const daysNum = days ? parseInt(days, 10) : 7;
      const stats = await this.monitoring.getRecentStats(daysNum);
      const performance = await this.monitoring.getPerformanceMetrics(daysNum);
      const totalCost = await this.monitoring.getTotalCostEstimate(daysNum);

      return successResponse({
        dailyStats: stats,
        performance,
        totalCostEstimate: totalCost,
      });
    } catch (error: any) {
      this.logger.error('Get stats failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取统计失败',
      );
    }
  }

  @Get('monitoring/cost-check')
  @ApiOperation({
    summary: '检查成本限制',
    description: '检查今日 Airbnb API 调用成本是否超过限制',
  })
  @ApiQuery({
    name: 'dailyLimit',
    required: false,
    type: Number,
    description: '每日成本限制（USD，默认 1）',
  })
  @ApiResponse({
    status: 200,
    description: '检查成功',
    type: ApiSuccessResponseDto,
  })
  async checkCostLimit(@Query('dailyLimit') dailyLimit?: string) {
    try {
      const limit = dailyLimit ? parseFloat(dailyLimit) : 1;
      const checkResult = await this.monitoring.checkCostLimit(limit);

      return successResponse(checkResult);
    } catch (error: any) {
      this.logger.error('Check cost limit failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查成本限制失败',
      );
    }
  }
}
