// src/trips/decision/controllers/fitness-assessment.controller.ts
/**
 * Fitness Assessment Controller
 * 
 * 体能评估 API 接口
 * 
 * @since 2026-02 Phase 1
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { FitnessAssessmentService } from '../services/fitness-assessment.service';
import {
  FitnessQuestionnaireAnswersDto,
  TripFitnessFeedbackDto,
  FitnessProfileResponseDto,
  FitnessQuestionnaireResponseDto,
  FitnessFeedbackStatsResponseDto,
  CreateFitnessModelDto,
} from '../dto/fitness-assessment.dto';
import { HumanCapabilityModel } from '../models/human-capability.model';

@ApiTags('Fitness Assessment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/fitness')
export class FitnessAssessmentController {
  private readonly logger = new Logger(FitnessAssessmentController.name);

  constructor(
    private readonly fitnessService: FitnessAssessmentService,
  ) {}

  /**
   * 获取标准化问卷问题
   */
  @Public()
  @Get('questionnaire')
  @ApiOperation({ 
    summary: '获取体能评估问卷',
    description: '返回标准化的体能评估问卷问题，包括运动习惯、徒步经验和年龄',
  })
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'zh'], description: '语言' })
  @ApiResponse({ 
    status: 200, 
    description: '问卷问题列表',
    type: FitnessQuestionnaireResponseDto,
  })
  getQuestionnaire(
    @Query('locale') locale: 'en' | 'zh' = 'zh'
  ): FitnessQuestionnaireResponseDto {
    return this.fitnessService.getQuestionnaire(locale);
  }

  /**
   * 提交问卷答案，创建体能模型
   */
  @Post('questionnaire/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '提交问卷答案',
    description: '提交标准化问卷答案，系统将创建个性化的体能模型（userId从JWT获取）',
  })
  @ApiResponse({ 
    status: 200, 
    description: '体能模型创建成功',
  })
  @ApiResponse({ status: 401, description: '未认证' })
  async submitQuestionnaire(
    @Body() dto: CreateFitnessModelDto,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{
    success: boolean;
    model: HumanCapabilityModel;
    profile: FitnessProfileResponseDto;
  }> {
    const userId = user.userId;
    const model = await this.fitnessService.createModelFromQuestionnaire(
      userId,
      {
        weeklyExercise: dto.weeklyExercise,
        longestHike: dto.longestHike,
        elevationExperience: dto.elevationExperience,
        ageGroupIndex: dto.ageGroupIndex,
      },
      {
        riskTolerance: dto.riskTolerance,
        highAltitudeExperience: dto.highAltitudeExperience,
        pace: dto.pace,
      }
    );

    const profile = await this.fitnessService.getFitnessProfile(userId, model);

    this.logger.log(
      `[问卷提交] userId=${userId}, fitnessLevel=${model.fitnessLevel}, score=${model.fitnessScore}`
    );

    return {
      success: true,
      model,
      profile: profile as FitnessProfileResponseDto,
    };
  }

  /**
   * 获取用户体能画像
   */
  @Get('profile')
  @ApiOperation({ 
    summary: '获取用户体能画像',
    description: '获取当前用户的体能评估结果，包括评分、等级、置信度等（userId从JWT获取）',
  })
  @ApiResponse({ 
    status: 200, 
    description: '体能画像',
    type: FitnessProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 404, description: '用户尚未完成体能评估' })
  async getFitnessProfile(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<FitnessProfileResponseDto | { hasProfile: false; message: string }> {
    const userId = user.userId;
    this.logger.debug(`[获取画像] userId=${userId}`);
    
    // 从数据库加载用户已保存的体能模型
    const model = await this.fitnessService.loadUserModel(userId);
    
    if (!model) {
      return {
        hasProfile: false,
        message: '您尚未完成体能评估，请先完成问卷。',
      };
    }

    const profile = await this.fitnessService.getFitnessProfile(userId, model);
    return profile as FitnessProfileResponseDto;
  }

  /**
   * 提交行程后体能反馈
   */
  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '提交行程后体能反馈',
    description: '行程结束后，用户反馈实际感受，用于校准体能模型。只需选择一个 emoji！（userId从JWT获取）',
  })
  @ApiResponse({ 
    status: 200, 
    description: '反馈提交成功',
  })
  @ApiResponse({ status: 401, description: '未认证' })
  async submitFeedback(
    @Body() dto: TripFitnessFeedbackDto,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ success: boolean; message: string }> {
    const userId = user.userId;
    await this.fitnessService.collectTripFeedback({
      tripId: dto.tripId,
      userId,
      plannedFatigueIndex: dto.plannedFatigueIndex || 1.0,
      actualEffortRating: dto.actualEffortRating,
      completedAsPlanned: dto.completedAsPlanned,
      adjustmentsMade: dto.adjustmentsMade,
    });

    // 根据反馈给出不同的响应消息
    const messages: Record<number, string> = {
      1: '感谢反馈！我们会调整您的体能模型，让下次行程更轻松。',
      2: '太棒了！看来行程安排刚刚好。',
      3: '好的！下次可以挑战更高难度的路线。',
    };

    return {
      success: true,
      message: messages[dto.actualEffortRating],
    };
  }

  /**
   * 获取用户反馈统计
   */
  @Get('feedback/stats')
  @ApiOperation({ 
    summary: '获取用户反馈统计',
    description: '获取当前用户历史反馈的统计数据，包括总数、平均评分、完成率和趋势（userId从JWT获取）',
  })
  @ApiResponse({ 
    status: 200, 
    description: '反馈统计',
    type: FitnessFeedbackStatsResponseDto,
  })
  @ApiResponse({ status: 401, description: '未认证' })
  async getFeedbackStats(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<FitnessFeedbackStatsResponseDto> {
    return this.fitnessService.getUserFeedbackStats(user.userId);
  }

  /**
   * 手动触发体能模型校准
   */
  @Post('calibrate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '校准体能模型',
    description: '基于历史行程反馈，重新校准当前用户的体能模型（userId从JWT获取）',
  })
  @ApiResponse({ 
    status: 200, 
    description: '校准完成',
  })
  @ApiResponse({ status: 401, description: '未认证' })
  async calibrateModel(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{
    success: boolean;
    calibrated: boolean;
    message: string;
    profile?: FitnessProfileResponseDto;
  }> {
    const userId = user.userId;
    this.logger.log(`[校准请求] userId=${userId}`);

    // 从数据库加载当前模型
    const currentModel = await this.fitnessService.loadUserModel(userId);
    
    if (!currentModel) {
      return {
        success: false,
        calibrated: false,
        message: '您尚未完成体能评估，无法校准。请先完成问卷。',
      };
    }

    // 执行校准
    const calibratedModel = await this.fitnessService.calibrateModel(userId, currentModel);
    
    // 检查是否有实际校准发生
    const wasCalibrated = calibratedModel.maxDailyAscentM !== currentModel.maxDailyAscentM;
    
    if (wasCalibrated) {
      const profile = await this.fitnessService.getFitnessProfile(userId, calibratedModel);
      return {
        success: true,
        calibrated: true,
        message: `校准完成！您的单日爬升上限已更新为 ${calibratedModel.maxDailyAscentM}m。`,
        profile: profile as FitnessProfileResponseDto,
      };
    }

    return {
      success: true,
      calibrated: false,
      message: '暂无足够的反馈数据进行校准，请在完成更多行程后再试。',
    };
  }
}
