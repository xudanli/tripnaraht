// src/transport/transport.controller.ts
import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { TransportPlanDto } from './dto/transport-plan.dto';
import { TransportRoutingService } from './transport-routing.service';
import { UserContext } from './interfaces/transport.interface';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

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
    description: '成功返回交通推荐（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async planRoute(@Body() dto: TransportPlanDto) {
    try {
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

      const result = await this.routingService.planRoute(
        dto.fromLat,
        dto.fromLng,
        dto.toLat,
        dto.toLng,
        context
      );
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }
}

