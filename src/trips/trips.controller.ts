// src/trips/trips.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ 
    summary: '创建新行程',
    description: '创建新行程并自动计算节奏策略（木桶效应）和预算切分。系统会根据旅行者信息自动计算体力限制和地形限制，并根据预算推荐酒店档次。'
  })
  @ApiResponse({ 
    status: 201, 
    description: '行程创建成功',
    schema: {
      example: {
        id: 'uuid-xxxx',
        destination: 'JP',
        startDate: '2024-05-01T00:00:00.000Z',
        endDate: '2024-05-05T00:00:00.000Z',
        budgetConfig: {
          total: 20000,
          currency: 'CNY',
          daily_budget: 3000,
          remaining_for_ground: 15000,
          estimated_flight_visa: 5000,
          hotel_tier_recommendation: '4-Star'
        },
        pacingConfig: {
          mobility_profile: 'STAMINA_60_TERRAIN_NO_STAIRS',
          desc: '检测到体力短板，建议每 90 分钟休息一次；避免楼梯和陡坡',
          forced_rest_interval: 90,
          terrain_filter: 'NO_STAIRS',
          min_stamina: 60
        },
        days: []
      }
    }
  })
  @ApiResponse({ status: 400, description: '输入数据验证失败' })
  create(@Body() createTripDto: CreateTripDto) {
    return this.tripsService.create(createTripDto);
  }

  @Get()
  @ApiOperation({ 
    summary: '获取所有行程',
    description: '返回所有行程列表，包含每个行程的基本信息和关联的 TripDay'
  })
  @ApiResponse({ status: 200, description: '成功返回行程列表' })
  findAll() {
    return this.tripsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程详情（全景视图）',
    description: '根据行程 ID 获取完整的行程树形结构，包括：\n' +
                 '- 所有 TripDay（按日期排序）\n' +
                 '- 每个 Day 下的所有 ItineraryItem（按时间排序）\n' +
                 '- 每个 Item 关联的 Place 详情（包含中英文名称、位置、营业时间等）\n' +
                 '- 统计信息（总天数、总活动数、行程状态等）'
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程详情（全景视图）',
    schema: {
      example: {
        id: 'trip-123',
        destination: 'IS',
        startDate: '2024-07-01T00:00:00.000Z',
        endDate: '2024-07-05T00:00:00.000Z',
        budgetConfig: {
          total: 20000,
          currency: 'CNY',
          daily_budget: 3000,
          hotel_tier_recommendation: '4-Star'
        },
        pacingConfig: {
          mobility_profile: 'STAMINA_60_TERRAIN_NO_STAIRS',
          desc: '检测到体力短板，建议每 90 分钟休息一次',
          forced_rest_interval: 90,
          terrain_filter: 'NO_STAIRS'
        },
        stats: {
          totalDays: 5,
          daysWithActivities: 3,
          totalItems: 8,
          totalActivities: 5,
          totalMeals: 2,
          totalRest: 1,
          totalTransit: 0,
          progress: 'PLANNING',
          budgetStats: {
            total: 20000,
            currency: 'CNY',
            daily_budget: 3000,
            hotel_tier_recommendation: '4-Star'
          }
        },
        days: [
          {
            id: 'day-1',
            date: '2024-07-01T00:00:00.000Z',
            items: [
              {
                id: 'item-abc',
                type: 'ACTIVITY',
                startTime: '2024-07-01T10:00:00.000Z',
                endTime: '2024-07-01T12:00:00.000Z',
                note: '记得穿雨衣',
                place: {
                  id: 1,
                  name: '古佛斯瀑布',
                  nameEN: 'Gullfoss Waterfall',
                  category: 'ATTRACTION',
                  address: 'Iceland',
                  rating: 4.8,
                  metadata: {
                    openingHours: { mon: '09:00-18:00' },
                    timezone: 'Atlantic/Reykjavik'
                  },
                  physicalMetadata: {
                    terrain: 'STAIRS',
                    fatigue_score: 'MEDIUM'
                  }
                }
              }
            ]
          },
          {
            id: 'day-2',
            date: '2024-07-02T00:00:00.000Z',
            items: []
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }
}
