// src/iceland-info/iceland-info.controller.ts

import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VedurService } from './services/vedur.service';
import { SafetravelService } from './services/safetravel.service';
import { RoadService } from './services/road.service';
import { VedurWeatherQueryDto, VedurWeatherResponseDto } from './dto/vedur-weather.dto';
import { SafetravelQueryDto, SafetravelResponseDto } from './dto/safetravel.dto';
import { RoadConditionsQueryDto, RoadConditionsResponseDto } from './dto/road-conditions.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Optional } from '@nestjs/common';
import { HybridCacheService } from '../rag/services/hybrid-cache.service';

@ApiTags('Iceland Info')
@Controller('iceland-info')
export class IcelandInfoController {
  constructor(
    private readonly vedurService: VedurService,
    private readonly safetravelService: SafetravelService,
    private readonly roadService: RoadService,
    @Optional() private readonly cacheService?: HybridCacheService,
  ) {}

  @Public()
  @Get('weather')
  @ApiOperation({
    summary: '获取冰岛高地天气预报',
    description: '从vedur.is获取冰岛高地区域的天气预报数据。包括当前天气和6天预报。',
  })
  @ApiQuery({
    name: 'region',
    description: '高地区域',
    enum: ['centralhighlands', 'southhighlands', 'northhighlands'],
    required: false,
  })
  @ApiQuery({ name: 'lat', description: '纬度', required: false, type: Number })
  @ApiQuery({ name: 'lng', description: '经度', required: false, type: Number })
  @ApiQuery({ name: 'includeWindDetails', description: '是否包含详细风速信息', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: '成功返回天气数据',
    type: VedurWeatherResponseDto,
  })
  async getWeather(@Query() query: VedurWeatherQueryDto) {
    try {
      // 构建缓存键
      const cacheKey = `iceland-weather:${query.region || 'default'}:${query.lat || ''}:${query.lng || ''}`;
      
      // 检查缓存（TTL: 1小时）
      if (this.cacheService) {
        const cached = await this.cacheService.get<VedurWeatherResponseDto>(cacheKey);
        if (cached) {
          return successResponse({
            ...cached,
            metadata: {
              ...(cached as any).metadata,
              cached: true,
            },
          });
        }
      }

      const weatherData = await this.vedurService.getHighlandWeather(query);
      
      // 缓存结果（TTL: 1小时 = 3600秒）
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, weatherData, 3600).catch(err => {
          console.warn(`天气数据缓存失败: ${err.message}`);
        });
      }
      
      return successResponse(weatherData);
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取天气数据失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Get('safety')
  @ApiOperation({
    summary: '获取冰岛安全信息和旅行条件',
    description: '从safetravel.is获取安全警报和旅行条件信息。',
  })
  @ApiQuery({ name: 'region', description: '区域过滤', required: false })
  @ApiQuery({
    name: 'alertType',
    description: '警报类型过滤',
    enum: ['weather', 'road', 'travel', 'general'],
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回安全信息',
    type: SafetravelResponseDto,
  })
  async getSafetyInfo(@Query() query: SafetravelQueryDto) {
    try {
      // 构建缓存键
      const cacheKey = `iceland-safety:${query.region || 'all'}:${query.alertType || 'all'}`;
      
      // 检查缓存（TTL: 30分钟）
      if (this.cacheService) {
        const cached = await this.cacheService.get<SafetravelResponseDto>(cacheKey);
        if (cached) {
          return successResponse({
            ...cached,
            metadata: {
              ...(cached as any).metadata,
              cached: true,
            },
          });
        }
      }

      const safetyData = await this.safetravelService.getSafetyInfo(query);
      
      // 缓存结果（TTL: 30分钟 = 1800秒）
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, safetyData, 1800).catch(err => {
          console.warn(`安全信息缓存失败: ${err.message}`);
        });
      }
      
      return successResponse(safetyData);
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取安全信息失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Get('road-conditions')
  @ApiOperation({
    summary: '获取F路路况信息',
    description: '从road.is获取F路的路况和开放状态信息。',
  })
  @ApiQuery({
    name: 'fRoads',
    description: 'F路编号过滤（多个用逗号分隔），如: F208,F26,F910',
    required: false,
  })
  @ApiQuery({
    name: 'status',
    description: '状态过滤',
    enum: ['open', 'closed', 'caution', 'impassable'],
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回路况信息',
    type: RoadConditionsResponseDto,
  })
  async getRoadConditions(@Query() query: RoadConditionsQueryDto) {
    try {
      // 构建缓存键
      const cacheKey = `iceland-roads:${query.fRoads || 'all'}:${query.status || 'all'}`;
      
      // 检查缓存（TTL: 15分钟）
      if (this.cacheService) {
        const cached = await this.cacheService.get<RoadConditionsResponseDto>(cacheKey);
        if (cached) {
          return successResponse({
            ...cached,
            metadata: {
              ...(cached as any).metadata,
              cached: true,
            },
          });
        }
      }

      const roadData = await this.roadService.getRoadConditions(query);
      
      // 缓存结果（TTL: 15分钟 = 900秒）
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, roadData, 900).catch(err => {
          console.warn(`路况信息缓存失败: ${err.message}`);
        });
      }
      
      return successResponse(roadData);
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取路况信息失败: ${error.message}`,
      );
    }
  }
}
