// src/iceland-info/iceland-info.controller.ts

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { RoadStatusQuery, ExtendedRoadStatus } from '../data-contracts/interfaces/road-status.interface';
import { WeatherQuery, ExtendedWeatherData } from '../data-contracts/interfaces/weather.interface';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { IcelandFRoadService } from '../data-contracts/services/iceland-froad.service';
import { IcelandComprehensiveService } from '../data-contracts/services/iceland-comprehensive.service';
import { IcelandSafetyAdapter } from '../data-contracts/adapters/iceland-safety.adapter';
import { Optional } from '@nestjs/common';

@ApiTags('Iceland Info')
@Controller('iceland-info')
export class IcelandInfoController {
  constructor(
    private readonly dataSourceRouter: DataSourceRouterService,
    @Optional() private readonly icelandFRoadService?: IcelandFRoadService,
    @Optional() private readonly icelandComprehensive?: IcelandComprehensiveService,
    @Optional() private readonly icelandSafetyAdapter?: IcelandSafetyAdapter,
  ) {}

  @Public()
  @Get('road-conditions')
  @ApiOperation({
    summary: '获取 F-Road 路况信息',
    description: '根据 F-Road 编号列表获取路况状态。此接口使用新的数据契约服务（DataSourceRouterService）。',
  })
  @ApiQuery({ name: 'fRoads', description: 'F-Road 编号列表（多个用逗号分隔）', example: 'F208,F225,F249,F26', type: String, required: false })
  @ApiQuery({ name: 'status', description: '状态过滤（open/closed/caution/impassable）', type: String, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回路况数据',
  })
  async getRoadConditions(
    @Query('fRoads') fRoads?: string,
    @Query('status') status?: string,
  ) {
    try {
      // 如果没有提供 fRoads，返回所有 F-Road 的默认状态
      if (!fRoads) {
        return successResponse({
          fRoads: [],
          lastUpdated: new Date().toISOString(),
          source: 'road.is',
          message: '请提供 fRoads 参数以查询特定 F-Road 的路况',
        });
      }

      const fRoadList = fRoads.split(',').map(f => f.trim().toUpperCase());
      const results: Array<{
        id: string;
        name: string;
        fRoadNumber: string;
        status: string;
        condition?: string;
        isOpen: boolean;
        description?: string;
        lastUpdated: string;
      }> = [];

      // 冰岛中心坐标（用于查询路况）
      const icelandCenterLat = 64.5;
      const icelandCenterLng = -18.5;

      // 使用冰岛综合服务获取路况（如果可用）
      if (this.icelandComprehensive) {
        for (const fRoadNumber of fRoadList) {
          try {
            // 使用冰岛中心坐标查询路况（包含 F-Road 信息）
            const roadStatus = await this.icelandComprehensive.getComprehensiveRoadStatus({
              lat: icelandCenterLat,
              lng: icelandCenterLng,
              includeFRoadInfo: true,
              radius: 200000, // 200km 半径，覆盖整个冰岛
            });

            const fRoadInfo = roadStatus.fRoadInfo;
            if (fRoadInfo && fRoadInfo.roadNumber === fRoadNumber) {
              const roadStatusStr = fRoadInfo.status === 'open' ? 'open' :
                                   fRoadInfo.status === 'closed' ? 'closed' :
                                   fRoadInfo.status === 'restricted' ? 'caution' : 'unknown';

              // 如果提供了 status 过滤，检查是否匹配
              if (status && roadStatusStr !== status.toLowerCase()) {
                continue;
              }

              results.push({
                id: `f${fRoadNumber.toLowerCase()}`,
                name: `F${fRoadNumber.substring(1)}`,
                fRoadNumber: fRoadNumber,
                status: roadStatusStr,
                condition: roadStatus.metadata?.condition as string || (fRoadInfo.isSlippery ? 'wet' : 'dry'),
                isOpen: fRoadInfo.status === 'open',
                description: roadStatus.reason || fRoadInfo.restrictionReason || `${fRoadNumber} 路况正常`,
                lastUpdated: roadStatus.lastUpdated.toISOString(),
              });
            } else {
              // 如果没有匹配的 F-Road 信息，返回默认状态
              const roadStatusStr = 'unknown';
              if (status && roadStatusStr !== status.toLowerCase()) {
                continue;
              }

              results.push({
                id: `f${fRoadNumber.toLowerCase()}`,
                name: `F${fRoadNumber.substring(1)}`,
                fRoadNumber: fRoadNumber,
                status: roadStatusStr,
                condition: 'unknown',
                isOpen: true,
                description: `无法获取 ${fRoadNumber} 的实时路况信息`,
                lastUpdated: new Date().toISOString(),
              });
            }
          } catch (error: any) {
            // 单个 F-Road 查询失败，返回默认状态
            const roadStatusStr = 'unknown';
            if (status && roadStatusStr !== status.toLowerCase()) {
              continue;
            }

            results.push({
              id: `f${fRoadNumber.toLowerCase()}`,
              name: `F${fRoadNumber.substring(1)}`,
              fRoadNumber: fRoadNumber,
              status: roadStatusStr,
              condition: 'unknown',
              isOpen: true,
              description: `查询失败: ${error.message}`,
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      } else {
        // 降级到基础数据源路由器
        for (const fRoadNumber of fRoadList) {
          try {
            const roadQuery: RoadStatusQuery = {
              lat: icelandCenterLat,
              lng: icelandCenterLng,
              includeFRoadInfo: true,
              radius: 200000,
            };

            const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
            const extendedStatus = roadStatus as ExtendedRoadStatus;

            if (extendedStatus.fRoadInfo && extendedStatus.fRoadInfo.roadNumber === fRoadNumber) {
              const fRoadInfo = extendedStatus.fRoadInfo;
              const roadStatusStr = fRoadInfo.status === 'open' ? 'open' :
                                   fRoadInfo.status === 'closed' ? 'closed' :
                                   fRoadInfo.status === 'restricted' ? 'caution' : 'unknown';

              if (status && roadStatusStr !== status.toLowerCase()) {
                continue;
              }

              results.push({
                id: `f${fRoadNumber.toLowerCase()}`,
                name: `F${fRoadNumber.substring(1)}`,
                fRoadNumber: fRoadNumber,
                status: roadStatusStr,
                condition: extendedStatus.metadata?.condition as string || (fRoadInfo.isSlippery ? 'wet' : 'dry'),
                isOpen: fRoadInfo.status === 'open',
                description: extendedStatus.reason || fRoadInfo.restrictionReason || `${fRoadNumber} 路况正常`,
                lastUpdated: extendedStatus.lastUpdated.toISOString(),
              });
            } else {
              const roadStatusStr = 'unknown';
              if (status && roadStatusStr !== status.toLowerCase()) {
                continue;
              }

              results.push({
                id: `f${fRoadNumber.toLowerCase()}`,
                name: `F${fRoadNumber.substring(1)}`,
                fRoadNumber: fRoadNumber,
                status: roadStatusStr,
                condition: 'unknown',
                isOpen: true,
                description: `无法获取 ${fRoadNumber} 的实时路况信息`,
                lastUpdated: new Date().toISOString(),
              });
            }
          } catch (error: any) {
            const roadStatusStr = 'unknown';
            if (status && roadStatusStr !== status.toLowerCase()) {
              continue;
            }

            results.push({
              id: `f${fRoadNumber.toLowerCase()}`,
              name: `F${fRoadNumber.substring(1)}`,
              fRoadNumber: fRoadNumber,
              status: roadStatusStr,
              condition: 'unknown',
              isOpen: true,
              description: `查询失败: ${error.message}`,
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      }

      return successResponse({
        fRoads: results,
        lastUpdated: new Date().toISOString(),
        source: 'road.is',
      });
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取 F-Road 路况数据失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Get('weather')
  @ApiOperation({
    summary: '获取冰岛天气预报',
    description: '获取冰岛高地区域的天气预报数据。此接口使用新的数据契约服务（DataSourceRouterService）。',
  })
  @ApiQuery({ name: 'region', description: '高地区域（centralhighlands/southhighlands/northhighlands）', type: String, required: false })
  @ApiQuery({ name: 'lat', description: '纬度', type: Number, required: false })
  @ApiQuery({ name: 'lng', description: '经度', type: Number, required: false })
  @ApiQuery({ name: 'includeWindDetails', description: '是否包含详细风速信息', type: Boolean, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回天气数据',
  })
  async getWeather(
    @Query('region') region?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('includeWindDetails') includeWindDetails?: string,
  ) {
    try {
      // 如果没有提供坐标，使用冰岛中心坐标
      const latNum = lat ? parseFloat(lat) : 64.5;
      const lngNum = lng ? parseFloat(lng) : -18.5;

      if (isNaN(latNum) || isNaN(lngNum)) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
      }

      // 使用数据契约服务获取天气数据
      const weatherQuery: WeatherQuery = {
        lat: latNum,
        lng: lngNum,
        includeWindDetails: includeWindDetails === 'true',
      };

      let weatherData: ExtendedWeatherData;
      if (this.icelandComprehensive) {
        weatherData = await this.icelandComprehensive.getComprehensiveWeather(weatherQuery);
      } else {
        weatherData = await this.dataSourceRouter.getWeather(weatherQuery) as ExtendedWeatherData;
      }

      return successResponse({
        station: {
          id: region ? `highland-${region}` : 'iceland-center',
          name: region || 'Iceland Center',
          lat: latNum,
          lng: lngNum,
        },
        current: {
          datetime: weatherData.lastUpdated.toISOString(),
          temperature: weatherData.temperature,
          windSpeed: weatherData.windSpeed,
          windDirection: weatherData.windDirection,
          windSpeedKmh: weatherData.windSpeed ? weatherData.windSpeed * 3.6 : undefined,
          precipitation: weatherData.metadata?.precipitation as number | undefined,
          condition: weatherData.condition,
          visibility: weatherData.visibility,
        },
        forecast: [], // 预报数据需要额外的 API 调用
        lastUpdated: weatherData.lastUpdated.toISOString(),
        source: weatherData.source,
      });
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
    summary: '获取安全信息和旅行条件',
    description: '获取冰岛安全警报和旅行条件信息。此接口使用新的数据契约服务。',
  })
  @ApiQuery({ name: 'region', description: '区域过滤（highlands/central-highlands）', type: String, required: false })
  @ApiQuery({ name: 'alertType', description: '警报类型过滤（weather/road/travel/general）', type: String, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回安全信息',
  })
  async getSafety(
    @Query('region') region?: string,
    @Query('alertType') alertType?: string,
  ) {
    try {
      // 使用冰岛安全适配器获取安全信息
      if (this.icelandSafetyAdapter) {
        const alerts = await this.icelandSafetyAdapter.getSafetyAlerts();
        const criticalAlerts = await this.icelandSafetyAdapter.getCriticalSafetyAlerts();

        // 过滤警报
        let filteredAlerts = alerts;
        if (region) {
          filteredAlerts = filteredAlerts.filter(alert => 
            alert.affectedAreas?.some(area => 
              area.name?.toLowerCase().includes(region.toLowerCase())
            )
          );
        }
        if (alertType) {
          filteredAlerts = filteredAlerts.filter(alert => 
            alert.type?.toLowerCase() === alertType.toLowerCase()
          );
        }

        return successResponse({
          alerts: filteredAlerts.map(alert => ({
            id: alert.id,
            title: alert.title,
            description: alert.description,
            type: alert.type,
            severity: alert.severity,
            effectiveTime: alert.effectiveTime?.toISOString(),
            expiryTime: alert.expiryTime?.toISOString(),
            regions: alert.affectedAreas?.map(area => area.name) || [],
            fRoads: alert.metadata?.fRoads || [],
          })),
          travelConditions: [], // 旅行条件需要额外的数据源
          lastUpdated: new Date().toISOString(),
        });
      } else {
        // 如果没有安全适配器，返回空结果
        return successResponse({
          alerts: [],
          travelConditions: [],
          lastUpdated: new Date().toISOString(),
          message: '安全信息服务暂不可用',
        });
      }
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取安全信息失败: ${error.message}`,
      );
    }
  }
}
