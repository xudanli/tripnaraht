// src/trips/dem/dem.controller.ts

import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiBody, ApiTags, ApiParam } from '@nestjs/swagger';
import { DEMElevationService } from './services/dem-elevation.service';
import { DEMEffortMetadataService, RoutePoint } from './services/dem-effort-metadata.service';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('DEM')
@Controller('dem')
export class DemController {
  constructor(
    private readonly demElevationService: DEMElevationService,
    private readonly demEffortMetadataService: DEMEffortMetadataService,
  ) {}

  @Public()
  @Get('elevation')
  @ApiOperation({
    summary: '获取单个坐标点的海拔',
    description: '根据经纬度获取指定点的海拔高度（米）',
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回海拔数据',
  })
  async getElevation(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
    }

    try {
      const elevation = await this.demElevationService.getElevation(latNum, lngNum);
      return successResponse({
        lat: latNum,
        lng: lngNum,
        elevation: elevation,
        unit: 'meters',
      });
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取海拔数据失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Post('profile')
  @ApiOperation({
    summary: '获取路线海拔剖面',
    description: '根据路线点数组（polyline）生成详细的海拔剖面，包括累计爬升、坡度、体力消耗等信息',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['polyline'],
      properties: {
        polyline: {
          type: 'array',
          description: '路线点数组',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number', example: 64.1466 },
              lng: { type: 'number', example: -21.9426 },
            },
          },
        },
        samples: {
          type: 'number',
          description: '采样间隔（米），默认 100',
          example: 100,
        },
        activityType: {
          type: 'string',
          description: '活动类型（walking/driving/cycling），默认 walking',
          example: 'walking',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回海拔剖面数据',
  })
  async getProfile(@Body() body: {
    polyline: Array<{ lat: number; lng: number }>;
    samples?: number;
    activityType?: 'walking' | 'driving' | 'cycling';
  }) {
    try {
      if (!body.polyline || body.polyline.length < 2) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'polyline 至少需要 2 个点');
      }

      const samplingInterval = body.samples || 100;
      const activityType = body.activityType || 'walking';

      // 转换为 RoutePoint 格式
      const routePoints: RoutePoint[] = body.polyline.map((p) => ({
        lat: p.lat,
        lng: p.lng,
      }));

      // 计算体力消耗元数据（包含海拔剖面）
      const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
        activityType,
        samplingInterval,
        includeElevationProfile: true,
      });

      // 提取海拔剖面并计算累计爬升
      // 注意：elevationProfile 只包含段之间的点，需要添加起点
      let cumulativeAscent = 0;
      const elevationProfile: Array<{
        distance: number;
        lat: number;
        lng: number;
        elevation: number;
        slope: number;
        cumulativeAscent: number;
      }> = [];

      // 添加起点（距离为0）
      if (routePoints.length > 0) {
        const startElevation = await this.demElevationService.getElevation(
          routePoints[0].lat,
          routePoints[0].lng
        ) || 0;
        elevationProfile.push({
          distance: 0,
          lat: routePoints[0].lat,
          lng: routePoints[0].lng,
          elevation: startElevation,
          slope: 0,
          cumulativeAscent: 0,
        });
      }

      // 添加剖面点
      if (effortMetadata.elevationProfile) {
        for (let i = 0; i < effortMetadata.elevationProfile.length; i++) {
          const point = effortMetadata.elevationProfile[i];
          const prevElevation = i === 0 
            ? elevationProfile[0].elevation 
            : effortMetadata.elevationProfile[i - 1].elevation;
          const elevationDiff = point.elevation - prevElevation;
          if (elevationDiff > 0) {
            cumulativeAscent += elevationDiff;
          }
          
          // 找到对应的路线点（基于距离估算）
          const pointIndex = Math.min(
            Math.floor((point.distance / (effortMetadata.totalDistance || 1)) * routePoints.length),
            routePoints.length - 1
          );
          
          elevationProfile.push({
            distance: point.distance,
            lat: routePoints[pointIndex].lat,
            lng: routePoints[pointIndex].lng,
            elevation: point.elevation,
            slope: point.slope,
            cumulativeAscent,
          });
        }
      }

      // 计算最大坡度
      const maxSlope = Math.max(...elevationProfile.map(p => Math.abs(p.slope)), 0);

      // 计算疲劳指数（基于累计爬升和距离的简化公式）
      const totalDistance = effortMetadata.totalDistance || 0;
      const totalAscent = effortMetadata.totalAscent || 0;
      const fatigueIndex = Math.min(100, (totalAscent / 1000) * 10 + (totalDistance / 1000) * 2);

      return successResponse({
        elevationProfile,
        cumulativeAscent: totalAscent,
        totalDescent: effortMetadata.totalDescent || 0,
        maxSlope,
        minSlope: Math.min(...elevationProfile.map(p => p.slope), 0),
        maxElevation: elevationProfile.length > 0 ? Math.max(...elevationProfile.map(p => p.elevation)) : 0,
        minElevation: elevationProfile.length > 0 ? Math.min(...elevationProfile.map(p => p.elevation)) : 0,
        totalDistance,
        fatigueIndex,
        difficulty: effortMetadata.difficulty,
        effortScore: effortMetadata.effortScore,
      });
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取海拔剖面失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Get('trip/:tripId/terrain')
  @ApiOperation({
    summary: '获取行程的地形数据',
    description: '根据行程 ID 获取行程的地形数据（海拔剖面、累计爬升等）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'samples', description: '采样间隔（米）', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回地形数据',
  })
  async getTripTerrain(
    @Param('tripId') tripId: string,
    @Query('samples') samples?: string,
  ) {
    try {
      // TODO: 从行程中提取路线点，然后生成地形数据
      // 目前返回空数据，提示前端需要提供 polyline
      return successResponse({
        message: '请使用 POST /api/dem/profile 接口，提供 polyline 数据',
        tripId,
      });
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取行程地形数据失败: ${error.message}`,
      );
    }
  }
}
