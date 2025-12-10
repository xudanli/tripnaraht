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
    description: '成功返回估算价格（可选包含推荐酒店）',
    schema: {
      type: 'object',
      example: {
        estimatedPrice: 450,
        lowerBound: 360,
        upperBound: 540,
        basePrice: 400,
        cityStarFactor: 1.125,
        quarterPrice: 420,
        sampleCount: 150,
        recommendations: [
          {
            id: 'B0K1PZBE68',
            name: '桔子酒店(洛阳龙门站店)',
            brand: '桔子',
            address: '通衢路与厚载门街交叉口西南角新唐街3号楼',
            district: '洛龙区',
            lat: 34.596104,
            lng: 112.46321,
            phone: '0379-63168888;18603798508',
          },
        ],
      },
    },
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

    if (includeRecs) {
      return this.hotelPriceService.estimatePriceWithRecommendations(
        city,
        starRating,
        yearNum,
        quarterNum,
        true,
        recLimit
      );
    }

    return this.hotelPriceService.estimatePrice(
      city,
      starRating,
      yearNum,
      quarterNum
    );
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
    description: '成功返回星级价格选项',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          starRating: { type: 'number' },
          avgPrice: { type: 'number' },
          cityStarFactor: { type: 'number' },
          sampleCount: { type: 'number' },
          minPrice: { type: 'number', nullable: true },
          maxPrice: { type: 'number', nullable: true },
        },
      },
    },
  })
  async getCityStarOptions(@Query('city') city: string) {
    return this.hotelPriceService.getCityStarOptions(city);
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
    description: '成功返回季度价格趋势',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          year: { type: 'number' },
          quarter: { type: 'number' },
          price: { type: 'number' },
        },
      },
    },
  })
  async getQuarterlyTrend(
    @Query('city') city: string,
    @Query('starRating') starRating?: string
  ) {
    const starRatingNum = starRating ? parseInt(starRating) : undefined;

    if (starRatingNum !== undefined && (starRatingNum < 1 || starRatingNum > 5)) {
      throw new BadRequestException('星级必须在 1-5 之间');
    }

    return this.hotelPriceService.getQuarterlyTrend(city, starRatingNum);
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
    description: '成功返回推荐酒店列表',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'B0K1PZBE68' },
          name: { type: 'string', example: '桔子酒店(洛阳龙门站店)' },
          brand: { type: 'string', nullable: true, example: '桔子' },
          address: { type: 'string', nullable: true },
          district: { type: 'string', nullable: true, example: '洛龙区' },
          lat: { type: 'number', nullable: true, example: 34.596104 },
          lng: { type: 'number', nullable: true, example: 112.46321 },
          phone: { type: 'string', nullable: true },
        },
      },
    },
  })
  async getRecommendations(
    @Query('city') city: string,
    @Query('starRating', ParseIntPipe) starRating: number,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('limit') limit?: string
  ) {
    if (starRating < 1 || starRating > 5) {
      throw new BadRequestException('星级必须在 1-5 之间');
    }

    const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
    const limitNum = limit ? parseInt(limit) : 10;

    return this.hotelPriceService.recommendHotels(
      city,
      starRating,
      minPriceNum,
      maxPriceNum,
      limitNum
    );
  }
}
