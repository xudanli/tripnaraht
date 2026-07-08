import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { SubmitResearchCommitmentDto } from '../trips/exploration/dto/exploration-continue.dto';
import { ResearchCommitmentService } from './research-commitment.service';
import { ResearchSessionService } from './research-session.service';

class ResearchEventDto {
  @IsString()
  eventName!: string;

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}

class BatchResearchEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResearchEventDto)
  events!: ResearchEventDto[];
}

@ApiTags('research')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research')
export class ResearchEventsController {
  constructor(
    private readonly researchSessions: ResearchSessionService,
    private readonly commitments: ResearchCommitmentService,
  ) {}

  @Post('sessions/:sessionId/commitments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4A — 提交行为承诺（NOTIFY_ME / SELF_CHECK）' })
  async submitCommitment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: SubmitResearchCommitmentDto,
  ) {
    const result = await this.commitments.submitCommitment(sessionId, user.userId, body);
    return successResponse(result);
  }

  @Post('events/batch')
  @ApiOperation({ summary: '批量上报研究事件' })
  async batchEvents(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: BatchResearchEventsDto,
  ) {
    const sessionId = typeof body.events[0]?.payload?.sessionId === 'string'
      ? body.events[0].payload.sessionId
      : undefined;

    if (!sessionId) {
      return successResponse({ accepted: 0, message: 'sessionId required in event payload' });
    }

    const result = await this.researchSessions.appendEvents(
      sessionId,
      user.userId,
      body.events,
    );
    return successResponse(result);
  }

  @Post('sessions/:sessionId/events/batch')
  @ApiOperation({ summary: '按 Session 批量上报研究事件' })
  async batchEventsForSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: BatchResearchEventsDto,
  ) {
    const result = await this.researchSessions.appendEvents(
      sessionId,
      user.userId,
      body.events,
    );
    return successResponse(result);
  }
}
