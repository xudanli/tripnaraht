/**
 * Booking.com Controller
 * 
 * 提供 Booking.com 租车搜索服务的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
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
  ApiQuery,
} from '@nestjs/swagger';
import { BookingComService } from './booking-com.service';
import { BookingComMonitoringService } from './booking-com-monitoring.service';
import { SearchCarRentalsDto } from './dto/booking-com.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('booking-com')
@Controller('booking-com')
@Public() // 临时开放，生产环境可能需要认证
export class BookingComController {
  private readonly logger = new Logger(BookingComController.name);

  constructor(
    private readonly bookingComService: BookingComService,
    private readonly monitoringService: BookingComMonitoringService,
  ) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '搜索租车',
    description: '根据取车/还车地点和时间搜索可用租车',
  })
  @ApiBody({ type: SearchCarRentalsDto })
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
  async searchCarRentals(@Body() dto: SearchCarRentalsDto) {
    try {
      if (!this.bookingComService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Booking.com service is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration.',
        );
      }

      const result = await this.bookingComService.searchCarRentals(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Search car rentals failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '搜索租车失败',
      );
    }
  }

  @Get('health')
  @ApiOperation({
    summary: '检查服务状态',
    description: '检查 Booking.com 服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务状态',
    type: ApiSuccessResponseDto,
  })
  async health() {
    return successResponse({
      available: this.bookingComService.isAvailable(),
      service: 'booking-com',
    });
  }

  @Get('monitoring/stats')
  @ApiOperation({ summary: '获取 Booking.com API 监控统计' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '统计天数（默认 7 天）' })
  @ApiResponse({ status: 200, description: '成功返回监控统计' })
  async getMonitoringStats(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      return errorResponse(
        ErrorCode.BAD_REQUEST,
        'days 必须是 1-30 之间的数字',
      );
    }

    try {
      const performance = await this.monitoringService.getPerformanceSummary(daysNum);
      const totalCost = await this.monitoringService.getTotalCostEstimate(daysNum);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      const dailyStats = await this.monitoringService.getStatsForDateRange(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      return successResponse({
        dailyStats,
        performance,
        totalCostEstimate: totalCost,
      });
    } catch (error: any) {
      this.logger.error(`Failed to get monitoring stats: ${error.message}`);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取监控统计失败: ${error.message}`,
      );
    }
  }

  @Get('monitoring/cost-check')
  @ApiOperation({ summary: '检查是否超过成本限制' })
  @ApiQuery({ name: 'limit', required: true, type: Number, description: '成本限制（USD）' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '统计天数（默认 7 天）' })
  @ApiResponse({ status: 200, description: '成功返回成本检查结果' })
  async checkCostLimit(@Query('limit') limit: string, @Query('days') days?: string) {
    const limitNum = parseFloat(limit);
    if (isNaN(limitNum) || limitNum < 0) {
      return errorResponse(
        ErrorCode.BAD_REQUEST,
        'limit 必须是有效的正数',
      );
    }

    const daysNum = days ? parseInt(days, 10) : 7;
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
      return errorResponse(
        ErrorCode.BAD_REQUEST,
        'days 必须是 1-30 之间的数字',
      );
    }

    try {
      const result = await this.monitoringService.checkCostLimit(limitNum, daysNum);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`Failed to check cost limit: ${error.message}`);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `检查成本限制失败: ${error.message}`,
      );
    }
  }
}
