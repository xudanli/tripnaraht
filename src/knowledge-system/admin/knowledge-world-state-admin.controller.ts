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
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import { KnowledgeWorldStateService } from '../world-state/knowledge-world-state.service';

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge/world-state')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeWorldStateAdminController {
  private readonly logger = new Logger(KnowledgeWorldStateAdminController.name);

  constructor(private readonly worldState: KnowledgeWorldStateService) {}

  @Get('monitoring')
  @ApiOperation({
    summary: 'World State monitoring dashboard',
    description:
      'Sources (road.is / weather.is), KPIs, alerts, freshness/confidence/latency trends',
  })
  monitoring() {
    return successResponse(this.worldState.monitoring());
  }

  @Get('sources')
  @ApiOperation({ summary: 'Data source health (subset of monitoring)' })
  sources() {
    const m = this.worldState.monitoring();
    return successResponse({ sources: m.sources, note: m.note });
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Open World State alerts' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'ACKED', 'RESOLVED'] })
  alerts(@Query('status') status?: string) {
    const m = this.worldState.monitoring();
    const alerts = status
      ? m.alerts.filter((a) => a.status === status)
      : m.alerts;
    return successResponse({ alerts, total: alerts.length, kpis: m.kpis });
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List world-state snapshots (counts / status / recent categories)' })
  @ApiQuery({ name: 'tripId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['HEALTHY', 'DEGRADED', 'STALE', 'INCOMPLETE'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  listSnapshots(
    @Query('tripId') tripId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return successResponse(
      this.worldState.listSnapshots({
        tripId,
        status,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      }),
    );
  }

  @Get('snapshots/:snapshotId')
  @ApiOperation({ summary: 'Snapshot detail + freshness / unresolved subjects' })
  @ApiParam({ name: 'snapshotId' })
  getSnapshot(@Param('snapshotId') snapshotId: string) {
    return successResponse(this.worldState.getSnapshotDetail(snapshotId));
  }

  @Get('diff')
  @ApiOperation({
    summary: 'Diff two snapshots — product summary + changes[]',
    description:
      'summary: added/updated/removed/worsened/improved; changes[]: object, old/new, impact, source. engine* for debug.',
  })
  @ApiQuery({ name: 'fromSnapshotId', required: true })
  @ApiQuery({ name: 'toSnapshotId', required: true })
  diff(
    @Query('fromSnapshotId') fromSnapshotId?: string,
    @Query('toSnapshotId') toSnapshotId?: string,
  ) {
    if (!fromSnapshotId || !toSnapshotId) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'fromSnapshotId and toSnapshotId required');
    }
    return successResponse(this.worldState.diff(fromSnapshotId, toSnapshotId));
  }

  @Get('facts')
  @ApiOperation({ summary: 'List WorldFacts with product filters' })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'predicate', required: false })
  @ApiQuery({ name: 'factType', required: false, description: 'Predicate family substring' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'source', required: false, description: 'Alias of provider' })
  @ApiQuery({ name: 'freshness', required: false, enum: ['FRESH', 'STALE', 'ALL'] })
  @ApiQuery({ name: 'confidenceMin', required: false })
  @ApiQuery({ name: 'confidenceMax', required: false })
  @ApiQuery({ name: 'timeFrom', required: false, description: 'ISO observedAt lower bound' })
  @ApiQuery({ name: 'timeTo', required: false, description: 'ISO observedAt upper bound' })
  @ApiQuery({ name: 'tripId', required: false })
  @ApiQuery({ name: 'snapshotId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  listFacts(
    @Query('entityId') entityId?: string,
    @Query('predicate') predicate?: string,
    @Query('factType') factType?: string,
    @Query('entityType') entityType?: string,
    @Query('country') country?: string,
    @Query('provider') provider?: string,
    @Query('source') source?: string,
    @Query('freshness') freshness?: 'FRESH' | 'STALE' | 'ALL',
    @Query('confidenceMin') confidenceMin?: string,
    @Query('confidenceMax') confidenceMax?: string,
    @Query('timeFrom') timeFrom?: string,
    @Query('timeTo') timeTo?: string,
    @Query('tripId') tripId?: string,
    @Query('snapshotId') snapshotId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return successResponse(
      this.worldState.listFacts({
        entityId,
        predicate,
        factType,
        entityType,
        country,
        provider,
        source,
        freshness: freshness ?? 'ALL',
        confidenceMin: confidenceMin != null ? Number(confidenceMin) : undefined,
        confidenceMax: confidenceMax != null ? Number(confidenceMax) : undefined,
        timeFrom,
        timeTo,
        tripId,
        snapshotId,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      }),
    );
  }

  @Get('facts/:factId')
  @ApiOperation({ summary: 'Fact detail + provenance (jobId / dataset / license)' })
  getFact(@Param('factId') factId: string) {
    return successResponse(this.worldState.getFact(factId));
  }

  @Get('stale-facts')
  @ApiOperation({ summary: 'Stale facts (exclude from HARD BLOCK)' })
  @ApiQuery({ name: 'tripId', required: false })
  listStale(@Query('tripId') tripId?: string) {
    return successResponse(this.worldState.listStaleFacts(tripId));
  }

  @Post('snapshots/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a snapshot for a trip (ops UI)',
    description:
      'Distinct from register. clone_latest copies newest; demo_tick seeds empty shell. Does not hit live road.is.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId'],
      properties: {
        tripId: { type: 'string' },
        mode: { type: 'string', enum: ['clone_latest', 'demo_tick'] },
        note: { type: 'string' },
      },
    },
  })
  generate(
    @Body()
    body: { tripId?: string; mode?: 'clone_latest' | 'demo_tick'; note?: string },
  ) {
    if (!body?.tripId?.trim()) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'tripId required');
    }
    const snap = this.worldState.generateSnapshot({
      tripId: body.tripId.trim(),
      mode: body.mode,
      note: body.note,
    });
    this.logger.log(`Generated snapshot ${snap.snapshotId} trip=${snap.tripId}`);
    return successResponse({
      snapshotId: snap.snapshotId,
      tripId: snap.tripId,
      revision: snap.revision,
      factCount: snap.worldFacts?.length ?? 0,
      createdAt: snap.createdAt,
    });
  }

  @Post('snapshots/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register a CanonicalWorldStateSnapshot into Knowledge Control Center',
    description: 'Ops / runtime bridge — does not replace Decision Runtime capture.',
  })
  @ApiBody({ description: 'CanonicalWorldStateSnapshot JSON' })
  register(@Body() body: CanonicalWorldStateSnapshot) {
    if (!body?.snapshotId || body.schemaId !== 'tripnara.canonical_world_state_snapshot@v1') {
      return errorResponse(
        ErrorCode.BAD_REQUEST,
        'Body must be CanonicalWorldStateSnapshot with schemaId + snapshotId',
      );
    }
    const registered = this.worldState.registerSnapshot(body);
    this.logger.log(`Registered snapshot ${registered.snapshotId} trip=${registered.tripId}`);
    return successResponse({
      snapshotId: registered.snapshotId,
      factCount: registered.worldFacts?.length ?? 0,
    });
  }
}
