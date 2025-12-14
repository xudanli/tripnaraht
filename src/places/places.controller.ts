// src/places/places.controller.ts
import { Controller, Get, Post, Body, Query, ParseFloatPipe, Param, ParseIntPipe, GatewayTimeoutException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { NaturePoiService } from './services/nature-poi.service';
import { NaturePoiMapperService } from './services/nature-poi-mapper.service';
import { NaraHintService } from './services/nara-hint.service';
import { RouteDifficultyService } from './services/route-difficulty.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { HotelRecommendationDto } from './dto/hotel-recommendation.dto';
import { RouteDifficultyRequestDto } from './dto/route-difficulty.dto';
import { PlaceCategory } from '@prisma/client';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly hotelRecommendationService: HotelRecommendationService,
    private readonly naturePoiService: NaturePoiService,
    private readonly naturePoiMapperService: NaturePoiMapperService,
    private readonly naraHintService: NaraHintService,
    private readonly routeDifficultyService: RouteDifficultyService,
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
  @ApiResponse({ 
    status: 200, 
    description: '成功返回附近地点列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
    @Query('type') type?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL',
  ) {
    try {
      const radiusMeters = radius ? parseFloat(radius) : 2000;
      const places = await this.placesService.findNearby(lat, lng, radiusMeters, type);
      return successResponse(places);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
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
  @ApiResponse({ 
    status: 200, 
    description: '地点创建成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async createPlace(@Body() createPlaceDto: CreatePlaceDto) {
    try {
      const place = await this.placesService.createPlace(createPlaceDto);
      return successResponse(place);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
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

  @Get('overpass/:countryCode')
  @ApiOperation({
    summary: '从 Google Places API 获取指定国家的景点数据',
    description:
      '从 Google Places API 获取指定国家的旅游景点数据。\n\n' +
      '支持的国家代码：ISO 3166-1 标准（如 IS=冰岛，JP=日本等）\n\n' +
      '返回的数据包括：\n' +
      '- 景点名称（中英文）\n' +
      '- 经纬度坐标\n' +
      '- 景点类型（attraction, viewpoint, museum 等）\n' +
      '- OSM 原始标签数据',
  })
  @ApiParam({
    name: 'countryCode',
    description: 'ISO 3166-1 国家代码',
    example: 'IS',
    type: String,
  })
  @ApiQuery({
    name: 'tourismTypes',
    description: '旅游类型过滤（可选，多个用逗号分隔）',
    example: 'attraction,viewpoint,museum',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回景点列表',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          osmId: { type: 'number', example: 123456 },
          osmType: { type: 'string', enum: ['node', 'way', 'relation'], example: 'node' },
          name: { type: 'string', example: 'Hallgrímskirkja' },
          nameEn: { type: 'string', example: 'Hallgrimskirkja' },
          lat: { type: 'number', example: 64.1466 },
          lng: { type: 'number', example: -21.9426 },
          category: { type: 'string', example: 'tourism' },
          type: { type: 'string', example: 'attraction' },
          rawTags: { type: 'object' },
        },
      },
    },
  })
  async getAttractionsFromOverpass(
    @Param('countryCode') countryCode: string,
    @Query('tourismTypes') tourismTypes?: string,
  ) {
    const types = tourismTypes
      ? tourismTypes.split(',').map((t) => t.trim())
      : undefined;
    
    // 设置超时时间（45 秒），如果超时则返回 504
    const timeoutMs = 45000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new GatewayTimeoutException('Google Places API 请求超时，请稍后重试或减少搜索范围'));
      }, timeoutMs);
    });

    try {
      // 使用 Promise.race 实现超时控制
      const result = await Promise.race([
        this.placesService.fetchAttractionsFromOverpass(countryCode, types),
        timeoutPromise,
      ]);
      return result;
    } catch (error: any) {
      // 如果是超时错误，直接抛出
      if (error instanceof GatewayTimeoutException) {
        throw error;
      }
      // 其他错误也抛出
      throw error;
    }
  }

  @Post('overpass/iceland/import')
  @ApiOperation({
    summary: '从 Google Places API 导入冰岛景点到数据库',
    description:
      '从 Google Places API 获取冰岛的所有旅游景点，并保存到数据库。\n\n' +
      '**功能说明**：\n' +
      '- 自动获取或创建冰岛城市记录\n' +
      '- 从 Google Places 获取景点数据\n' +
      '- 自动去重（通过 OSM ID 或名称+坐标）\n' +
      '- 批量保存到数据库\n\n' +
      '**返回结果**：\n' +
      '- total: 总数量\n' +
      '- created: 成功创建数量\n' +
      '- skipped: 跳过数量（已存在）\n' +
      '- errors: 错误数量\n' +
      '- results: 详细结果列表',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tourismTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '旅游类型过滤（可选）',
          example: ['attraction', 'viewpoint', 'museum'],
        },
        cityId: {
          type: 'number',
          description: '城市 ID（可选，不提供则自动查找或创建）',
          example: 1,
        },
      },
      required: [],
    },
  })
  @ApiResponse({
    status: 200,
    description: '导入完成',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 500 },
        created: { type: 'number', example: 450 },
        skipped: { type: 'number', example: 30 },
        errors: { type: 'number', example: 20 },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              osmId: { type: 'number' },
              name: { type: 'string' },
              status: { type: 'string', enum: ['created', 'skipped', 'error'] },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async importIcelandAttractions(
    @Body()
    body?: {
      tourismTypes?: string[];
      cityId?: number;
    }
  ) {
    return this.placesService.importIcelandAttractionsFromOverpass(
      body?.tourismTypes,
      body?.cityId
    );
  }

  @Post('nature-poi/import')
  @ApiOperation({
    summary: '从 GeoJSON 导入自然 POI 数据',
    description:
      '从冰岛官方地理数据（Landmælingar Íslands / Náttúrufræðistofnun Íslands）导入自然 POI。\n\n' +
      '**支持的数据源**：\n' +
      '- iceland_lmi: 冰岛土地测量局数据\n' +
      '- iceland_nsi: 冰岛自然历史研究所数据\n' +
      '- manual: 手工维护数据\n\n' +
      '**GeoJSON 格式要求**：\n' +
      '- 必须是 FeatureCollection\n' +
      '- 每个 Feature 的 properties 应包含：name, subCategory, accessType 等字段\n' +
      '- 坐标系统应为 WGS84 (EPSG:4326)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        geojson: {
          type: 'object',
          description: 'GeoJSON FeatureCollection',
        },
        source: {
          type: 'string',
          enum: ['iceland_lmi', 'iceland_nsi', 'manual'],
          example: 'iceland_nsi',
        },
        countryCode: {
          type: 'string',
          example: 'IS',
        },
        cityId: {
          type: 'number',
          description: '城市 ID（可选）',
          example: 1,
        },
      },
      required: ['geojson', 'source', 'countryCode'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '导入完成',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 100 },
        created: { type: 'number', example: 85 },
        skipped: { type: 'number', example: 10 },
        errors: { type: 'number', example: 5 },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              status: { type: 'string', enum: ['created', 'skipped', 'error'] },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async importNaturePoiFromGeoJSON(
    @Body()
    body: {
      geojson: any;
      source: 'iceland_lmi' | 'iceland_nsi' | 'manual';
      countryCode: string;
      cityId?: number;
    }
  ) {
    return this.naturePoiService.importFromGeoJSON(
      body.geojson,
      body.source,
      body.countryCode,
      body.cityId
    );
  }

  @Get('nature-poi/nearby')
  @ApiOperation({
    summary: '查找附近的自然 POI',
    description: '根据中心点和半径查找附近的自然 POI（火山、冰川、瀑布等）',
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true })
  @ApiQuery({ name: 'radius', description: '搜索半径（米）', example: 5000, type: Number, required: false })
  @ApiQuery({
    name: 'subCategory',
    description: '子类别过滤（可选）',
    example: 'volcano',
    required: false,
  })
  @ApiResponse({ status: 200, description: '成功返回自然 POI 列表' })
  async getNearbyNaturePois(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
    @Query('subCategory') subCategory?: string,
  ) {
    const radiusMeters = radius ? parseFloat(radius) : 5000;
    return this.naturePoiService.findNaturePoisByArea(
      { lat, lng },
      radiusMeters,
      subCategory
    );
  }

  @Get('nature-poi/category/:subCategory')
  @ApiOperation({
    summary: '按类别查找自然 POI',
    description: '根据子类别查找自然 POI（如 volcano, glacier, waterfall 等）',
  })
  @ApiParam({
    name: 'subCategory',
    description: '子类别',
    example: 'volcano',
    type: String,
  })
  @ApiQuery({
    name: 'countryCode',
    description: '国家代码（可选）',
    example: 'IS',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: '返回数量限制',
    example: 100,
    type: Number,
    required: false,
  })
  @ApiResponse({ status: 200, description: '成功返回自然 POI 列表' })
  async getNaturePoisByCategory(
    @Param('subCategory') subCategory: string,
    @Query('countryCode') countryCode?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.naturePoiService.findNaturePoisByCategory(
      subCategory,
      countryCode,
      limitNum
    );
  }

  @Post('nature-poi/map-to-activity')
  @ApiOperation({
    summary: '将自然 POI 映射为活动时间片',
    description: '将自然 POI 转换为 TimeSlotActivity 格式，用于行程生成',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        poi: {
          type: 'object',
          description: '自然 POI 对象',
        },
        options: {
          type: 'object',
          properties: {
            time: { type: 'string', example: '09:30' },
            template: { type: 'string', enum: ['photoStop', 'shortWalk', 'halfDayHike'] },
            language: { type: 'string', enum: ['zh-CN', 'en'] },
          },
        },
      },
      required: ['poi'],
    },
  })
  @ApiResponse({ status: 200, description: '成功返回活动时间片' })
  async mapNaturePoiToActivity(
    @Body()
    body: {
      poi: any;
      options?: {
        time?: string;
        template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
        language?: 'zh-CN' | 'en';
      };
    }
  ) {
    return this.naturePoiMapperService.mapNaturePoiToActivitySlot(
      body.poi,
      body.options
    );
  }

  @Post('nature-poi/generate-nara-hints')
  @ApiOperation({
    summary: '为自然 POI 生成 NARA 提示信息',
    description:
      '为自然 POI 生成 LLM 提示信息，包括叙事种子、行动提示、反思提示和锚点提示。\n\n' +
      '这些提示信息可以用于：\n' +
      '- 生成行程描述\n' +
      '- 创建叙事性内容\n' +
      '- 提供深度体验建议',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        poi: {
          type: 'object',
          description: '自然 POI 对象',
        },
      },
      required: ['poi'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回 NARA 提示信息',
    schema: {
      type: 'object',
      properties: {
        narrativeSeed: { type: 'string' },
        actionHint: { type: 'string' },
        reflectionHint: { type: 'string' },
        anchorHint: { type: 'string' },
      },
    },
  })
  async generateNaraHint(@Body() body: { poi: any }) {
    return this.naraHintService.generateNaraHint(body.poi);
  }

  @Post('nature-poi/batch-map-to-activities')
  @ApiOperation({
    summary: '批量将自然 POI 映射为活动时间片',
    description: '批量将多个自然 POI 转换为活动时间片，用于行程生成',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pois: {
          type: 'array',
          items: { type: 'object' },
          description: '自然 POI 对象数组',
        },
        options: {
          type: 'object',
          properties: {
            time: { type: 'string', example: '09:30' },
            template: { type: 'string', enum: ['photoStop', 'shortWalk', 'halfDayHike'] },
            language: { type: 'string', enum: ['zh-CN', 'en'] },
          },
        },
      },
      required: ['pois'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回活动时间片数组',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string' },
          title: { type: 'string' },
          activity: { type: 'string' },
          type: { type: 'string' },
          durationMinutes: { type: 'number' },
          coordinates: { type: 'object' },
          notes: { type: 'string' },
          details: { type: 'object' },
        },
      },
    },
  })
  async batchMapNaturePoisToActivities(
    @Body()
    body: {
      pois: any[];
      options?: {
        time?: string;
        template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
        language?: 'zh-CN' | 'en';
      };
    }
  ) {
    return this.naturePoiMapperService.mapMultiplePoisToActivities(
      body.pois,
      body.options
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取地点详情',
    description: '根据地点 ID 获取完整的地点信息，包括元数据、物理元数据、营业状态等。用于时间轴、地点详情页、加入行程前的确认弹窗。',
  })
  @ApiParam({ name: 'id', description: '地点 ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: '成功返回地点详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  async getPlaceById(@Param('id', ParseIntPipe) id: number) {
    const place = await this.placesService.findOne(id);
    if (!place) {
      return errorResponse(ErrorCode.NOT_FOUND, `地点 ID ${id} 不存在`);
    }
    return successResponse(place);
  }

  @Post('batch')
  @ApiOperation({
    summary: '批量获取地点详情',
    description: '根据地点 ID 列表批量获取地点详情，避免前端 N 次请求。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'number' },
          description: '地点 ID 列表',
          example: [1, 2, 3],
        },
      },
      required: ['ids'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回地点详情列表',
    type: ApiSuccessResponseDto,
  })
  async getPlacesBatch(@Body() body: { ids: number[] }) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'ids 必须是非空数组');
    }
    const places = await this.placesService.findBatch(body.ids);
    return successResponse(places);
  }

  @Get('search')
  @ApiOperation({
    summary: '关键词搜索地点',
    description: '根据关键词搜索地点，支持中英文名称、地址搜索。支持按类别筛选和距离排序。',
  })
  @ApiQuery({ name: 'q', description: '搜索关键词', example: '东京塔', required: true })
  @ApiQuery({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 35.6762, type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度（可选，用于距离排序）', example: 139.6503, type: Number, required: false })
  @ApiQuery({ name: 'radius', description: '搜索半径（米，可选）', example: 5000, type: Number, required: false })
  @ApiQuery({
    name: 'type',
    description: '地点类型（可选）',
    enum: ['RESTAURANT', 'ATTRACTION', 'SHOPPING', 'HOTEL'],
    required: false,
  })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回地点列表',
    type: ApiSuccessResponseDto,
  })
  async searchPlaces(
    @Query('q') query: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('type') type?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL',
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '搜索关键词不能为空');
    }
    const latNum = lat ? parseFloat(lat) : undefined;
    const lngNum = lng ? parseFloat(lng) : undefined;
    const radiusNum = radius ? parseFloat(radius) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const places = await this.placesService.search(query, latNum, lngNum, radiusNum, type, limitNum);
    return successResponse(places);
  }

  @Get('autocomplete')
  @ApiOperation({
    summary: '地点名称自动补全',
    description: '根据输入关键词返回地点名称建议，用于搜索框下拉建议。',
  })
  @ApiQuery({ name: 'q', description: '搜索关键词', example: '东京', required: true })
  @ApiQuery({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 35.6762, type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度（可选，用于距离排序）', example: 139.6503, type: Number, required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 10）', example: 10, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回地点名称建议列表',
    type: ApiSuccessResponseDto,
  })
  async autocompletePlaces(
    @Query('q') query: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '搜索关键词不能为空');
    }
    const latNum = lat ? parseFloat(lat) : undefined;
    const lngNum = lng ? parseFloat(lng) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const suggestions = await this.placesService.autocomplete(query, latNum, lngNum, limitNum);
    return successResponse(suggestions);
  }

  @Post('metrics/difficulty')
  @ApiOperation({
    summary: '计算路线难度',
    description:
      '计算两点间路线的难度等级，包括距离、爬升、坡度等指标。\n\n' +
      '**功能流程**：\n' +
      '1. 从 Google Maps 或 Mapbox 获取路线\n' +
      '2. 对路线进行等距重采样\n' +
      '3. 获取高程数据（Google Elevation API 或 Mapbox Terrain-RGB）\n' +
      '4. 计算距离、累计爬升、平均坡度\n' +
      '5. 评估难度等级（EASY/MODERATE/HARD/EXTREME）\n' +
      '6. 可选返回 GeoJSON 格式的路线数据\n\n' +
      '**难度评估规则**：\n' +
      '- 优先级1：trailDifficulty（官方评级，直接使用）\n' +
      '- 优先级2：基于距离和爬升计算（S_km = D + E/100）\n' +
      '- 高海拔（≥2000m）修正：×1.3\n' +
      '- 陡坡（≥15%）修正：上调一档\n' +
      '- accessType为VEHICLE/CABLE_CAR：至少EASY\n' +
      '- subCategory为glacier/volcano：至少MODERATE',
  })
  @ApiBody({
    type: RouteDifficultyRequestDto,
    description: '路线难度计算请求参数',
    examples: {
      google: {
        summary: 'Google示例',
        value: {
          provider: 'google',
          origin: '39.9042,116.4074',
          destination: '39.914,116.403',
          profile: 'walking',
          sampleM: 30,
          category: 'ATTRACTION',
          accessType: 'HIKING',
          elevationMeters: 2300,
          includeGeoJson: false,
        },
      },
      mapbox: {
        summary: 'Mapbox示例',
        value: {
          provider: 'mapbox',
          origin: '7.9904,46.5763',
          destination: '7.985,46.577',
          profile: 'walking',
          sampleM: 30,
          category: 'ATTRACTION',
          visitDuration: '半天',
          z: 14,
          workers: 8,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回路线难度评估结果',
  })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 503, description: '服务不可用（API密钥未配置或外部API错误）' })
  async calculateRouteDifficulty(
    @Body() request: RouteDifficultyRequestDto,
  ) {
    return this.routeDifficultyService.calculateDifficulty(request);
  }
}

