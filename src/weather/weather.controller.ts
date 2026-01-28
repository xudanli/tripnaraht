// src/weather/weather.controller.ts

import { Controller, Get, Query, BadRequestException, Optional } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { WeatherQuery, WeatherData } from '../data-contracts/interfaces/weather.interface';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { HybridCacheService } from '../rag/services/hybrid-cache.service';

@ApiTags('Weather')
@Controller('weather')
export class WeatherController {
  constructor(
    private readonly dataSourceRouter: DataSourceRouterService,
    @Optional() private readonly cacheService?: HybridCacheService,
  ) {}

  @Public()
  @Get('current')
  @ApiOperation({
    summary: '获取当前天气',
    description: '根据经纬度获取当前天气数据。系统会自动选择合适的数据源适配器（冰岛使用 apis.is，其他国家使用 WeatherAPI.com 或 OpenWeather）。',
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true })
  @ApiQuery({ name: 'includeWindDetails', description: '是否包含详细风速信息（冰岛特定）', example: false, type: Boolean, required: false })
  @ApiQuery({ name: 'includeAuroraInfo', description: '是否包含极光信息（冰岛特定）', example: false, type: Boolean, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回天气数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            temperature: { type: 'number', example: 5.6 },
            condition: { type: 'string', example: 'cloudy' },
            windSpeed: { type: 'number', example: 8 },
            windDirection: { type: 'number', example: 22.5 },
            humidity: { type: 'number', example: 58 },
            visibility: { type: 'number', example: 10000 },
            alerts: { type: 'array' },
            lastUpdated: { type: 'string', example: '2026-01-28T12:00:00Z' },
            source: { type: 'string', example: 'apis.is' },
            metadata: { type: 'object' },
          },
        },
      },
    },
  })
  async getCurrentWeather(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('includeWindDetails') includeWindDetails?: string,
    @Query('includeAuroraInfo') includeAuroraInfo?: string,
  ) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
    }

    if (latNum < -90 || latNum > 90) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '纬度必须在 -90 到 90 之间');
    }

    if (lngNum < -180 || lngNum > 180) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '经度必须在 -180 到 180 之间');
    }

    try {
      // 构建缓存键（基于坐标和参数）
      const cacheKey = `weather:${latNum.toFixed(4)},${lngNum.toFixed(4)}:wind=${includeWindDetails === 'true'}:aurora=${includeAuroraInfo === 'true'}`;
      
      // 检查缓存（TTL: 30分钟，天气数据更新频率较高）
      if (this.cacheService) {
        const cached = await this.cacheService.get<WeatherData>(cacheKey);
        if (cached) {
          return successResponse({
            ...cached,
            metadata: {
              ...cached.metadata,
              cached: true,
            },
          });
        }
      }

      const query: WeatherQuery = {
        lat: latNum,
        lng: lngNum,
        includeWindDetails: includeWindDetails === 'true',
        includeAuroraInfo: includeAuroraInfo === 'true',
      };

      const weatherData = await this.dataSourceRouter.getWeather(query);
      
      // 缓存结果（TTL: 30分钟 = 1800秒）
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, weatherData, 1800).catch(err => {
          // 缓存失败不影响响应
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
}
