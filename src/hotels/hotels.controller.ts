// src/hotels/hotels.controller.ts
import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { HotelPriceService } from './services/hotel-price.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelPriceService: HotelPriceService) {}

  @Get('price/estimate')
  @ApiOperation({
    summary: '估算酒店价格',
    description:
      '根据城市、星级、年份和季度估算酒店价格。\n\n' +
      '**估算公式：**\n' +
      '价格 = 基础价格 × 城市-星级因子\n\n' +
      '如果提供了年份和季度，会优先使用该季度的实际价格数据。\n\n' +
      '**推荐酒店：**\n' +
      '设置 `includeRecommendations=true` 可以在返回价格估算的同时返回推荐的酒店列表。',
  })
  @ApiQuery({
    name: 'city',
    description: '城市名称',
    example: '洛阳市',
  })
  @ApiQuery({
    name: 'starRating',
    description: '星级（1-5）',
    example: 4,
    type: Number,
  })
  @ApiQuery({
    name: 'year',
    description: '年份（可选，用于季度估算）',
    example: 2024,
    type: Number,
    required: false,
  })
  @ApiQuery({
    name: 'quarter',
    description: '季度（1-4，可选，需要配合year使用）',
    example: 1,
    type: Number,
    required: false,
  })
  @ApiQuery({
    name: 'includeRecommendations',
    description: '是否包含推荐酒店（默认 false）',
    example: true,
    type: Boolean,
    required: false,
  })
  @ApiQuery({
    name: 'recommendationLimit',
    description: '推荐酒店数量（默认 5，仅在 includeRecommendations=true 时有效）',
    example: 5,
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回估算价格（可选包含推荐酒店，统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async estimatePrice(
    @Query('city') city: string,
    @Query('starRating', ParseIntPipe) starRating: number,
    @Query('year') year?: string,
    @Query('quarter') quarter?: string,
    @Query('includeRecommendations') includeRecommendations?: string,
    @Query('recommendationLimit') recommendationLimit?: string
  ) {
    if (starRating < 1 || starRating > 5) {
      throw new BadRequestException('星级必须在 1-5 之间');
    }

    const yearNum = year ? parseInt(year) : undefined;
    const quarterNum = quarter ? parseInt(quarter) : undefined;
    const includeRecs = includeRecommendations === 'true';
    const recLimit = recommendationLimit ? parseInt(recommendationLimit) : 5;

    if (quarterNum !== undefined && (quarterNum < 1 || quarterNum > 4)) {
      throw new BadRequestException('季度必须在 1-4 之间');
    }

    if (quarterNum !== undefined && yearNum === undefined) {
      throw new BadRequestException('指定季度时必须同时指定年份');
    }

    try {
      let result;
      if (includeRecs) {
        result = await this.hotelPriceService.estimatePriceWithRecommendations(
          city,
          starRating,
          yearNum,
          quarterNum,
          true,
          recLimit
        );
      } else {
        result = await this.hotelPriceService.estimatePrice(
          city,
          starRating,
          yearNum,
          quarterNum
        );
      }
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get('price/city-options')
  @ApiOperation({
    summary: '获取城市的所有星级价格选项',
    description: '返回指定城市所有星级的价格选项，用于展示不同星级的价格对比。',
  })
  @ApiQuery({
    name: 'city',
    description: '城市名称',
    example: '洛阳市',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回星级价格选项（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getCityStarOptions(@Query('city') city: string) {
    const options = await this.hotelPriceService.getCityStarOptions(city);
    return successResponse(options);
  }

  @Get('price/quarterly-trend')
  @ApiOperation({
    summary: '获取季度价格趋势',
    description: '返回指定城市（和星级）的季度价格趋势数据，用于展示价格走势图。',
  })
  @ApiQuery({
    name: 'city',
    description: '城市名称',
    example: '洛阳市',
  })
  @ApiQuery({
    name: 'starRating',
    description: '星级（可选，不指定则返回该城市所有星级的数据）',
    example: 4,
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回季度价格趋势（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getQuarterlyTrend(
    @Query('city') city: string,
    @Query('starRating') starRating?: string
  ) {
    try {
      const starRatingNum = starRating ? parseInt(starRating) : undefined;

      if (starRatingNum !== undefined && (starRatingNum < 1 || starRatingNum > 5)) {
        throw new BadRequestException('星级必须在 1-5 之间');
      }

      const trend = await this.hotelPriceService.getQuarterlyTrend(city, starRatingNum);
      return successResponse(trend);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get('recommendations')
  @ApiOperation({
    summary: '推荐酒店',
    description:
      '根据城市、星级和价格范围推荐酒店。\n\n' +
      '从酒店数据库中筛选符合条件的酒店，并根据品牌推断星级。',
  })
  @ApiQuery({
    name: 'city',
    description: '城市名称',
    example: '洛阳市',
  })
  @ApiQuery({
    name: 'starRating',
    description: '星级（1-5）',
    example: 4,
    type: Number,
  })
  @ApiQuery({
    name: 'minPrice',
    description: '最低价格（可选）',
    example: 300,
    type: Number,
    required: false,
  })
  @ApiQuery({
    name: 'maxPrice',
    description: '最高价格（可选）',
    example: 600,
    type: Number,
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: '返回数量限制（默认 10）',
    example: 10,
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回推荐酒店列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getRecommendations(
    @Query('city') city: string,
    @Query('starRating', ParseIntPipe) starRating: number,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('limit') limit?: string
  ) {
    try {
      if (starRating < 1 || starRating > 5) {
        throw new BadRequestException('星级必须在 1-5 之间');
      }

      const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
      const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
      const limitNum = limit ? parseInt(limit) : 10;

      const recommendations = await this.hotelPriceService.recommendHotels(
        city,
        starRating,
        minPriceNum,
        maxPriceNum,
        limitNum
      );
      return successResponse(recommendations);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }
}
