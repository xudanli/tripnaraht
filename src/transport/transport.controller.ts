// src/transport/transport.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { TransportPlanDto } from './dto/transport-plan.dto';
import { TransportRoutingService } from './transport-routing.service';
import { UserContext } from './interfaces/transport.interface';

@ApiTags('transport')
@Controller('transport')
export class TransportController {
  constructor(private readonly routingService: TransportRoutingService) {}

  @Post('plan')
  @ApiOperation({
    summary: '规划交通路线（智能推荐）',
    description:
      '根据起点和终点，智能推荐最佳交通方式。\n\n' +
      '**核心特性：**\n' +
      '- 自动区分大交通（城市间）和小交通（市内）\n' +
      '- 根据用户画像（行李、老人、天气等）智能排序\n' +
      '- 计算"痛苦指数"，推荐最舒适的方案\n' +
      '- 提供推荐理由和警告信息\n\n' +
      '**推荐逻辑：**\n' +
      '- 大交通：默认推荐铁路/高铁，预算敏感推荐巴士，时间敏感推荐飞机\n' +
      '- 小交通：步行（<1.5km且天气好）、公共交通（>1.5km）、打车（有行李/老人/下雨）',
  })
  @ApiBody({
    type: TransportPlanDto,
    description: '交通规划请求参数',
    examples: {
      intraCity: {
        summary: '市内交通示例',
        value: {
          fromLat: 35.6762,
          fromLng: 139.6503,
          toLat: 35.6812,
          toLng: 139.7671,
          hasLuggage: false,
          hasElderly: false,
          isRaining: false,
          budgetSensitivity: 'MEDIUM',
        },
      },
      interCity: {
        summary: '城市间交通示例',
        value: {
          fromLat: 35.6762,
          fromLng: 139.6503,
          toLat: 34.6937,
          toLng: 135.5023,
          hasLuggage: true,
          isMovingDay: true,
          budgetSensitivity: 'HIGH',
          timeSensitivity: 'MEDIUM',
        },
      },
      withElderly: {
        summary: '有老人同行示例',
        value: {
          fromLat: 35.6762,
          fromLng: 139.6503,
          toLat: 35.6812,
          toLng: 139.7671,
          hasElderly: true,
          isRaining: true,
          budgetSensitivity: 'LOW',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回交通推荐',
    schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mode: { type: 'string', example: 'TAXI' },
              durationMinutes: { type: 'number', example: 15 },
              cost: { type: 'number', example: 1200 },
              walkDistance: { type: 'number', example: 0 },
              score: { type: 'number', example: 150 },
              recommendationReason: { type: 'string', example: '适合携带行李、避免淋雨' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        recommendationReason: { type: 'string', example: '您带着行李，且外面正在下雨，建议打车出行' },
        specialAdvice: {
          type: 'array',
          items: { type: 'string' },
          example: ['💡 建议使用宅急便（Yamato）将行李直接寄到下一家酒店，今日轻装游玩'],
        },
      },
    },
  })
  async planRoute(@Body() dto: TransportPlanDto) {
    const context: UserContext = {
      hasLuggage: dto.hasLuggage || false,
      hasElderly: dto.hasElderly || false,
      isRaining: dto.isRaining || false,
      budgetSensitivity: dto.budgetSensitivity || 'MEDIUM',
      timeSensitivity: dto.timeSensitivity || 'MEDIUM',
      hasLimitedMobility: dto.hasLimitedMobility || false,
      currentCity: dto.currentCity,
      targetCity: dto.targetCity,
      isMovingDay: dto.isMovingDay || (dto.currentCity !== dto.targetCity && !!dto.currentCity && !!dto.targetCity),
    };

    return this.routingService.planRoute(
      dto.fromLat,
      dto.fromLng,
      dto.toLat,
      dto.toLng,
      context
    );
  }
}

