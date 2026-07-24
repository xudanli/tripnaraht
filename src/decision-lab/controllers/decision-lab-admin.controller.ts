/**
 * Decision Lab admin — in-memory solver benchmarks (no Effective Plan writes).
 * Enable with DECISION_LAB_ENABLED=1.
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { isDecisionLabEnabled } from '../decision-lab.config';
import { LabBenchmarkService } from '../benchmark/lab-benchmark.service';

class LabBenchmarkRequestDto {
  fixtureIds?: string[];
  seed?: number;
  strategyIds?: string[];
}

@ApiTags('decision-engine')
@Controller('decision-engine/v1/lab')
export class DecisionLabAdminController {
  private readonly logger = new Logger(DecisionLabAdminController.name);

  constructor(@Optional() private readonly labBenchmark?: LabBenchmarkService) {}

  @Public()
  @Post('benchmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decision Lab benchmark (legacy-frozen vs cp-sat-lex)',
    description:
      'Runs in-memory fixture benchmarks. Requires DECISION_LAB_ENABLED=1. Does not write Effective Plan.',
  })
  @ApiBody({ type: LabBenchmarkRequestDto })
  async runBenchmark(@Body() body: LabBenchmarkRequestDto) {
    try {
      if (!isDecisionLabEnabled()) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          'Decision Lab disabled (set DECISION_LAB_ENABLED=1)',
        );
      }
      if (!this.labBenchmark) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'LabBenchmarkService unavailable');
      }

      const summary = await this.labBenchmark.runBenchmark({
        fixtureIds: body.fixtureIds ?? [],
        seed: body.seed ?? 42,
        strategyIds: body.strategyIds ?? [],
      });

      return successResponse(summary);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Decision Lab benchmark failed: ${message}`);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}
