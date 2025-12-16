// src/trails/trails.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger';
import { TrailsService } from './trails.service';
import { CreateTrailDto } from './dto/create-trail.dto';
import { UpdateTrailDto } from './dto/update-trail.dto';
import { TrailSupportServicesService } from './services/trail-support-services.service';
import { SmartTrailPlannerService } from './services/smart-trail-planner.service';
import { TrailTrackingService } from './services/trail-tracking.service';
import { RecommendTrailsForPlacesDto } from './dto/trail-recommendation.dto';

@ApiTags('徒步路线')
@Controller('trails')
export class TrailsController {
  constructor(
    private readonly trailsService: TrailsService,
    private readonly supportServicesService: TrailSupportServicesService,
    private readonly smartPlannerService: SmartTrailPlannerService,
    private readonly trackingService: TrailTrackingService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建徒步路线' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 404, description: '关联的Place不存在' })
  create(@Body() createTrailDto: CreateTrailDto) {
    return this.trailsService.create(createTrailDto);
  }

  @Get()
  @ApiOperation({ summary: '查询徒步路线列表' })
  @ApiQuery({ name: 'placeId', required: false, description: '关联的Place ID（起点、终点或途经点）' })
  @ApiQuery({ name: 'difficulty', required: false, description: '难度等级（EXTREME, HARD, MODERATE, EASY）' })
  @ApiQuery({ name: 'minDistance', required: false, description: '最小距离（公里）' })
  @ApiQuery({ name: 'maxDistance', required: false, description: '最大距离（公里）' })
  @ApiQuery({ name: 'source', required: false, description: '数据来源（alltrails, gpx, manual等）' })
  findAll(
    @Query('placeId') placeId?: string,
    @Query('difficulty') difficulty?: string,
    @Query('minDistance') minDistance?: string,
    @Query('maxDistance') maxDistance?: string,
    @Query('source') source?: string,
  ) {
    const filters: any = {};
    
    if (placeId) {
      filters.placeId = parseInt(placeId, 10);
    }
    if (difficulty) {
      filters.difficulty = difficulty;
    }
    if (minDistance) {
      filters.minDistance = parseFloat(minDistance);
    }
    if (maxDistance) {
      filters.maxDistance = parseFloat(maxDistance);
    }
    if (source) {
      filters.source = source;
    }

    return this.trailsService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: '根据ID查询徒步路线' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '路线不存在' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.trailsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新徒步路线' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '路线不存在' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTrailDto: UpdateTrailDto,
  ) {
    return this.trailsService.update(id, updateTrailDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除徒步路线' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '路线不存在' })
  @ApiResponse({ status: 400, description: '路线已被使用，无法删除' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.trailsService.remove(id);
  }

  @Post('recommend-for-places')
  @ApiOperation({ 
    summary: '根据多个景点推荐徒步路线',
    description: '找到能够串联这些景点的Trail，优先推荐小众步道'
  })
  @ApiResponse({ status: 200, description: '推荐成功' })
  recommendForPlaces(@Body() dto: RecommendTrailsForPlacesDto) {
    return this.trailsService.recommendTrailsForPlaces(dto.placeIds, {
      maxDistance: dto.maxDistance,
      preferOffRoad: dto.preferOffRoad,
      maxDifficulty: dto.maxDifficulty,
    });
  }

  @Get(':id/places-along')
  @ApiOperation({ 
    summary: '识别Trail沿途的景点',
    description: '查找轨迹沿途指定半径内的景点、观景台等'
  })
  @ApiQuery({ name: 'radiusKm', required: false, description: '搜索半径（公里），默认3km' })
  findPlacesAlong(
    @Param('id', ParseIntPipe) id: number,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return this.trailsService.findPlacesAlongTrail(id, radiusKm ? parseFloat(radiusKm) : 3);
  }

  @Get(':id/split-segments')
  @ApiOperation({ 
    summary: '拆分长徒步路线为多个分段',
    description: '将长路线拆分成适合单日游玩的分段行程'
  })
  @ApiQuery({ name: 'maxSegmentLengthKm', required: false, description: '每段最大长度（公里）' })
  splitIntoSegments(
    @Param('id', ParseIntPipe) id: number,
    @Query('maxSegmentLengthKm') maxSegmentLengthKm?: string,
  ) {
    return this.trailsService.splitTrailIntoSegments(
      id,
      maxSegmentLengthKm ? parseFloat(maxSegmentLengthKm) : undefined
    );
  }

  @Get(':id/support-services')
  @ApiOperation({ 
    summary: '推荐徒步路线配套服务',
    description: '根据路线难度和特点推荐装备、保险、补给点、应急服务等'
  })
  @ApiResponse({ status: 200, description: '推荐成功' })
  getSupportServices(@Param('id', ParseIntPipe) id: number) {
    return this.supportServicesService.recommendSupportServices(id);
  }

  @Post(':id/check-suitability')
  @ApiOperation({ 
    summary: '检查Trail是否适合用户的体力配置',
    description: '根据用户的体力配置（PacingConfig）检查Trail是否适合'
  })
  @ApiResponse({ status: 200, description: '检查成功' })
  async checkSuitability(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      max_daily_hp: number;
      walk_speed_factor: number;
      terrain_filter?: string;
    }
  ) {
    return this.trailsService.checkTrailSuitability(id, body);
  }

  @Post('smart-plan')
  @ApiOperation({ 
    summary: '智能路线规划',
    description: '根据用户体力和偏好，自动规划最优的景点+轨迹组合。系统会自动评估每个Trail的适合性，根据体力限制自动拆分到多天，优先推荐匹配度高且适合用户体力的路线。'
  })
  @ApiBody({
    description: '智能路线规划请求',
    schema: {
      type: 'object',
      required: ['placeIds', 'pacingConfig'],
      properties: {
        placeIds: {
          type: 'array',
          items: { type: 'number' },
          description: '目标景点ID列表',
          example: [1, 2, 3],
        },
        pacingConfig: {
          type: 'object',
          required: ['max_daily_hp', 'walk_speed_factor'],
          properties: {
            max_daily_hp: { type: 'number', description: '每日最大HP上限', example: 100 },
            walk_speed_factor: { type: 'number', description: '步行速度系数（1.0=标准）', example: 1.0 },
            terrain_filter: { type: 'string', description: '地形限制', example: 'ALL' },
          },
        },
        preferences: {
          type: 'object',
          properties: {
            maxTotalDistanceKm: { type: 'number', description: '最大总距离（公里）', example: 30 },
            maxSegmentDistanceKm: { type: 'number', description: '最大单段距离（公里）', example: 15 },
            preferredDifficulty: { type: 'string', description: '优先难度等级', example: 'MODERATE' },
            preferOffRoad: { type: 'boolean', description: '是否优先非公路步道', example: true },
            allowSplit: { type: 'boolean', description: '是否允许拆分长路线', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '规划成功，返回推荐的Trail组合、总体评估和建议的行程安排' })
  async smartPlan(@Body() body: {
    placeIds: number[];
    pacingConfig: {
      max_daily_hp: number;
      walk_speed_factor: number;
      terrain_filter?: string;
    };
    preferences?: {
      maxTotalDistanceKm?: number;
      maxSegmentDistanceKm?: number;
      preferredDifficulty?: string;
      preferOffRoad?: boolean;
      allowSplit?: boolean;
    };
  }) {
    return this.smartPlannerService.planSmartRoute(body as any);
  }

  @Post('tracking/start')
  @ApiOperation({ 
    summary: '开始实时轨迹追踪',
    description: '开始追踪用户位置，与计划轨迹对比。返回sessionId用于后续添加追踪点和结束追踪。'
  })
  @ApiBody({
    description: '开始追踪请求',
    schema: {
      type: 'object',
      required: ['trailId'],
      properties: {
        trailId: { type: 'number', description: 'Trail ID', example: 1 },
        itineraryItemId: { type: 'string', description: '关联的行程项ID（可选）', example: 'xxx' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '追踪开始，返回sessionId' })
  async startTracking(
    @Body() body: { trailId: number; itineraryItemId?: string }
  ) {
    return this.trackingService.startTracking(body.trailId, body.itineraryItemId);
  }

  @Post('tracking/:sessionId/point')
  @ApiOperation({ 
    summary: '添加追踪点',
    description: '添加当前位置点，返回与计划轨迹的偏差（米）。系统会自动更新统计信息（总距离、爬升、速度等）。'
  })
  @ApiParam({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' })
  @ApiBody({
    description: '追踪点数据',
    schema: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', description: '纬度', example: 27.5 },
        longitude: { type: 'number', description: '经度', example: 114.2 },
        elevation: { type: 'number', description: '海拔（米，可选）', example: 1200 },
        accuracy: { type: 'number', description: '精度（米，可选）', example: 10 },
        speed: { type: 'number', description: '速度（米/秒，可选）', example: 1.2 },
      },
    },
  })
  @ApiResponse({ status: 200, description: '添加成功，返回偏差距离（米）' })
  async addTrackingPoint(
    @Param('sessionId') sessionId: string,
    @Body() point: {
      latitude: number;
      longitude: number;
      elevation?: number;
      accuracy?: number;
      speed?: number;
    }
  ) {
    return this.trackingService.addTrackingPoint(sessionId, {
      timestamp: new Date().toISOString(),
      ...point,
    });
  }

  @Post('tracking/:sessionId/stop')
  @ApiOperation({ 
    summary: '结束追踪',
    description: '结束追踪会话，返回完整统计信息（总距离、爬升、平均速度、最大速度、持续时间等）'
  })
  @ApiParam({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' })
  @ApiResponse({ status: 200, description: '追踪结束，返回完整统计信息' })
  async stopTracking(@Param('sessionId') sessionId: string) {
    return this.trackingService.stopTracking(sessionId);
  }

  @Get('tracking/:sessionId')
  @ApiOperation({ 
    summary: '获取追踪会话',
    description: '获取当前追踪会话的状态和统计信息（包括所有轨迹点、实时统计等）'
  })
  @ApiParam({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '追踪会话不存在' })
  async getTrackingSession(@Param('sessionId') sessionId: string) {
    const session = this.trackingService.getTrackingSession(sessionId);
    if (!session) {
      throw new NotFoundException('追踪会话不存在');
    }
    return session;
  }
}

