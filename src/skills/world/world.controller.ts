// src/skills/world/world.controller.ts
import { Controller, Post, Body, Get, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { WorldBuildContextSkill } from './world-build-context.skill';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { WorldModelMonitoringService } from './services/world-model-monitoring.service';

@ApiTags('world')
@Controller('world')
export class WorldController {
  constructor(
    private readonly worldBuildContextSkill: WorldBuildContextSkill,
    @Optional() private readonly monitoringService?: WorldModelMonitoringService,
  ) {}

  /**
   * 构建世界模型上下文
   */
  @Public()
  @Post('buildContext')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '构建世界模型上下文',
    description: `
根据 tripId 或原始参数构建完整的世界模型上下文（WorldModelContext）。

**功能**：
- PhysicalRealityModel（物理现实模型）：DEM证据、道路状态、危险区域、渡轮状态、气候季节性
- HumanCapabilityModel（人体能力模型）：体能、节奏、风险承受度
- RouteDirection（路线方向）：路线哲学、季节性、约束

**输入**：
- tripId（推荐）：从 Trip 中提取所有信息
- 或原始参数：countryCode, season, duration, partyProfile

**返回**：
- world: 完整的世界模型上下文
- missingPieces: 缺失的数据片段
    `.trim(),
  })
  @ApiBody({
    description: '世界模型构建请求',
    schema: {
      type: 'object',
      properties: {
        tripId: {
          type: 'string',
          description: '行程 ID（推荐）',
          example: '9a4dbd2e-e76a-4fd3-bab0-09332fb2581b',
        },
        countryCode: {
          type: 'string',
          description: '国家代码（ISO 3166-1 alpha-2）',
          example: 'IS',
        },
        season: {
          type: 'number',
          description: '季节（月份 1-12）',
          example: 7,
        },
        duration: {
          type: 'number',
          description: '行程天数',
          example: 8,
        },
        partyProfile: {
          type: 'object',
          description: '团队画像',
          properties: {
            mobilityProfile: { type: 'string' },
            riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
            fitness: { type: 'string', enum: ['low', 'medium', 'high'] },
            pace: { type: 'string', enum: ['relaxed', 'moderate', 'intense'] },
          },
        },
        routeDirectionId: {
          type: 'string',
          description: '路线方向 ID（可选）',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回世界模型上下文',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: 'Trip 不存在',
  })
  async buildContext(@Body() input: {
    tripId?: string;
    countryCode?: string;
    season?: number;
    duration?: number;
    partyProfile?: {
      mobilityProfile?: string;
      riskTolerance?: 'low' | 'medium' | 'high';
      fitness?: 'low' | 'medium' | 'high';
      pace?: 'relaxed' | 'moderate' | 'intense';
    };
    routeDirectionId?: string;
  }) {
    try {
      const result = await this.worldBuildContextSkill.execute(input);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(
        error.status === 404 ? ErrorCode.NOT_FOUND : ErrorCode.INTERNAL_ERROR,
        error.message || '构建世界模型失败',
      );
    }
  }

  /**
   * 获取世界模型性能指标（Code Review P2-4修复）
   */
  @Public()
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取世界模型性能指标',
    description: '返回世界模型构建的性能指标、错误率和缓存命中率',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回性能指标',
  })
  async getMetrics() {
    if (!this.monitoringService) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        '监控服务不可用',
      );
    }

    try {
      const metrics = this.monitoringService.getPerformanceMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取性能指标失败',
      );
    }
  }
}
