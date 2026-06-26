// src/places/places.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Query, ParseFloatPipe, Param, ParseIntPipe, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { NaturePoiService } from './services/nature-poi.service';
import { NaturePoiMapperService } from './services/nature-poi-mapper.service';
import { NaraHintService } from './services/nara-hint.service';
import { RouteDifficultyService } from './services/route-difficulty.service';
import { UnsplashService } from './services/unsplash.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { UpsertPlacePlanningProfileDto } from './dto/upsert-place-planning-profile.dto';
import { HotelRecommendationDto } from './dto/hotel-recommendation.dto';
import { RouteDifficultyRequestDto } from './dto/route-difficulty.dto';
import { GetPlacesAdminQueryDto } from './dto/admin-place.dto';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { BatchPlaceImageRequestDto, BatchPlaceImageResponseDto, CATEGORY_MAP, SavePlaceImageRequestDto, SavePlaceImageResponseDto } from './dto/place-image.dto';
import { BatchPlaceRequestDto } from './dto/batch-place.dto';
import { PlaceCategory } from '@prisma/client';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  private readonly logger = new Logger(PlacesController.name);

  constructor(
    private readonly placesService: PlacesService,
    private readonly hotelRecommendationService: HotelRecommendationService,
    private readonly naturePoiService: NaturePoiService,
    private readonly naturePoiMapperService: NaturePoiMapperService,
    private readonly naraHintService: NaraHintService,
    private readonly routeDifficultyService: RouteDifficultyService,
    private readonly unsplashService: UnsplashService,
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  @Public()
  @Get(':placeId/evidence')
  @ApiOperation({
    summary: '获取地点的关键证据',
    description: '获取地点的关键证据信息（营业时间、封路信息、天气窗口等）',
  })
  @ApiParam({ name: 'placeId', description: '地点ID', type: Number, example: 1 })
  @ApiQuery({ name: 'date', description: '指定日期（YYYY-MM-DD）', required: false, example: '2026-02-05' })
  @ApiQuery({ name: 'includeWeather', description: '是否包含天气信息', required: false, type: Boolean, example: true })
  @ApiQuery({ name: 'includeTraffic', description: '是否包含交通信息', required: false, type: Boolean, example: true })
  @ApiResponse({
    status: 200,
    description: '成功返回关键证据',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  async getEvidence(
    @Param('placeId', ParseIntPipe) placeId: number,
    @Query('date') date?: string,
    @Query('includeWeather') includeWeather?: string,
    @Query('includeTraffic') includeTraffic?: string,
  ) {
    try {
      const place = await this.placesService.findOne(placeId);
      if (!place) {
        return errorResponse(ErrorCode.NOT_FOUND, `地点 ID ${placeId} 不存在`);
      }

      const metadata = (place.metadata as any) || {};
      const shouldIncludeWeather = includeWeather !== 'false';
      const shouldIncludeTraffic = includeTraffic !== 'false';
      const targetDate = date || new Date().toISOString().split('T')[0];

      // 构建营业时间
      let businessHours: any = undefined;
      if (metadata.openingHours || metadata.opening_hours) {
        const timezone = metadata.timezone || 'Asia/Tokyo';
        const todayHours = OpeningHoursUtil.getTodayHours(metadata, timezone);
        
        businessHours = {
          open: todayHours !== 'Closed' ? todayHours.split('-')[0]?.trim() : undefined,
          close: todayHours !== 'Closed' ? todayHours.split('-')[1]?.trim() : undefined,
          timezone: timezone,
          exceptions: [], // TODO: 可以从metadata中提取例外情况
        };
      }

      // 构建封路信息
      let roadClosure: any = { hasClosure: false };
      if (shouldIncludeTraffic && (metadata.roadStatus || metadata.roadClosure)) {
        const roadStatus = metadata.roadStatus || {};
        roadClosure = {
          hasClosure: metadata.roadClosure === true || roadStatus.closed === true,
          closures: roadStatus.closures || [],
        };
      }

      // 构建天气窗口
      let weatherWindow: any = undefined;
      if (shouldIncludeWeather && (metadata.weatherInfo || metadata.weather)) {
        const weatherInfo = metadata.weatherInfo || metadata.weather || {};
        weatherWindow = {
          date: targetDate,
          condition: weatherInfo.condition || weatherInfo.weather || '未知',
          description: weatherInfo.description || `${weatherInfo.condition || '未知'}，${weatherInfo.temperature ? `温度${weatherInfo.temperature}°C` : ''}`,
          temperature: {
            min: weatherInfo.tempMin || weatherInfo.temperature_min || undefined,
            max: weatherInfo.tempMax || weatherInfo.temperature_max || weatherInfo.temperature || undefined,
            unit: 'celsius' as const,
          },
          precipitation: weatherInfo.precipitation ? {
            probability: weatherInfo.precipitation.probability || weatherInfo.precipitation_probability || undefined,
            amount: weatherInfo.precipitation.amount || weatherInfo.precipitation_amount || undefined,
          } : undefined,
          wind: weatherInfo.wind ? {
            speed: weatherInfo.wind.speed || weatherInfo.wind_speed || undefined,
            direction: weatherInfo.wind.direction || weatherInfo.wind_direction || undefined,
          } : undefined,
          suitableForOutdoor: weatherInfo.suitableForOutdoor !== false, // 默认true
        };
      }

      // 构建其他信息
      const otherInfo: any = {};
      if (metadata.crowdLevel) {
        otherInfo.crowdLevel = metadata.crowdLevel;
      }
      if (metadata.specialEvents) {
        otherInfo.specialEvents = metadata.specialEvents;
      }

      return successResponse({
        placeId: place.id,
        placeName: place.nameCN || place.nameEN || '未知地点',
        evidence: {
          businessHours,
          roadClosure,
          weatherWindow,
          otherInfo: Object.keys(otherInfo).length > 0 ? otherInfo : undefined,
        },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Put(':id/planning-profile')
  @ApiOperation({
    summary: '更新 POI 规划画像',
    description: '把用于行程规划选点的结构化标签写入 Place.metadata.planningProfile。',
  })
  @ApiParam({ name: 'id', description: '地点ID', type: Number })
  @ApiBody({ type: UpsertPlacePlanningProfileDto })
  async upsertPlanningProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertPlacePlanningProfileDto,
  ) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) {
      return errorResponse(ErrorCode.NOT_FOUND, `地点 ID ${id} 不存在`);
    }

    const metadata = ((place.metadata as Record<string, any>) || {}) as Record<string, any>;
    const currentProfile = ((metadata.planningProfile as Record<string, any>) || {}) as Record<string, any>;
    const { extra, ...profileFields } = body;
    const planningProfile = {
      ...currentProfile,
      ...profileFields,
      ...(extra || {}),
      updatedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.place.update({
      where: { id },
      data: {
        metadata: {
          ...metadata,
          planningProfile,
        } as any,
        updatedAt: new Date(),
      },
    });

    return successResponse({
      placeId: updated.id,
      planningProfile: (updated.metadata as any)?.planningProfile,
    });
  }

  @Public()
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
    enum: PlaceCategory,
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
    @Query('type') type?: PlaceCategory,
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

  @Public()
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

  /**
   * @deprecated 请使用 POST /places/admin 接口
   * 此接口与 /admin 功能完全重复，将在下个版本删除
   */
  @Post()
  @ApiOperation({ 
    summary: '[Deprecated] 创建地点',
    description: '⚠️ 已废弃，请使用 POST /places/admin。创建新的地点记录，包括地理位置（PostGIS）和元数据（JSONB）'
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

  @Public()
  @Post('admin')
  @ApiOperation({
    summary: '创建地点（管理接口）',
    description: '创建新的地点记录，包括地理位置（PostGIS）和元数据（JSONB）。管理接口，无需认证。',
  })
  @ApiBody({ type: CreatePlaceDto })
  @ApiResponse({
    status: 200,
    description: '地点创建成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async createPlaceAdmin(@Body() createPlaceDto: CreatePlaceDto) {
    try {
      const place = await this.placesService.createPlace(createPlaceDto);
      return successResponse(place);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      // 处理 Prisma 唯一约束错误
      if (error?.code === 'P2002') {
        const field = error.meta?.target?.[0] || '字段';
        const message = field === 'googlePlaceId' 
          ? `Google Place ID 已存在: ${createPlaceDto.googlePlaceId}`
          : `唯一约束冲突: ${field} 已存在`;
        return errorResponse(ErrorCode.VALIDATION_ERROR, message);
      }
      this.logger.error(`创建地点失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
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

  // ========== 以下 5 个数据导入接口已删除（2026-02-03）==========
  // 删除原因：管理/数据导入接口，普通用户不应访问，且应通过脚本或后台管理系统执行
  // - POST /attractions/:id/enrich - 高德数据增强
  // - POST /attractions/batch-enrich - 批量高德数据增强
  // - GET /overpass/:countryCode - Google Places 数据获取
  // - POST /overpass/iceland/import - 冰岛数据导入
  // - POST /nature-poi/import - 自然 POI 导入
  // 相关服务方法仍可通过 PlacesService 和 NaturePoiService 调用
  // ================================================================

  @Public()
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

  /**
   * @deprecated 请使用 POST /places/admin/batch 接口
   * 此接口与 /admin/batch 功能完全重复，将在下个版本删除
   */
  @Post('batch')
  @ApiOperation({
    summary: '[Deprecated] 批量获取地点详情',
    description: '⚠️ 已废弃，请使用 POST /places/admin/batch。根据地点 ID 列表批量获取地点详情，避免前端 N 次请求。',
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

  @Public()
  @Get('search/semantic')
  @ApiOperation({
    summary: '语义地点搜索',
    description:
      '使用向量搜索理解自然语言查询，找到语义相关但不含关键词的地点。\n\n' +
      '**功能特点：**\n' +
      '- 支持自然语言查询（如"冰岛的瀑布"、"适合拍照的景点"）\n' +
      '- 混合搜索：向量搜索（语义） + 关键词搜索（精确匹配）\n' +
      '- 显示推荐原因\n' +
      '- 支持按国家、类别筛选和距离排序',
  })
  @ApiQuery({ name: 'q', description: '自然语言查询', example: '瀑布', required: true })
  @ApiQuery({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false })
  @ApiQuery({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false })
  @ApiQuery({ name: 'radius', description: '搜索半径（米，可选）', example: 5000, type: Number, required: false })
  @ApiQuery({
    name: 'type',
    description: '地点类型（可选）',
    enum: PlaceCategory,
    required: false,
  })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回语义搜索结果',
    type: ApiSuccessResponseDto,
  })
  async semanticSearch(
    @Query('q') query: string,
    @Query('countryCode') countryCode?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('type') type?: PlaceCategory,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '搜索查询不能为空');
    }

    try {
      const latNum = lat ? parseFloat(lat) : undefined;
      const lngNum = lng ? parseFloat(lng) : undefined;
      const radiusNum = radius ? parseFloat(radius) : undefined;
      const limitNum = limit ? parseInt(limit, 10) : 20;

      const results = await this.placesService.semanticSearch(
        query,
        latNum,
        lngNum,
        radiusNum,
        type,
        limitNum,
        countryCode
      );

      return successResponse({
        results,
        total: results.length,
      });
    } catch (error: any) {
      this.logger.error(`语义搜索失败: ${error.message}`);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `语义搜索失败: ${error.message}`);
    }
  }

  @Public()
  @Post('search/batch')
  @ApiOperation({
    summary: '批量自然语言搜索POI',
    description:
      '支持多个自然语言查询的批量搜索，并行处理所有查询。\n\n' +
      '**功能特点：**\n' +
      '- 支持多个自然语言查询（如["像京都那样的地方", "适合拍照的景点", "安静的咖啡厅"]）\n' +
      '- 并行处理，提高效率\n' +
      '- 每个查询都会调用 embedding API（OpenAI 或 HuggingFace）进行语义理解\n' +
      '- 混合搜索：向量搜索（语义） + 关键词搜索（精确匹配）\n' +
      '- 返回每个查询对应的结果列表\n\n' +
      '**注意：**批量搜索会为每个查询调用一次 embedding API，请注意 API 配额限制。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '自然语言查询数组',
          example: ['像京都那样的地方', '适合拍照的景点', '安静的咖啡厅'],
          minItems: 1,
          maxItems: 20,
        },
        lat: {
          type: 'number',
          description: '纬度（可选，用于距离排序）',
          example: 35.6762,
        },
        lng: {
          type: 'number',
          description: '经度（可选，用于距离排序）',
          example: 139.6503,
        },
        radius: {
          type: 'number',
          description: '搜索半径（米，可选）',
          example: 5000,
        },
        type: {
          type: 'string',
          enum: Object.values(PlaceCategory) as string[],
          description: '地点类型（可选）',
        },
        limit: {
          type: 'number',
          description: '每个查询返回数量限制（默认 20）',
          example: 20,
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['queries'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回批量搜索结果',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string', example: '像京都那样的地方' },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', example: 123 },
                    nameCN: { type: 'string', example: '清水寺' },
                    nameEN: { type: 'string', example: 'Kiyomizu-dera' },
                    address: { type: 'string', example: '京都府京都市' },
                    category: { type: 'string', example: 'ATTRACTION' },
                    matchReasons: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['根据评论提到的\'静谧\'和\'日式庭院\'推荐'],
                    },
                    vectorScore: { type: 'number', example: 0.85 },
                    keywordScore: { type: 'number', example: 0.3 },
                    finalScore: { type: 'number', example: 0.75 },
                    distance: { type: 'number', example: 1200 },
                  },
                },
              },
              total: { type: 'number', example: 15 },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async batchSemanticSearch(
    @Body()
    body: {
      queries: string[];
      lat?: number;
      lng?: number;
      radius?: number;
      type?: PlaceCategory;
      limit?: number;
    },
  ) {
    if (!body.queries || !Array.isArray(body.queries) || body.queries.length === 0) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'queries 必须是非空数组');
    }

    if (body.queries.length > 20) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'queries 数组最多支持 20 个查询');
    }

    try {
      const results = await this.placesService.batchSemanticSearch(
        body.queries,
        body.lat,
        body.lng,
        body.radius,
        body.type,
        body.limit || 20
      );

      return successResponse(results);
    } catch (error: any) {
      this.logger.error(`批量语义搜索失败: ${error.message}`);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `批量语义搜索失败: ${error.message}`);
    }
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary: '关键词搜索地点',
    description: '根据关键词搜索地点，支持中英文名称、地址搜索。支持按类别筛选、国家过滤和距离排序。',
  })
  @ApiQuery({ name: 'q', description: '搜索关键词', example: '瀑布', required: true })
  @ApiQuery({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false })
  @ApiQuery({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false })
  @ApiQuery({ name: 'radius', description: '搜索半径（米，可选）', example: 5000, type: Number, required: false })
  @ApiQuery({
    name: 'type',
    description: '地点类型（可选）',
    enum: PlaceCategory,
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
    @Query('countryCode') countryCode?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('type') type?: PlaceCategory,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '搜索关键词不能为空');
    }
    const latNum = lat ? parseFloat(lat) : undefined;
    const lngNum = lng ? parseFloat(lng) : undefined;
    const radiusNum = radius ? parseFloat(radius) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const places = await this.placesService.search(query, latNum, lngNum, radiusNum, type, limitNum, countryCode);
    return successResponse(places);
  }

  @Public()
  @Get('list')
  @ApiOperation({
    summary: '获取地点列表（支持分页和上下切换）',
    description: '获取地点列表，支持分页、按类别和城市筛选，支持上下切换。',
  })
  @ApiQuery({ name: 'page', description: '页码（从 1 开始）', example: 1, type: Number, required: false })
  @ApiQuery({ name: 'limit', description: '每页数量（默认 20，最大 100）', example: 20, type: Number, required: false })
  @ApiQuery({
    name: 'category',
    description: '地点类型筛选',
    enum: PlaceCategory,
    required: false,
  })
  @ApiQuery({ name: 'cityId', description: '城市ID筛选', example: 1, type: Number, required: false })
  @ApiQuery({
    name: 'orderBy',
    description: '排序字段',
    enum: ['id', 'rating', 'createdAt', 'updatedAt'],
    example: 'id',
    required: false,
  })
  @ApiQuery({
    name: 'orderDirection',
    description: '排序方向',
    enum: ['asc', 'desc'],
    example: 'desc',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回地点列表（包含分页信息）',
    type: ApiSuccessResponseDto,
  })
  async getPlacesList(@Query() query: PlaceListQueryDto) {
    try {
      const result = await this.placesService.getPlacesList({
        page: query.page,
        limit: query.limit,
        category: query.category,
        cityId: query.cityId,
        orderBy: query.orderBy,
        orderDirection: query.orderDirection,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `获取地点列表失败: ${error.message}`);
    }
  }

  @Public()
  @Get('autocomplete')
  @ApiOperation({
    summary: '地点名称自动补全',
    description: '根据输入关键词返回地点名称建议，用于搜索框下拉建议。支持按国家过滤。',
  })
  @ApiQuery({ name: 'q', description: '搜索关键词', example: '瀑布', required: true })
  @ApiQuery({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false })
  @ApiQuery({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 10）', example: 10, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回地点名称建议列表',
    type: ApiSuccessResponseDto,
  })
  async autocompletePlaces(
    @Query('q') query: string,
    @Query('countryCode') countryCode?: string,
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
    const suggestions = await this.placesService.autocomplete(query, latNum, lngNum, limitNum, countryCode);
    return successResponse(suggestions);
  }

  @Public()
  @Get('recommendations/activities')
  @ApiOperation({
    summary: '推荐活动 - 获取指定国家评分4.0以上的地点',
    description: '根据国家代码推荐评分4.0以上的地点，支持按类别筛选。',
  })
  @ApiQuery({ name: 'countryCode', description: '国家代码（ISO 3166-1 alpha-2，如 IS=冰岛，JP=日本，CN=中国）', example: 'IS', type: String, required: true })
  @ApiQuery({ name: 'category', description: '地点类别筛选', enum: PlaceCategory, example: 'ATTRACTION', required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 20，最大 100）', example: 20, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '推荐成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '参数错误',
    type: ApiErrorResponseDto,
  })
  async getRecommendedActivities(
    @Query('countryCode') countryCode: string,
    @Query('category') category?: PlaceCategory,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!countryCode) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '国家代码不能为空');
      }

      const limitNum = limit ? parseInt(limit, 10) : 20;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'limit 参数必须在 1-100 之间');
      }

      const places = await this.placesService.getRecommendedActivities(
        countryCode,
        category,
        limitNum,
      );

      return successResponse(places);
    } catch (error: any) {
      this.logger.error('获取推荐活动失败:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message || '获取推荐活动失败');
    }
  }

  /**
   * @deprecated 功能未实现，请使用 /search/semantic 进行语义搜索
   * 此接口将在下个版本删除
   */
  @Public()
  @Get('recommendations')
  @ApiOperation({
    summary: '[Deprecated] 获取地点推荐（功能未实现）',
    description: '⚠️ 已废弃。功能未实现，请使用 GET /places/search/semantic 进行语义搜索。',
  })
  @ApiQuery({ name: 'tripId', description: '行程 ID', example: '928b30d5-432b-4dbf-8967-2248222438be', required: true })
  @ApiQuery({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '功能未实现（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getRecommendations(
    @Query('tripId') _tripId?: string,
    @Query('limit') _limit?: string,
  ) {
    return errorResponse(
      ErrorCode.UNSUPPORTED_ACTION,
      '地点推荐功能已废弃，请使用 /api/places/search/semantic 进行语义搜索。',
    );
  }

  // ==================== 管理接口 ====================

  @Public()
  @Get('admin')
  @ApiOperation({
    summary: '获取地点列表（管理接口）',
    description: '获取地点列表，支持分页、搜索、按类别和城市筛选。已优化查询性能，支持并行查询。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量（最大100）', example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词（名称、地址）' })
  @ApiQuery({ 
    name: 'category', 
    required: false, 
    enum: PlaceCategory, 
    description: '地点类别',
    example: 'ATTRACTION'
  })
  @ApiQuery({ name: 'cityId', required: false, type: Number, description: '城市ID', example: 1 })
  @ApiQuery({ name: 'countryCode', required: false, type: String, description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' })
  @ApiResponse({
    status: 200,
    description: '成功返回地点列表',
    type: ApiSuccessResponseDto,
  })
  async getPlacesAdmin(@Query() query: GetPlacesAdminQueryDto) {
    try {
      // 限制最大每页数量
      const limit = query.limit && query.limit > 100 ? 100 : query.limit;
      
      const result = await this.placesService.getPlacesAdmin({
        page: query.page,
        limit,
        search: query.search,
        category: query.category,
        cityId: query.cityId,
        countryCode: query.countryCode,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/:id')
  @ApiOperation({
    summary: '获取地点详情（管理接口）',
    description: '根据地点ID获取地点详细信息。',
  })
  @ApiParam({ name: 'id', description: '地点ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: '成功返回地点详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '地点不存在',
    type: ApiErrorResponseDto,
  })
  async getPlaceAdminById(@Param('id', ParseIntPipe) id: number) {
    try {
      const place = await this.placesService.findOne(id);
      if (!place) {
        return errorResponse(ErrorCode.NOT_FOUND, `地点 ID ${id} 不存在`);
      }
      return successResponse(place);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Put('admin/:id')
  @ApiOperation({
    summary: '更新地点（管理接口）',
    description: '更新地点信息，包括名称、地址、坐标、元数据等。无需认证。',
  })
  @ApiParam({ name: 'id', description: '地点ID', type: Number, example: 1 })
  @ApiBody({ type: UpdatePlaceDto })
  @ApiResponse({
    status: 200,
    description: '成功更新地点',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '地点不存在',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async updatePlaceAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePlaceDto: UpdatePlaceDto,
  ) {
    try {
      const place = await this.placesService.updatePlace(id, updatePlaceDto);
      return successResponse(place);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`更新地点失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Delete('admin/:id')
  @ApiOperation({
    summary: '删除地点（管理接口）',
    description: '删除地点记录。注意：如果地点已被行程使用，删除可能会影响相关行程。无需认证。',
  })
  @ApiParam({ name: 'id', description: '地点ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: '成功删除地点',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '地点不存在',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '地点正在使用中，无法删除',
    type: ApiErrorResponseDto,
  })
  async deletePlaceAdmin(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.placesService.deletePlace(id);
      return successResponse({ message: '地点删除成功', id });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`删除地点失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('admin/batch')
  @ApiOperation({
    summary: '批量获取POI详情（管理接口）',
    description: '根据POI ID数组批量获取POI详情，用于在日计划中显示已选POI的完整信息。避免多次单独查询POI详情。',
  })
  @ApiBody({ type: BatchPlaceRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功返回POI详情列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async getPlacesBatchAdmin(@Body() dto: BatchPlaceRequestDto) {
    try {
      const places = await this.placesService.getPlacesByIds(dto.ids);
      return successResponse({ places });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`批量获取POI详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
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

  /**
   * @deprecated 请使用 PUT /places/admin/:id 接口
   * 此接口与 /admin/:id 功能完全重复，将在下个版本删除
   */
  @Put(':id')
  @ApiOperation({
    summary: '[Deprecated] 更新地点',
    description: '⚠️ 已废弃，请使用 PUT /places/admin/:id。更新地点信息，包括名称、地址、坐标、元数据等。',
  })
  @ApiParam({ name: 'id', description: '地点 ID', type: Number, example: 1 })
  @ApiBody({ type: UpdatePlaceDto })
  @ApiResponse({
    status: 200,
    description: '成功更新地点',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  @ApiResponse({ status: 400, description: '输入数据验证失败' })
  async updatePlace(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePlaceDto: UpdatePlaceDto,
  ) {
    try {
      const place = await this.placesService.updatePlace(id, updatePlaceDto);
      return successResponse(place);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  /**
   * @deprecated 请使用 DELETE /places/admin/:id 接口
   * 此接口与 /admin/:id 功能完全重复，将在下个版本删除
   */
  @Delete(':id')
  @ApiOperation({
    summary: '[Deprecated] 删除地点',
    description: '⚠️ 已废弃，请使用 DELETE /places/admin/:id。删除地点记录。',
  })
  @ApiParam({ name: 'id', description: '地点 ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: '成功删除地点',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  @ApiResponse({ status: 400, description: '地点正在使用中，无法删除' })
  async deletePlace(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.placesService.deletePlace(id);
      return successResponse({ message: 'Place deleted successfully' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
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
      '- 高海拔修正（分段线性插值）：\n' +
      '  * 1500m: ×1.00, 2500m: ×1.05, 3000m: ×1.10, 3500m: ×1.20\n' +
      '  * 4000m: ×1.30, 4500m: ×1.45, 5000m: ×1.60, 5500m: ×1.80\n' +
      '  * 6000m: ×2.10, 7000m: ×2.50\n' +
      '- 可选修正项（可叠加，总系数上限3.0）：\n' +
      '  * 缺乏适应惩罚（未在高海拔过夜或最近3天平均睡眠海拔<2500m）：×1.10\n' +
      '  * 超长暴露时间（行程>8h）：×1.05\n' +
      '  * 极寒/风寒（体感温度<-10℃且时间>3h）：×1.05\n' +
      '  * 高背负（>12kg）：×1.05\n' +
      '- 高纬度（|纬度|≥60°）修正：×1.2\n' +
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

  // ==================== 图片服务 ====================

  @Post('images/batch')
  @Public()
  @ApiOperation({
    summary: '批量获取地点图片',
    description: `
批量从 Unsplash 获取地点的经典照片。

**使用说明**：
- 每个地点返回一张最相关的高质量照片
- 优先提供英文名称 (placeNameEn) 以提高匹配度
- 提供 country 和 category 可以更精准定位
- 结果会缓存 24 小时

**Unsplash 归属要求**：
- 使用图片时必须展示 attribution 信息
- 格式："Photo by {photographerName} on Unsplash"
- 链接到 photographerUrl 和 unsplashUrl

**限制**：
- 单次请求最多 20 个地点
- API 速率限制：50 次/小时
    `,
  })
  @ApiBody({
    type: BatchPlaceImageRequestDto,
    examples: {
      japan_trip: {
        summary: '日本行程地点',
        value: {
          places: [
            { placeName: '富士山', placeNameEn: 'Mount Fuji', country: 'Japan', category: 'mountain' },
            { placeName: '浅草寺', placeNameEn: 'Sensoji Temple', country: 'Japan', category: 'temple' },
            { placeName: '东京塔', placeNameEn: 'Tokyo Tower', country: 'Japan', category: 'landmark' },
            { placeName: '清水寺', placeNameEn: 'Kiyomizu-dera Temple', country: 'Japan', category: 'temple' },
          ],
        },
      },
      europe_trip: {
        summary: '欧洲行程地点',
        value: {
          places: [
            { placeName: '埃菲尔铁塔', placeNameEn: 'Eiffel Tower', country: 'France', category: 'landmark' },
            { placeName: '卢浮宫', placeNameEn: 'Louvre Museum', country: 'France', category: 'museum' },
            { placeName: '巴塞罗那圣家堂', placeNameEn: 'Sagrada Familia', country: 'Spain', category: 'landmark' },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回图片数据',
    type: BatchPlaceImageResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 429, description: 'API 速率限制' })
  async getBatchPlaceImages(
    @Body() request: BatchPlaceImageRequestDto,
  ): Promise<BatchPlaceImageResponseDto> {
    this.logger.debug(`[批量图片] 请求 ${request.places.length} 个地点的图片`);
    
    const result = await this.unsplashService.getBatchPlaceImages(
      request.places.map(p => ({
        placeId: p.placeId,
        placeName: p.placeName,
        placeNameEn: p.placeNameEn,
        country: p.country,
        // 映射 category: 支持 Prisma 枚举 (ATTRACTION) 和小写格式 (landmark)
        category: p.category ? (CATEGORY_MAP[p.category] || 'landmark') : undefined,
      })),
    );

    this.logger.debug(
      `[批量图片] 完成: 总计=${result.stats.total}, 成功=${result.stats.found}, ` +
      `缓存=${result.stats.cached}, 失败=${result.stats.failed}, 耗时=${result.processingTimeMs}ms`
    );

    return result;
  }

  @Get('images/cache-stats')
  @Public()
  @ApiOperation({
    summary: '获取图片缓存统计',
    description: '查看当前图片缓存的状态',
  })
  @ApiResponse({
    status: 200,
    description: '缓存统计信息',
  })
  async getImageCacheStats() {
    return successResponse(this.unsplashService.getCacheStats());
  }

  @Post('images/save')
  @Public()
  @ApiOperation({
    summary: '保存 Unsplash 图片到数据库',
    description: `
将 Unsplash 图片保存到指定地点的 metadata.images 中。

**使用场景**：
- 从批量图片接口获取图片后，需要持久化保存到数据库
- 图片会保存到 Place.metadata.images 数组中
- 格式与上传接口保持一致，便于统一管理

**图片格式**：
- url: 使用 regular 尺寸（1080px 宽）作为主 URL
- source: 'unsplash'
- caption: 使用图片的 description 或 altDescription
- attribution: 保存 Unsplash 归属信息（必须展示）

**主图设置**：
- 如果地点没有其他图片，自动设为主图
- 如果已有图片，默认不设为主图（可通过 isPrimary 参数控制）
    `,
  })
  @ApiBody({
    type: SavePlaceImageRequestDto,
    examples: {
      save_image: {
        summary: '保存图片示例',
        value: {
          placeId: 123,
          photo: {
            id: 'abc123',
            width: 4000,
            height: 3000,
            color: '#4A90D9',
            blurHash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
            description: 'Beautiful mountain view',
            altDescription: 'Mount Fuji at sunset',
            urls: {
              raw: 'https://images.unsplash.com/photo-xxx?raw',
              full: 'https://images.unsplash.com/photo-xxx?full',
              regular: 'https://images.unsplash.com/photo-xxx?w=1080',
              small: 'https://images.unsplash.com/photo-xxx?w=400',
              thumb: 'https://images.unsplash.com/photo-xxx?w=200',
            },
            user: {
              name: 'John Doe',
              username: 'johndoe',
              link: 'https://unsplash.com/@johndoe',
            },
            attribution: {
              photographerName: 'John Doe',
              photographerUrl: 'https://unsplash.com/@johndoe',
              unsplashUrl: 'https://unsplash.com/photos/abc123',
            },
          },
          isPrimary: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功保存图片',
    type: SavePlaceImageResponseDto,
  })
  @ApiResponse({ status: 404, description: '地点不存在' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  async savePlaceImage(
    @Body() request: SavePlaceImageRequestDto,
  ): Promise<SavePlaceImageResponseDto> {
    // 检查地点是否存在
    const place = await this.prisma.place.findUnique({
      where: { id: request.placeId },
    });

    if (!place) {
      throw new NotFoundException(`地点不存在: ID ${request.placeId}`);
    }

    // 检查 OSS 是否可用
    if (!this.uploadService.isAvailable()) {
      throw new BadRequestException('OSS 未配置，无法保存图片到 OSS');
    }

    // 获取当前 metadata
    const currentMetadata = (place.metadata as any) || {};
    const existingImages = currentMetadata.images || [];

    // 从 Unsplash 下载图片并上传到 OSS
    this.logger.log(
      `[保存图片] 开始下载并上传图片到 OSS: 地点 ID=${request.placeId}, Unsplash ID=${request.photo.id}`
    );

    let ossResult;
    try {
      // 使用 regular 尺寸（1080px）作为主图
      ossResult = await this.uploadService.uploadImageFromUrl(
        request.photo.urls.regular,
        `places/${request.placeId}`,
        `unsplash-${request.photo.id}.jpg`,
      );
    } catch (error: any) {
      this.logger.error(`[保存图片] OSS 上传失败: ${error.message}`);
      throw new BadRequestException(`图片上传到 OSS 失败: ${error.message}`);
    }

    // 构建图片数据（格式与上传接口保持一致）
    const newImage = {
      url: ossResult.url, // 使用 OSS URL
      key: ossResult.key, // 保存 OSS key，便于后续删除
      caption: request.photo.description || request.photo.altDescription || '',
      source: 'unsplash',
      isPrimary: existingImages.length === 0 || request.isPrimary === true,
      savedAt: new Date().toISOString(),
      // 保存 Unsplash 特有信息
      unsplash: {
        id: request.photo.id,
        width: request.photo.width,
        height: request.photo.height,
        color: request.photo.color,
        blurHash: request.photo.blurHash,
        originalUrl: request.photo.urls.regular, // 保存原始 Unsplash URL（备用）
        urls: request.photo.urls, // 保存所有尺寸的 URL（用于参考）
        attribution: request.photo.attribution, // 必须保存归属信息
        photographer: {
          name: request.photo.user.name,
          username: request.photo.user.username,
          link: request.photo.user.link,
        },
      },
    };

    // 如果设为新的主图，取消其他图片的主图状态
    if (newImage.isPrimary && existingImages.length > 0) {
      existingImages.forEach((img: any) => {
        img.isPrimary = false;
      });
    }

    // 更新 metadata
    const updatedMetadata = {
      ...currentMetadata,
      images: [...existingImages, newImage],
    };

    // 保存到数据库
    await this.prisma.place.update({
      where: { id: request.placeId },
      data: { metadata: updatedMetadata },
    });

    this.logger.log(
      `[保存图片] 完成: 地点 ID=${request.placeId}, OSS Key=${ossResult.key}, 总图片数=${updatedMetadata.images.length}`
    );

    return {
      success: true,
      placeId: request.placeId,
      placeName: place.nameCN,
      savedImage: {
        url: newImage.url,
        caption: newImage.caption,
        source: newImage.source,
        isPrimary: newImage.isPrimary,
        savedAt: newImage.savedAt,
        attribution: request.photo.attribution,
      },
      totalImages: updatedMetadata.images.length,
    };
  }
}
