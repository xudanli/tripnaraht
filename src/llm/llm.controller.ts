// src/llm/llm.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { LlmService } from './services/llm.service';
import {
  NaturalLanguageToParamsDto,
  HumanizeResultDto,
  DecisionSupportDto,
} from './dto/llm-request.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('natural-language-to-params')
  @ApiOperation({
    summary: '自然语言转接口参数',
    description: '将用户的口语化需求转换为创建行程的接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
  })
  @ApiBody({ type: NaturalLanguageToParamsDto })
  @ApiResponse({
    status: 200,
    description: '成功转换参数（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async naturalLanguageToParams(@Body() dto: NaturalLanguageToParamsDto) {
    try {
      const result = await this.llmService.naturalLanguageToTripParams(dto);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('humanize-result')
  @ApiOperation({
    summary: '结果人性化转化',
    description: '将接口返回的结构化数据转化为自然语言描述，让用户更容易理解。',
  })
  @ApiBody({ type: HumanizeResultDto })
  @ApiResponse({
    status: 200,
    description: '成功转化结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async humanizeResult(@Body() dto: HumanizeResultDto) {
    try {
      const result = await this.llmService.humanizeResult(dto);
      return successResponse({ description: result });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('decision-support')
  @ApiOperation({
    summary: '决策支持',
    description: '基于接口数据提供智能决策建议，如 What-If 评估、多方案对比等。',
  })
  @ApiBody({ type: DecisionSupportDto })
  @ApiResponse({
    status: 200,
    description: '成功返回决策建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async decisionSupport(@Body() dto: DecisionSupportDto) {
    try {
      const result = await this.llmService.provideDecisionSupport(dto);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
