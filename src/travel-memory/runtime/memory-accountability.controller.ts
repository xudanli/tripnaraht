/**
 * Travel Memory Accountability HTTP（Phase 1）。
 * Decision 优先；失败不伪装成「无记忆」以外的错误信息。
 */

import { Controller, Get, Param, Optional } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from '../../common/dto/standard-response.dto';
import { MemoryAccountabilityService } from './memory-accountability.service';

@ApiTags('Travel Memory Accountability')
@Controller()
export class MemoryAccountabilityController {
  constructor(
    @Optional() private readonly accountability?: MemoryAccountabilityService,
  ) {}

  @Public()
  @Get('decision/:decisionId/explanation')
  @ApiOperation({
    summary: '为什么这个建议出现？（Memory Used / Ignored）',
  })
  async explainDecision(@Param('decisionId') decisionId: string) {
    if (!this.accountability) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'MemoryAccountability unavailable');
    }
    const out = await this.accountability.explainDecision(decisionId);
    return successResponse(out);
  }

  /** 兼容合同别名 */
  @Public()
  @Get('decision/:decisionId/memory-explanation')
  async explainDecisionAlias(@Param('decisionId') decisionId: string) {
    return this.explainDecision(decisionId);
  }

  @Public()
  @Get('memory/:memoryEventId/evidence')
  @ApiOperation({
    summary: '为什么认为有这个偏好？（evidenceRefs）',
  })
  async explainMemory(@Param('memoryEventId') memoryEventId: string) {
    if (!this.accountability) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'MemoryAccountability unavailable');
    }
    const out = await this.accountability.explainMemory(memoryEventId);
    if (!out) {
      return errorResponse(ErrorCode.NOT_FOUND, `memory ${memoryEventId} not found`);
    }
    return successResponse(out);
  }
}
