import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { MatchLearningService } from './match-learning.service';

@ApiTags('match-learning')
@Controller('match-learning')
export class MatchLearningController {
  constructor(private readonly matchLearning: MatchLearningService) {}

  @Public()
  @Get('weights')
  @ApiOperation({ summary: '当前生效的撮合 Soft Weights（P3）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getWeights() {
    try {
      return successResponse(await this.matchLearning.getWeightsWithMeta());
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('weights/runs')
  @ApiOperation({ summary: '最近权重迭代审计记录' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listRuns() {
    try {
      return successResponse({ runs: await this.matchLearning.listRecentRuns() });
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('weights/run-weekly')
  @ApiOperation({
    summary: '手动触发每周权重迭代（运维 / Staging）',
    description: '生产环境建议依赖 Cron；可通过 MATCH_LEARNING_MANUAL_RUN=false 禁用。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async runWeekly() {
    if (process.env.MATCH_LEARNING_MANUAL_RUN === 'false') {
      return errorResponse(ErrorCode.FORBIDDEN, '手动权重迭代已禁用');
    }

    try {
      const outcome = await this.matchLearning.runWeeklyWeightIteration();
      return successResponse(outcome);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }
}
