// src/places/places.controller.ts
import { Controller, Get, Post, Body, Query, ParseFloatPipe, Param, ParseIntPipe } from '@nestjs/common';
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
    summary: '推荐酒店（综合隐形成本 + AI 自动平衡）',
    description:
      '根据行程或景点列表推荐合适的酒店，支持三种策略：\n' +
      '- CENTROID（重心法）：适合"特种兵"，找所有景点的地理中心点\n' +
      '- HUB（交通枢纽法）：适合"大多数人"，优先选择离地铁站近的\n' +
      '- RESORT（度假模式）：适合"躺平"，牺牲距离换取档次\n\n' +
      '**AI 自动平衡**：如果未指定策略且提供了 tripId，系统会根据行程密度自动选择策略：\n' +
      '- 高密度（每天 ≥4 个景点）→ CENTROID（市中心 3 星）\n' +
      '- 中密度（每天 2-3 个景点）→ HUB（交通枢纽）\n' +
      '- 低密度（每天 ≤1 个景点）→ RESORT（偏远 4-5 星）\n\n' +
      '**时间价值自动计算**：如果未指定 timeValuePerHour 且提供了 tripId，系统会根据以下因素自动计算：\n' +
      '- 预算水平（总预算 / 行程天数 / 人数）\n' +
      '- 旅行者类型（成年人、老人、儿童）\n' +
      '- 行程密度（高密度行程时间价值更高）\n' +
      '- 时间敏感度（商务旅行 vs 休闲旅行）\n\n' +
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
      maxTier: dto.maxTier,
      timeValuePerHour: dto.timeValuePerHour || 50,
      includeHiddenCost: dto.includeHiddenCost !== false, // 默认 true
    });
  }

  @Post('hotels/recommend-options')
  @ApiOperation({
    summary: '推荐酒店选项（三个区域选项）',
    description:
      '返回三个酒店推荐选项，每个选项标注优缺点，供用户选择：\n\n' +
      '1. **核心方便区**（CONVENIENT）\n' +
      '   - 特点：住在市中心，出门就是地铁，交通便利\n' +
      '   - 代价：房间可能较小，或是预算内只能住 3 星\n\n' +
      '2. **舒适享受区**（COMFORTABLE）\n' +
      '   - 特点：房间大，档次高（4-5 星），适合休闲度假\n' +
      '   - 代价：距离市区较远，每天去市区需坐车 40 分钟以上\n\n' +
      '3. **极限省钱区**（BUDGET）\n' +
      '   - 特点：价格极低，适合预算有限的旅行者\n' +
      '   - 代价：可能距离景点较远，每天通勤 1 小时以上\n\n' +
      '如果提供了 tripId，系统还会分析行程密度并给出 AI 推荐建议。',
  })
  @ApiBody({
    type: HotelRecommendationDto,
    description: '酒店推荐请求参数',
    examples: {
      withTrip: {
        summary: '基于行程的推荐',
        value: {
          tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
          includeHiddenCost: true,
          timeValuePerHour: 50,
        },
      },
      withAttractions: {
        summary: '基于景点列表的推荐',
        value: {
          attractionIds: [47, 48, 49, 50, 51],
          includeHiddenCost: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回三个酒店推荐选项',
    schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', enum: ['CONVENIENT', 'COMFORTABLE', 'BUDGET'] },
              name: { type: 'string', example: '核心方便区' },
              description: { type: 'string', example: '住在市中心，出门就是地铁，交通便利' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
              hotels: { type: 'array', items: { type: 'object' } },
            },
          },
        },
        recommendation: { type: 'string', example: '检测到高密度行程...' },
        densityAnalysis: {
          type: 'object',
          properties: {
            density: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
            avgPlacesPerDay: { type: 'number' },
            totalDays: { type: 'number' },
            totalAttractions: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: '未找到行程或景点信息' })
  async recommendHotelOptions(@Body() dto: HotelRecommendationDto) {
    return this.hotelRecommendationService.recommendHotelOptions({
      tripId: dto.tripId,
      attractionIds: dto.attractionIds,
      maxBudget: dto.maxBudget,
      minTier: dto.minTier,
      maxTier: dto.maxTier,
      timeValuePerHour: dto.timeValuePerHour || 50,
      includeHiddenCost: dto.includeHiddenCost !== false, // 默认 true
    });
  }

  @Post('attractions/:id/enrich')
  @ApiOperation({
    summary: '从高德地图获取景点详细信息',
    description:
      '根据景点的名称和坐标，通过高德地图 API 获取以下信息：\n' +
      '- 开放时间（营业时间）\n' +
      '- 门票价格\n' +
      '- 类型（三级分类）\n' +
      '- 基础亮点（标签）\n' +
      '- 兴趣维度\n\n' +
      '获取的信息会更新到地点的 metadata 字段中。',
  })
  @ApiParam({
    name: 'id',
    description: '地点 ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: '成功更新景点信息',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        name: { type: 'string', example: '天安门广场' },
        metadata: {
          type: 'object',
          properties: {
            openingHours: { type: 'object' },
            ticketPrice: { type: 'string', example: '免费' },
            type: { type: 'string', example: '风景名胜;广场;城市广场' },
            highlights: { type: 'array', items: { type: 'string' } },
            interestDimensions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  @ApiResponse({ status: 400, description: '地点不是景点类别或缺少坐标' })
  async enrichAttraction(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.enrichPlaceFromAmap(id);
  }

  @Post('attractions/batch-enrich')
  @ApiOperation({
    summary: '批量更新景点信息（从高德地图）',
    description:
      '批量从高德地图获取景点详细信息并更新到数据库。\n\n' +
      '可以指定地点 ID 列表，如果不指定则更新所有景点。\n\n' +
      '**注意**：批量更新会调用高德地图 API，请注意 API 配额限制。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        placeIds: {
          type: 'array',
          items: { type: 'number' },
          description: '地点 ID 列表（可选，不提供则更新所有景点）',
          example: [1, 2, 3],
        },
        batchSize: {
          type: 'number',
          description: '批次大小（默认 10）',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
        delay: {
          type: 'number',
          description: '批次间延迟（毫秒，默认 200）',
          default: 200,
          minimum: 0,
        },
      },
    },
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '批量更新完成',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 100 },
        success: { type: 'number', example: 95 },
        failed: { type: 'number', example: 5 },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              placeId: { type: 'number' },
              name: { type: 'string' },
              status: { type: 'string', enum: ['success', 'failed'] },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async batchEnrichAttractions(
    @Body()
    body?: {
      placeIds?: number[];
      batchSize?: number;
      delay?: number;
    }
  ) {
    return this.placesService.batchEnrichPlacesFromAmap(
      body?.placeIds,
      body?.batchSize || 10,
      body?.delay || 200
    );
  }
}

