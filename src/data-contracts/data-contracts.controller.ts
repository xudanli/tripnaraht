// src/data-contracts/data-contracts.controller.ts

import { Controller, Get, Query, Optional } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSourceRouterService } from './services/data-source-router.service';
import { RoadStatusQuery, ExtendedRoadStatus } from './interfaces/road-status.interface';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { IcelandFRoadService } from './services/iceland-froad.service';

@ApiTags('Data Contracts')
@Controller('data-contracts')
export class DataContractsController {
  constructor(
    private readonly dataSourceRouter: DataSourceRouterService,
    @Optional() private readonly icelandFRoadService?: IcelandFRoadService,
  ) {}

  @Public()
  @Get('road-status')
  @ApiOperation({
    summary: '获取路况状态',
    description: '根据经纬度获取路况状态。系统会自动选择合适的数据源适配器（冰岛使用 road.is，其他国家使用默认适配器）。',
  })
  @ApiQuery({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true })
  @ApiQuery({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true })
  @ApiQuery({ name: 'radius', description: '查询半径（米）', example: 50000, type: Number, required: false })
  @ApiQuery({ name: 'includeFRoadInfo', description: '是否包含 F-Road 信息（冰岛特定）', example: false, type: Boolean, required: false })
  @ApiQuery({ name: 'includeRiverCrossing', description: '是否包含河流渡口信息（冰岛特定）', example: false, type: Boolean, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回路况数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            isOpen: { type: 'boolean', example: true },
            riskLevel: { type: 'number', example: 1, description: '风险等级：0=安全, 1=轻微风险, 2=中等风险, 3=高风险' },
            reason: { type: 'string', example: '部分路段湿滑' },
            lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
            source: { type: 'string', example: 'road.is' },
            fRoadInfo: {
              type: 'object',
              description: 'F-Road 信息（仅冰岛，可选）',
              properties: {
                roadNumber: { type: 'string', example: 'F208' },
                status: { type: 'string', example: 'open' },
                requires4WD: { type: 'boolean', example: true },
                condition: { type: 'string', example: 'dry' },
              },
            },
            riverCrossingInfo: {
              type: 'object',
              description: '河流渡口信息（仅冰岛，可选）',
            },
            metadata: { type: 'object' },
          },
        },
      },
    },
  })
  async getRoadStatus(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('includeFRoadInfo') includeFRoadInfo?: string,
    @Query('includeRiverCrossing') includeRiverCrossing?: string,
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
      const query: RoadStatusQuery = {
        lat: latNum,
        lng: lngNum,
        radius: radius ? parseInt(radius, 10) : undefined,
        includeFRoadInfo: includeFRoadInfo === 'true',
        includeRiverCrossing: includeRiverCrossing === 'true',
      };

      const roadStatus = await this.dataSourceRouter.getRoadStatus(query);
      return successResponse(roadStatus);
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        `获取路况数据失败: ${error.message}`,
      );
    }
  }

  @Public()
  @Get('road-status/by-froads')
  @ApiOperation({
    summary: '根据 F-Road 编号获取路况状态（冰岛特定）',
    description: '根据 F-Road 编号列表获取路况状态。这是 `/api/iceland-info/road-conditions` 的新接口，使用通用数据契约服务。',
  })
  @ApiQuery({ name: 'fRoads', description: 'F-Road 编号列表（多个用逗号分隔）', example: 'F208,F225,F249,F26', type: String, required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回路况数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            fRoads: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  roadNumber: { type: 'string', example: 'F208' },
                  status: { type: 'string', example: 'open' },
                  isOpen: { type: 'boolean', example: true },
                  riskLevel: { type: 'number', example: 1 },
                  requires4WD: { type: 'boolean', example: true },
                  condition: { type: 'string', example: 'dry' },
                  lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
                },
              },
            },
            lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
            source: { type: 'string', example: 'road.is' },
          },
        },
      },
    },
  })
  async getRoadStatusByFRoads(
    @Query('fRoads') fRoads: string,
  ) {
    if (!fRoads) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'fRoads 参数是必需的');
    }

    try {
      const fRoadList = fRoads.split(',').map(f => f.trim().toUpperCase());
      const results: Array<{
        roadNumber: string;
        status: string;
        isOpen: boolean;
        riskLevel: number;
        requires4WD?: boolean;
        condition?: string;
        lastUpdated: string;
        reason?: string;
      }> = [];

      // 如果有冰岛 F-Road 服务，使用它获取 F-Road 信息
      if (this.icelandFRoadService) {
        for (const fRoadNumber of fRoadList) {
          try {
            // 获取 F-Road 的坐标（简化处理：使用 F-Road 服务或默认坐标）
            // 冰岛中心坐标作为默认值
            const defaultLat = 64.5;
            const defaultLng = -18.5;

            const roadQuery: RoadStatusQuery = {
              lat: defaultLat,
              lng: defaultLng,
              includeFRoadInfo: true,
            };

            const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
            const extendedStatus = roadStatus as ExtendedRoadStatus;

            // 如果返回的 F-Road 信息匹配当前查询的 F-Road
            if (extendedStatus.fRoadInfo && extendedStatus.fRoadInfo.roadNumber === fRoadNumber) {
              results.push({
                roadNumber: fRoadNumber,
                status: extendedStatus.fRoadInfo.status,
                isOpen: extendedStatus.fRoadInfo.status === 'open',
                riskLevel: extendedStatus.riskLevel,
                requires4WD: extendedStatus.fRoadInfo.requires4WD,
                condition: extendedStatus.metadata?.condition as string | undefined,
                lastUpdated: extendedStatus.lastUpdated.toISOString(),
                reason: extendedStatus.reason,
              });
            } else {
              // 如果没有匹配的 F-Road 信息，返回默认状态
              results.push({
                roadNumber: fRoadNumber,
                status: 'unknown',
                isOpen: true,
                riskLevel: 1,
                requires4WD: true, // F-Road 默认需要 4WD
                lastUpdated: new Date().toISOString(),
                reason: '无法获取实时路况信息',
              });
            }
          } catch (error: any) {
            // 单个 F-Road 查询失败，返回默认状态
            results.push({
              roadNumber: fRoadNumber,
              status: 'unknown',
              isOpen: true,
              riskLevel: 1,
              requires4WD: true,
              lastUpdated: new Date().toISOString(),
              reason: `查询失败: ${error.message}`,
            });
          }
        }
      } else {
        // 如果没有 F-Road 服务，返回默认状态
        for (const fRoadNumber of fRoadList) {
          results.push({
            roadNumber: fRoadNumber,
            status: 'unknown',
            isOpen: true,
            riskLevel: 1,
            requires4WD: true,
            lastUpdated: new Date().toISOString(),
            reason: 'F-Road 服务不可用',
          });
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
}
