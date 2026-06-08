import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { errorResponse, ErrorCode, successResponse } from '../../../common/dto/standard-response.dto';
import { UnifiedCounterfactualRequestDto } from '../dto/unified-counterfactual.dto';
import { buildUnifiedCounterfactualExplain } from '../explainability/build-unified-counterfactual.util';

@ApiTags('decision-explain')
@Controller('decision/explain')
export class DecisionExplainController {
  private readonly logger = new Logger(DecisionExplainController.name);

  @Public()
  @Post('unified/counterfactual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '结构化 counterfactual',
    description:
      '基于 explain.unified envelope 的 rejected plans + grounded_factors 生成「若选 base 会怎样」可质疑回答。',
  })
  @ApiBody({ type: UnifiedCounterfactualRequestDto })
  @ApiResponse({ status: 200, description: 'counterfactual 生成成功' })
  buildUnifiedCounterfactual(@Body() body: UnifiedCounterfactualRequestDto) {
    try {
      if (!body?.unified?.contract_version) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'unified envelope is required');
      }
      const result = buildUnifiedCounterfactualExplain({
        envelope: body.unified,
        altPlanId: body.alt_plan_id?.trim() || undefined,
      });
      if (!result) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          body.alt_plan_id
            ? `alt_plan_id "${body.alt_plan_id}" not found in rejected plans`
            : 'envelope has no decision_verdict.rejected_plans or grounded rejection factors',
        );
      }
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`buildUnifiedCounterfactual failed: ${message}`);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}
