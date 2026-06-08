import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { ReputationOsService } from './reputation-os.service';
import { SubmitReputationSurveyDto } from './dto/reputation-os.dto';

@ApiTags('reputation-os')
@Controller('reputation-os')
export class ReputationOsController {
  constructor(private readonly reputationOs: ReputationOsService) {}

  @Public()
  @Get('survey/questions')
  @ApiOperation({ summary: '互评问卷题干（5 题五星量表）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getSurveyQuestions() {
    return successResponse(this.reputationOs.getSurveyQuestions());
  }

  @Public()
  @Get('pending-surveys')
  @ApiOperation({
    summary: '待完成互评（Push / 全局弹窗数据源）',
    description: 'PRD 5.1：行程结束 +48h 后返回；copy 见 pushCopy.title',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listPendingSurveys(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      return successResponse(await this.reputationOs.listPendingSurveys(user.userId));
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('surveys/submit')
  @ApiOperation({ summary: '提交对一位旅伴的五星互评' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitSurvey(
    @Body() dto: SubmitReputationSurveyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      return successResponse(await this.reputationOs.submitSurvey(user.userId, dto));
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('profile/me')
  @ApiOperation({ summary: '我的信用资产（星级 + 标签云）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getMyReputation(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      return successResponse(await this.reputationOs.getMyReputation(user.userId));
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('users/:userId/profile')
  @ApiOperation({ summary: '他人脱敏信用资产（个人主页展示）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getUserReputation(@Param('userId') userId: string) {
    try {
      const assets = await this.reputationOs.getUserReputation(userId);
      return successResponse({
        ...assets,
        safetyWarning: undefined,
        internalRiskLevel: undefined,
      });
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('users/:userId/safety')
  @ApiOperation({
    summary: '队长审批安全预警（内部降权提示）',
    description: 'PRD 5.4：仅队长审批场景使用，不对被评价用户公开',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getUserSafety(@Param('userId') userId: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const warning = await this.reputationOs.getSafetyWarning(userId);
      return successResponse({ userId, safetyWarning: warning });
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }
}
