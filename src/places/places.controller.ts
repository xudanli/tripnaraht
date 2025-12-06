// src/places/places.controller.ts
import { Controller, Get, Post, Body, Query, ParseFloatPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { HotelRecommendationDto } from './dto/hotel-recommendation.dto';
import { PlaceCategory } from '@prisma/client';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly hotelRecommendationService: HotelRecommendationService,
  ) {}

  @Get('nearby')
  @ApiOperation({ 
    summary: '查找附近的地点',
    description: '根据经纬度查找指定半径内的地点，支持按类别筛选。使用 PostGIS 进行地理位置计算。'
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 34.6937, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: 135.5023, type: Number, required: true })
  @ApiQuery({ name: 'radius', description: '搜索半径（米）', example: 2000, type: Number, required: false })
  @ApiQuery({ 
    name: 'type', 
    description: '地点类型', 
    enum: ['RESTAURANT', 'ATTRACTION', 'SHOPPING', 'HOTEL'],
    required: false 
  })
  @ApiResponse({ status: 200, description: '成功返回附近地点列表' })
  async getNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
    @Query('type') type?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL',
  ) {
    const radiusMeters = radius ? parseFloat(radius) : 2000;
    return this.placesService.findNearby(lat, lng, radiusMeters, type);
  }

  @Get('nearby/restaurants')
  @ApiOperation({ 
    summary: '查找附近的餐厅',
    description: '查找指定半径内的餐厅，支持按支付方式筛选（如 Visa、Alipay 等）'
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 34.6937, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: 135.5023, type: Number, required: true })
  @ApiQuery({ name: 'radius', description: '搜索半径（米）', example: 1000, type: Number, required: false })
  @ApiQuery({ name: 'payment', description: '支付方式（如 Visa、Alipay）', example: 'Visa', required: false })
  @ApiResponse({ status: 200, description: '成功返回附近餐厅列表' })
  async getNearbyRestaurants(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
    @Query('payment') payment?: string,
  ) {
    const radiusMeters = radius ? parseFloat(radius) : 1000;
    return this.placesService.findNearbyRestaurants(lat, lng, radiusMeters, payment);
  }

  @Post()
  @ApiOperation({ 
    summary: '创建地点',
    description: '创建新的地点记录，包括地理位置（PostGIS）和元数据（JSONB）'
  })
  @ApiResponse({ status: 201, description: '地点创建成功' })
  @ApiResponse({ status: 400, description: '输入数据验证失败' })
  async createPlace(@Body() createPlaceDto: CreatePlaceDto) {
    return this.placesService.createPlace(createPlaceDto);
  }

  @Post('hotels/recommend')
  @ApiOperation({
    summary: '推荐酒店（综合隐形成本）',
    description:
      '根据行程或景点列表推荐合适的酒店，支持三种策略：\n' +
      '- CENTROID（重心法）：适合"特种兵"，找所有景点的地理中心点\n' +
      '- HUB（交通枢纽法）：适合"大多数人"，优先选择离地铁站近的\n' +
      '- RESORT（度假模式）：适合"躺平"，牺牲距离换取档次\n\n' +
      '系统会自动计算综合成本（房价 + 交通费 + 时间成本），帮助用户看到隐形成本。',
  })
  @ApiBody({
    type: HotelRecommendationDto,
    description: '酒店推荐请求参数',
    examples: {
      centroid: {
        summary: '重心法示例',
        value: {
          tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
          strategy: 'CENTROID',
          maxBudget: 2000,
          includeHiddenCost: true,
          timeValuePerHour: 50,
        },
      },
      hub: {
        summary: '交通枢纽法示例',
        value: {
          tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
          strategy: 'HUB',
          maxBudget: 1500,
          minTier: 3,
          includeHiddenCost: true,
        },
      },
      resort: {
        summary: '度假模式示例',
        value: {
          attractionIds: [1, 2, 3],
          strategy: 'RESORT',
          minTier: 4,
          includeHiddenCost: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回酒店推荐列表',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hotelId: { type: 'number', example: 1 },
          name: { type: 'string', example: '新宿希尔顿酒店' },
          roomRate: { type: 'number', example: 1500 },
          tier: { type: 'number', example: 4 },
          totalCost: { type: 'number', example: 1528.33 },
          costBreakdown: {
            type: 'object',
            properties: {
              roomRate: { type: 'number', example: 1500 },
              transportCost: { type: 'number', example: 20 },
              timeCost: { type: 'number', example: 8.33 },
              hiddenCost: { type: 'number', example: 28.33 },
              totalCost: { type: 'number', example: 1528.33 },
            },
          },
          recommendationReason: { type: 'string', example: '交通枢纽法：距离地铁站近，交通便利' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: '未找到行程或景点信息' })
  async recommendHotels(@Body() dto: HotelRecommendationDto) {
    return this.hotelRecommendationService.recommendHotels({
      tripId: dto.tripId,
      attractionIds: dto.attractionIds,
      strategy: dto.strategy,
      maxBudget: dto.maxBudget,
      minTier: dto.minTier,
      timeValuePerHour: dto.timeValuePerHour || 50,
      includeHiddenCost: dto.includeHiddenCost !== false, // 默认 true
    });
  }
}

