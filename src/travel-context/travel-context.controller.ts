import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../common/dto/standard-response.dto';
import {
  TRAVEL_CONTEXT_VIEW_NAMES,
  type TravelContextViewName,
} from './domain/travel-context.constants';
import type { TravelContextSnapshot, TravelContextViewEnvelope } from './domain/travel-context.types';
import { TravelContextProjectionResolverService } from './projections/travel-context-projection-resolver.service';
import { TravelContextResolverService } from './snapshot/travel-context-resolver.service';
import { TravelContextSnapshotBuilderService } from './snapshot/travel-context-snapshot-builder.service';
import { TravelContextSnapshotArchiveService } from './snapshot/travel-context-snapshot-archive.service';
import { SubmitTravelContextIntentDto } from './intents/dto/submit-travel-context-intent.dto';
import { TravelContextIntentService } from './intents/travel-context-intent.service';
import { TravelContextRevisionConflictException } from './intents/travel-context-revision-conflict.exception';
import { TravelContextDiffService } from './diff/travel-context-diff.service';
import { TravelContextEventsStreamService } from './events/travel-context-events-stream.service';

@ApiTags('travel-context')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('travel-contexts')
export class TravelContextController {
  constructor(
    private readonly builder: TravelContextSnapshotBuilderService,
    private readonly resolver: TravelContextResolverService,
    private readonly projections: TravelContextProjectionResolverService,
    private readonly intents: TravelContextIntentService,
    private readonly diffService: TravelContextDiffService,
    private readonly eventsStream: TravelContextEventsStreamService,
    private readonly snapshotArchive: TravelContextSnapshotArchiveService,
  ) {}

  @Get('resolve/by-trip/:tripId')
  @ApiOperation({
    summary: 'RFC-003 Phase 2 — Resolve contextId from tripId',
    description: 'Reads trip.metadata.travelContextId or explorationScenarioId.',
  })
  async resolveByTrip(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      const ref = await this.resolver.resolveByTripId(tripId);
      if (ref.ownerUserId !== user?.userId) {
        throw new ForbiddenException('无权访问该 Trip 的 Travel Context');
      }
      const snapshot = await this.builder.build(ref.contextId);
      return successResponse({
        contextId: ref.contextId,
        tripId: ref.tripId,
        scenarioId: ref.scenarioId,
        revision: snapshot.meta.revision,
        snapshotId: snapshot.meta.snapshotId,
        stage: snapshot.identity.stage,
        source: ref.source,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':contextId/intents')
  @ApiOperation({
    summary: 'RFC-003 Phase 3 — Submit typed intent (sole write path)',
    description:
      'Requires basedOnRevision matching current snapshot. Returns 409 REVISION_CONFLICT on stale revision.',
  })
  async submitIntent(
    @Param('contextId') contextId: string,
    @Body() body: SubmitTravelContextIntentDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const data = await this.intents.submit(contextId, user!.userId, body);
      return successResponse(data);
    } catch (e) {
      if (e instanceof TravelContextRevisionConflictException) {
        const payload = e.getResponse() as {
          code: string;
          message: string;
          details: Record<string, unknown>;
        };
        res.status(409);
        return errorResponse(ErrorCode.REVISION_CONFLICT, payload.message, payload.details);
      }
      if (e instanceof HttpException) {
        const status = e.getStatus();
        const payload = e.getResponse();
        if (typeof payload === 'object' && payload !== null && 'code' in payload) {
          const p = payload as { code: string; message: string; details?: Record<string, unknown> };
          res.status(status);
          return errorResponse(p.code, p.message, p.details);
        }
      }
      return this.handleError(e);
    }
  }

  @Get(':contextId/diff')
  @ApiOperation({
    summary: 'RFC-003 Phase 5 — Revision diff since client revision',
    description: 'Returns structured delta. Set requiresFullRefresh when journal gap — client should full refresh.',
  })
  async getDiff(
    @Param('contextId') contextId: string,
    @Query('sinceRevision') sinceRevision: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const since = Number(sinceRevision);
      if (!Number.isFinite(since)) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'sinceRevision query param is required');
      }
      const data = await this.diffService.getDiff(contextId, since);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':contextId/events')
  @ApiOperation({
    summary: 'RFC-003 Phase 5 — CONTEXT_REVISION_CHANGED SSE stream',
    description: 'Accept: text/event-stream. Client calls diff(sinceRevision) on each event.',
  })
  async streamEvents(
    @Param('contextId') contextId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      await this.assertAccess(contextId, user);
      this.eventsStream.stream(contextId, req, res);
    } catch (e) {
      if (!res.headersSent) {
        const payload = this.handleError(e);
        res.status(403).json(payload);
      }
    }
  }

  @Get(':contextId/snapshots')
  @ApiOperation({
    summary: 'RFC-003 Phase 7 — List archived snapshot heads (audit / replay index)',
  })
  async listSnapshotArchives(
    @Param('contextId') contextId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const parsedLimit = limit != null ? Number(limit) : 10;
      const heads = await this.snapshotArchive.listHeads(
        contextId,
        Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 32) : 10,
      );
      return successResponse({ contextId, archives: heads });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':contextId/snapshots/:revision')
  @ApiOperation({
    summary: 'RFC-003 Phase 7 — Load archived snapshot at revision (audit replay)',
  })
  async getSnapshotArchive(
    @Param('contextId') contextId: string,
    @Param('revision') revision: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const rev = Number(revision);
      if (!Number.isFinite(rev)) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'revision must be a number');
      }
      const snapshot = await this.snapshotArchive.getByRevision(contextId, rev);
      if (!snapshot) {
        return errorResponse(ErrorCode.NOT_FOUND, `No archived snapshot at revision ${rev}`);
      }
      return successResponse({
        ...snapshot,
        _archive: { replay: true, revision: rev },
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':contextId/views')
  @ApiOperation({ summary: 'RFC-003 Phase 2 — List available views at current revision' })
  async listViews(
    @Param('contextId') contextId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const snapshot = await this.builder.build(contextId);
      return successResponse({
        contextId: snapshot.identity.contextId,
        revision: snapshot.meta.revision,
        snapshotId: snapshot.meta.snapshotId,
        views: TRAVEL_CONTEXT_VIEW_NAMES.map((view) => ({
          view,
          path: `/api/travel-contexts/${contextId}/views/${view}`,
        })),
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':contextId')
  @ApiOperation({
    summary: 'RFC-003 — Travel Context Snapshot（完整 SSOT）',
    description:
      '探索阶段 contextId === scenarioId。materialize 后 tripId 写入 identity，contextId 不变。',
  })
  @ApiParam({ name: 'contextId', description: 'Travel context ID（V1 探索场景 = scenarioId）' })
  async getSnapshot(
    @Param('contextId') contextId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.assertAccess(contextId, user);
      const data: TravelContextSnapshot = await this.builder.build(contextId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':contextId/views/:viewName')
  @ApiOperation({ summary: 'RFC-003 — 页面级 Travel Context 投影' })
  async getView(
    @Param('contextId') contextId: string,
    @Param('viewName') viewName: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!TRAVEL_CONTEXT_VIEW_NAMES.includes(viewName as TravelContextViewName)) {
        return errorResponse(ErrorCode.BAD_REQUEST, `Unknown view: ${viewName}`);
      }
      await this.assertAccess(contextId, user);
      const snapshot = await this.builder.build(contextId);
      const envelope: TravelContextViewEnvelope = this.projections.resolve(
        snapshot,
        viewName as TravelContextViewName,
      );
      return successResponse(envelope);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertAccess(contextId: string, user?: CurrentUserPayload) {
    const userId = user?.userId;
    if (!userId?.trim()) {
      throw new UnauthorizedException('需要登录');
    }
    const ref = await this.resolver.resolve(contextId);
    if (ref.ownerUserId !== userId) {
      throw new ForbiddenException('无权访问该 Travel Context');
    }
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found') || message.includes('Not Found')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
