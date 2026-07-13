/**
 * PR-E — public/staging L2 authorize + execute API.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { isRfc001IcelandRoadCloseEnabled } from '../config/rfc001-iceland.config';
import { Rfc001AuthorizationService } from '../authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../execution/plan-version-apply.executor';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';

class AuthorizeDecisionDto {
  @ApiProperty()
  @IsString()
  tripId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  choice?: string;
}

class ExecuteDecisionDto {
  @ApiProperty()
  @IsString()
  tripId!: string;
}

class RollbackDecisionDto {
  @ApiProperty()
  @IsString()
  tripId!: string;
}

@ApiTags('RFC-001 Decisions')
@Controller('rfc001/decisions')
export class Rfc001DecisionsController {
  constructor(
    private readonly authorization: Rfc001AuthorizationService,
    private readonly executor: Rfc001PlanVersionApplyExecutor,
  ) {}

  private assertEnabled(): void {
    if (!isRfc001IcelandRoadCloseEnabled()) {
      throw new ForbiddenException(
        'RFC001_ICELAND_ROAD_CLOSE is not enabled',
      );
    }
  }

  @Post(':decisionId/authorize')
  @ApiOperation({ summary: 'L2 user confirmation (PR-E)' })
  async authorize(
    @Param('decisionId') decisionId: string,
    @Body() body: AuthorizeDecisionDto,
  ) {
    this.assertEnabled();
    const result = await this.authorization.authorize({
      tripId: body.tripId,
      decisionId,
      choice: body.choice,
    });
    return { ok: true, ...result };
  }

  @Post(':decisionId/execute')
  @ApiOperation({ summary: 'Apply authorized PlanVersion (PR-E)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Defaults to trip:{tripId}:decision:{decisionId}:apply-plan-version',
  })
  async execute(
    @Param('decisionId') decisionId: string,
    @Body() body: ExecuteDecisionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.assertEnabled();
    const result = await this.executor.execute({
      tripId: body.tripId,
      decisionId,
      idempotencyKey:
        idempotencyKey ??
        buildPlanVersionIdempotencyKey(body.tripId, decisionId),
    });
    return { ok: true, ...result };
  }

  @Post(':decisionId/rollback')
  @ApiOperation({ summary: 'Rollback to parent PlanVersion (PR-E)' })
  async rollback(
    @Param('decisionId') decisionId: string,
    @Body() body: RollbackDecisionDto,
  ) {
    this.assertEnabled();
    const result = await this.executor.rollback({
      tripId: body.tripId,
      decisionId,
    });
    return { ok: true, ...result };
  }
}
