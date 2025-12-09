// src/itinerary-optimization/itinerary-optimization.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { RouteOptimizationService } from './itinerary-optimization.service';

@ApiTags('itinerary-optimization')
@Controller('itinerary-optimization')
export class ItineraryOptimizationController {
  constructor(
    private readonly optimizationService: RouteOptimizationService
  ) {}

  @Post('optimize')
  @ApiOperation({
    summary: '优化路线（节奏感算法）',
    description:
      '使用 4 维平衡算法优化路线：\n' +
      '1. **空间聚类**：拒绝"折返跑"，同一时间段锁定在同一 Zone\n' +
      '2. **节奏控制**：强度交替，避免连续相同类别\n' +
      '3. **生物钟锚定**：饭点优先，以餐厅为锚点逆向规划\n' +
      '4. **容错与留白**：弹性因子，预留缓冲时间\n\n' +
      '算法使用模拟退火（Simulated Annealing）找到最优解。',
  })
  @ApiBody({
    type: OptimizeRouteDto,
    description: '路线优化请求参数',
    examples: {
      standard: {
        summary: '标准行程示例',
        value: {
          placeIds: [1, 2, 3, 4, 5],
          config: {
            date: '2024-05-01',
            startTime: '2024-05-01T09:00:00.000Z',
            endTime: '2024-05-01T18:00:00.000Z',
            pacingFactor: 1.0,
            hasChildren: false,
            hasElderly: false,
            lunchWindow: {
              start: '12:00',
              end: '13:30',
            },
          },
        },
      },
      withElderly: {
        summary: '带老人/小孩示例',
        value: {
          placeIds: [1, 2, 3, 4, 5],
          config: {
            date: '2024-05-01',
            startTime: '2024-05-01T09:00:00.000Z',
            endTime: '2024-05-01T18:00:00.000Z',
            pacingFactor: 1.5,
            hasChildren: true,
            hasElderly: true,
            lunchWindow: {
              start: '12:00',
              end: '13:30',
            },
            dinnerWindow: {
              start: '18:00',
              end: '20:00',
            },
          },
        },
      },
      fastPace: {
        summary: '特种兵模式示例',
        value: {
          placeIds: [1, 2, 3, 4, 5, 6, 7, 8],
          config: {
            date: '2024-05-01',
            startTime: '2024-05-01T08:00:00.000Z',
            endTime: '2024-05-01T22:00:00.000Z',
            pacingFactor: 0.7,
            lunchWindow: {
              start: '12:00',
              end: '13:00',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回优化后的路线',
    schema: {
      type: 'object',
      example: {
        nodes: [
          {
            id: 1,
            name: '浅草寺',
            category: 'ATTRACTION',
            location: { lat: 35.7148, lng: 139.7967 },
            intensity: 'MEDIUM',
            estimatedDuration: 90,
          },
          {
            id: 2,
            name: '午餐餐厅',
            category: 'RESTAURANT',
            location: { lat: 35.7150, lng: 139.7970 },
            isRestaurant: true,
            estimatedDuration: 60,
          },
        ],
        schedule: [
          {
            nodeIndex: 0,
            startTime: '2024-05-01T09:00:00.000Z',
            endTime: '2024-05-01T10:30:00.000Z',
            transportTime: 20,
          },
          {
            nodeIndex: 1,
            startTime: '2024-05-01T12:00:00.000Z',
            endTime: '2024-05-01T13:00:00.000Z',
            transportTime: 15,
          },
        ],
        happinessScore: 850,
        scoreBreakdown: {
          interestScore: 500,
          distancePenalty: 50,
          tiredPenalty: 0,
          boredPenalty: 0,
          starvePenalty: 0,
          clusteringBonus: 100,
          bufferBonus: 30,
        },
        zones: [
          {
            id: 0,
            centroid: { lat: 35.7148, lng: 139.7967 },
            places: [],
            radius: 1500,
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定的地点',
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
  })
  async optimizeRoute(@Body() dto: OptimizeRouteDto) {
    return this.optimizationService.optimizeRoute(dto);
  }
}

