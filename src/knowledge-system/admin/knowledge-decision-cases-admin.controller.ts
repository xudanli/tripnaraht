import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { successResponse } from '../../common/dto/standard-response.dto';
import {
  DECISION_EPISODE_SCHEMA,
  type DecisionEpisodeV1,
} from '../../travel-memory/episode/decision-episode.types';
import { KnowledgeDecisionCaseService } from '../decision-knowledge/knowledge-decision-case.service';

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge/decision-cases')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeDecisionCasesAdminController {
  private readonly logger = new Logger(KnowledgeDecisionCasesAdminController.name);

  constructor(private readonly cases: KnowledgeDecisionCaseService) {}

  @Get()
  @ApiOperation({
    summary: 'List Knowledge DecisionCases',
    description:
      'Cross-trip searchable cases projected from DecisionEpisode. Filters: country, decisionType, situationTags, riskType, outcome, userChoice, regret, tripId.',
  })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'decisionType', required: false })
  @ApiQuery({ name: 'situationTags', required: false, description: 'comma-separated' })
  @ApiQuery({ name: 'riskType', required: false })
  @ApiQuery({ name: 'outcome', required: false })
  @ApiQuery({ name: 'userChoice', required: false })
  @ApiQuery({ name: 'regret', required: false })
  @ApiQuery({ name: 'tripId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Query('country') country?: string,
    @Query('decisionType') decisionType?: string,
    @Query('situationTags') situationTags?: string,
    @Query('riskType') riskType?: string,
    @Query('outcome') outcome?: string,
    @Query('userChoice') userChoice?: string,
    @Query('regret') regret?: string,
    @Query('tripId') tripId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return successResponse(
      this.cases.list({
        country,
        decisionType,
        situationTags,
        riskType,
        outcome,
        userChoice,
        regret,
        tripId,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
    );
  }

  @Post('reproject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reproject episodes from TravelMemoryRuntime hot Map → durable cases',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        country: { type: 'string' },
      },
    },
  })
  reproject(@Body() body?: { tripId?: string; country?: string }) {
    return successResponse(this.cases.reprojectFromRuntime(body));
  }

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest a DecisionEpisodeV1 into durable Knowledge Case' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['episode'],
      properties: {
        episode: { type: 'object' },
        country: { type: 'string' },
        situationSnapshotId: { type: 'string', nullable: true },
        constraintIds: { type: 'array', items: { type: 'string' } },
        userGoal: { type: 'string' },
      },
    },
  })
  ingest(
    @Body()
    body: {
      episode: DecisionEpisodeV1;
      country?: string;
      situationSnapshotId?: string | null;
      constraintIds?: string[];
      userGoal?: string;
    },
  ) {
    if (!body?.episode || body.episode.schemaId !== DECISION_EPISODE_SCHEMA) {
      return successResponse({
        ok: false,
        error: `episode.schemaId must be ${DECISION_EPISODE_SCHEMA}`,
      });
    }
    const c = this.cases.ingestEpisode(body.episode, {
      country: body.country,
      situationSnapshotId: body.situationSnapshotId,
      constraintIds: body.constraintIds,
      userGoal: body.userGoal,
    });
    return successResponse({ ok: true, case: c });
  }

  @Get(':caseId/similar')
  @ApiOperation({
    summary: 'Similar DecisionCases (SQL facets, no embedding)',
  })
  @ApiParam({ name: 'caseId' })
  @ApiQuery({ name: 'limit', required: false })
  async similar(@Param('caseId') caseId: string, @Query('limit') limit?: string) {
    const data = await this.cases.similar(caseId, {
      limit: limit ? Number(limit) : undefined,
    });
    this.logger.debug(`similar case=${caseId} hits=${data.items.length}`);
    return successResponse(data);
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'DecisionCase detail (Situation → Outcome / Regret)' })
  @ApiParam({ name: 'caseId' })
  get(@Param('caseId') caseId: string) {
    return successResponse(this.cases.get(caseId));
  }
}
