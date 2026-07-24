import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import {
  buildMobileEnvelopeMeta,
  mobileErrorResponse,
  mobileSuccessResponse,
} from '../utils/mobile-envelope.util';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { MobilePlanningService } from '../services/mobile-planning.service';
import { MobileSpatialRouteService } from '../services/mobile-spatial-route.service';
import { AttractionExploreAutoArrangeDto } from '../../trips/attraction-explore/dto/attraction-explore.dto';
import { AttractionExploreOrchestratorService } from '../../trips/attraction-explore/services/attraction-explore-orchestrator.service';
import { ContextualRecommendationsService } from '../../trips/contextual-recommendations/services/contextual-recommendations.service';
import {
  ContextualRecommendationsRequestDto,
  ContextualRecommendationsCommitDto,
} from '../../trips/contextual-recommendations/dto/contextual-recommendations.dto';
import {
  isSameDayActivitiesMode,
  mapTodayActivitiesQueryToRecommendBody,
} from '../../trips/contextual-recommendations/utils/today-activities-query.util';
import type {
  AddSpatialLocationBodyDto,
  InsertSpatialCandidateBodyDto,
  PatchDayThemeBodyDto,
  PatchDayThemesBodyDto,
  AddPlanningActivityBodyDto,
} from '../dto/mobile-planning.types';

@ApiTags('mobile-planning')
@Public()
@Controller('mobile/trips/:tripId')
export class MobilePlanningController {
  constructor(
    private readonly planning: MobilePlanningService,
    private readonly spatial: MobileSpatialRouteService,
    private readonly access: ConstraintSolverAccessService,
    private readonly attractionExplore: AttractionExploreOrchestratorService,
    private readonly contextualRecommendations: ContextualRecommendationsService,
  ) {}

  @Get('spatial-route')
  @ApiOperation({
    summary: 'iOS 规划阶段「空间路线」Tab 聚合读（含 map，折线 [lng,lat]）',
  })
  async getSpatialRoute(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.getSpatialRoute(tripId, this.access.resolveUserId(user), {
        dayIndex: this.parseOptionalInt(dayIndexRaw),
      }),
    );
  }

  @Get('planning/spatial/search')
  @ApiOperation({ summary: '空间路线 POI 搜索' })
  async searchSpatial(
    @Param('tripId') tripId: string,
    @Query('q') q?: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @Query('lat') latRaw?: string,
    @Query('lng') lngRaw?: string,
    @Query('limit') limitRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.searchSpatialPois(tripId, this.access.resolveUserId(user), {
        q,
        dayIndex: this.parseOptionalInt(dayIndexRaw),
        lat: this.parseOptionalFloat(latRaw),
        lng: this.parseOptionalFloat(lngRaw),
        limit: this.parseOptionalInt(limitRaw),
      }),
    );
  }

  @Get('planning/spatial/candidates/:poiId')
  @ApiOperation({ summary: '空间路线候选 POI 详情' })
  async getSpatialCandidate(
    @Param('tripId') tripId: string,
    @Param('poiId') poiId: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.getSpatialCandidate(tripId, this.access.resolveUserId(user), poiId, {
        dayIndex: this.parseOptionalInt(dayIndexRaw),
      }),
    );
  }

  @Get('planning/spatial/road-risks')
  @ApiOperation({ summary: '空间路线道路风险详情' })
  async getRoadRisks(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.getRoadRisks(tripId, this.access.resolveUserId(user)),
    );
  }

  @Post('planning/spatial/candidates/:poiId/insert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '将候选 POI 插入 Active Plan' })
  async insertSpatialCandidate(
    @Param('tripId') tripId: string,
    @Param('poiId') poiId: string,
    @Body() body: InsertSpatialCandidateBodyDto,
    @Headers('if-match') ifMatchRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.insertSpatialCandidate(
        tripId,
        this.access.resolveUserId(user),
        poiId,
        body ?? ({} as InsertSpatialCandidateBodyDto),
        {
          ifMatch: this.parseOptionalInt(ifMatchRaw),
          idempotencyKey,
        },
      ),
    );
  }

  @Post('planning/spatial/locations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '添加自定义地图地点到行程日' })
  async addSpatialLocation(
    @Param('tripId') tripId: string,
    @Body() body: AddSpatialLocationBodyDto,
    @Headers('if-match') ifMatchRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.addSpatialLocation(
        tripId,
        this.access.resolveUserId(user),
        body ?? ({} as AddSpatialLocationBodyDto),
        {
          ifMatch: this.parseOptionalInt(ifMatchRaw),
          idempotencyKey,
        },
      ),
    );
  }

  @Get('planning/route-blueprint')
  @ApiOperation({
    summary: 'iOS 规划阶段「路线蓝图」（按天结构摘要，非地图几何）',
  })
  async getRouteBlueprint(
    @Param('tripId') tripId: string,
    @Query('locale') locale?: string,
    @Query('focusDayNumber') focusDayRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.getRouteBlueprint(tripId, this.access.resolveUserId(user), {
        locale,
        focusDayNumber: this.parseOptionalInt(focusDayRaw),
      }),
    );
  }

  @Get('planning/today-activities')
  @ApiOperation({
    summary:
      '今日活动（情境微规划）GET 引导入口 → contextual-recommendations；正式请用 POST',
  })
  async getTodayActivities(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @Query('intent') intent?: string,
    @Query('energy') energy?: string,
    @Query('intensity') intensity?: string,
    @Query('returnBy') returnBy?: string,
    @Query('availableUntil') availableUntil?: string,
    @Query('tripPhase') tripPhase?: string,
    @Query('lat') latRaw?: string,
    @Query('lng') lngRaw?: string,
    @Query('locationLabel') locationLabel?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      await this.access.assertTripMember(tripId, this.access.resolveUserId(user));
      const body = mapTodayActivitiesQueryToRecommendBody({
        dayIndex: this.parseOptionalInt(dayIndexRaw),
        intent,
        energy,
        intensity,
        returnBy,
        availableUntil,
        tripPhase,
        lat: this.parseOptionalFloat(latRaw),
        lng: this.parseOptionalFloat(lngRaw),
        locationLabel,
      });
      const data = await this.contextualRecommendations.recommend(tripId, body);
      return { ...data, apiKind: 'CONTEXTUAL_SAME_DAY' as const };
    });
  }

  @Get('planning/activities/recommendations')
  @ApiOperation({
    summary:
      '景点探索推荐（默认）｜mode=same_day / sameDay=1 时改走今日情境微规划（迁移别名）',
  })
  async getActivityRecommendations(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @Query('themeIds') themeIds?: string,
    @Query('suitabilityIds') suitabilityIds?: string,
    @Query('viewTab') viewTab?: string,
    @Query('mode') mode?: string,
    @Query('sameDay') sameDay?: string,
    @Query('intent') intent?: string,
    @Query('energy') energy?: string,
    @Query('intensity') intensity?: string,
    @Query('returnBy') returnBy?: string,
    @Query('lat') latRaw?: string,
    @Query('lng') lngRaw?: string,
    @Query('locationLabel') locationLabel?: string,
    @Query('tripPhase') tripPhase?: string,
    @Query('quickFilter') quickFilter?: string,
    @Query('quickFilterIds') quickFilterIds?: string,
    @Query('sort') sort?: string,
    @Query('q') q?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    if (isSameDayActivitiesMode({ mode, sameDay })) {
      return this.run(tripId, user, async () => {
        await this.access.assertTripMember(tripId, this.access.resolveUserId(user));
        const body = mapTodayActivitiesQueryToRecommendBody({
          dayIndex: this.parseOptionalInt(dayIndexRaw),
          intent,
          energy,
          intensity,
          returnBy,
          tripPhase,
          lat: this.parseOptionalFloat(latRaw),
          lng: this.parseOptionalFloat(lngRaw),
          locationLabel,
        });
        const data = await this.contextualRecommendations.recommend(tripId, body);
        return {
          ...data,
          apiKind: 'CONTEXTUAL_SAME_DAY' as const,
          migrationHint:
            'Prefer POST /planning/contextual-recommendations；本 GET 仅为 same_day 迁移别名',
        };
      });
    }

    return this.run(tripId, user, () =>
      this.attractionExplore.getRecommendations(tripId, this.access.resolveUserId(user), {
        dayIndex: this.parseOptionalInt(dayIndexRaw),
        themeIds,
        suitabilityIds,
        viewTab: viewTab as 'recommended' | 'map' | 'along_route' | undefined,
        quickFilter,
        quickFilterIds,
        sort: sort as 'smart' | 'distance' | 'match' | 'open_now' | undefined,
        q,
        lat: this.parseOptionalFloat(latRaw),
        lng: this.parseOptionalFloat(lngRaw),
      }),
    );
  }

  @Post('planning/activities')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '添加活动页「加入今天」— dayIndex + placeId/attractionId' })
  async addPlanningActivity(
    @Param('tripId') tripId: string,
    @Body() body: AddPlanningActivityBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.addPlanningActivity(
        tripId,
        this.access.resolveUserId(user),
        body ?? ({} as AddPlanningActivityBodyDto),
      ),
    );
  }

  @Post('planning/contextual-recommendations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '情境化当天微规划（Context Delta + 后端权威上下文 → 1 主方案 + ≤2 备选；ADR-009）',
  })
  async postContextualRecommendations(
    @Param('tripId') tripId: string,
    @Body() body: ContextualRecommendationsRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      await this.access.assertTripMember(tripId, this.access.resolveUserId(user));
      return this.contextualRecommendations.recommend(
        tripId,
        body ?? ({ scenario: 'SAME_DAY_ACTIVITY' } as ContextualRecommendationsRequestDto),
      );
    });
  }

  @Post('planning/contextual-recommendations/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '将情境微规划写入当天行程（需 If-Match + Idempotency-Key）',
  })
  async commitContextualRecommendations(
    @Param('tripId') tripId: string,
    @Body() body: ContextualRecommendationsCommitDto,
    @Headers('if-match') ifMatchRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.commitContextualRecommendation(
        tripId,
        this.access.resolveUserId(user),
        body ?? ({} as ContextualRecommendationsCommitDto),
        {
          ifMatch: this.parseOptionalInt(ifMatchRaw),
          idempotencyKey,
        },
      ),
    );
  }

  @Patch('planning/day-themes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量更新多日主题（metadata.dayThemes）' })
  async patchDayThemes(
    @Param('tripId') tripId: string,
    @Body() body: PatchDayThemesBodyDto,
    @Headers('if-match') ifMatchRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.updateDayThemesBatch(
        tripId,
        this.access.resolveUserId(user),
        body ?? ({} as PatchDayThemesBodyDto),
        {
          ifMatch: this.parseOptionalInt(ifMatchRaw),
          idempotencyKey,
        },
      ),
    );
  }

  @Patch('planning/days/:dayIndex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新单日主题（metadata.dayThemes，不改行程项/几何）' })
  async patchDayTheme(
    @Param('tripId') tripId: string,
    @Param('dayIndex') dayIndexRaw: string,
    @Body() body: PatchDayThemeBodyDto,
    @Headers('if-match') ifMatchRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.updateDayTheme(
        tripId,
        this.access.resolveUserId(user),
        this.parseOptionalInt(dayIndexRaw) ?? Number.NaN,
        body ?? ({} as PatchDayThemeBodyDto),
        {
          ifMatch: this.parseOptionalInt(ifMatchRaw),
          idempotencyKey,
        },
      ),
    );
  }

  @Get('planning/team-status')
  @ApiOperation({
    summary: 'iOS 规划阶段团队规划状态（偏好完成度，非执行 Presence）',
  })
  async getTeamStatus(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.getTeamStatus(tripId, this.access.resolveUserId(user)),
    );
  }

  @Post('planning/auto-arrange')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      '规划自动编排别名 → attraction-explore/auto-arrange（同一 proposal 契约）',
  })
  async autoArrange(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreAutoArrangeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.autoArrange(tripId, this.access.resolveUserId(user), body ?? {}),
    );
  }

  private parseOptionalInt(raw?: string): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  private parseOptionalFloat(raw?: string): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  private async run<T>(tripId: string, user: CurrentUserPayload | undefined, fn: () => Promise<T>) {
    const requestId = randomUUID();
    try {
      this.access.resolveUserId(user);
      const data = await fn();
      return mobileSuccessResponse(data, buildMobileEnvelopeMeta(tripId, data, requestId));
    } catch (e) {
      return this.handleError(e, tripId, requestId);
    }
  }

  private handleError(e: unknown, tripId: string, requestId: string) {
    const meta = buildMobileEnvelopeMeta(tripId, undefined, requestId);
    if (e instanceof UnauthorizedException) {
      return mobileErrorResponse(ErrorCode.UNAUTHORIZED, e.message, meta);
    }
    if (e instanceof ForbiddenException) {
      return mobileErrorResponse(ErrorCode.FORBIDDEN, e.message, meta);
    }
    if (e instanceof NotFoundException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(row.code ?? ErrorCode.NOT_FOUND, row.message ?? e.message, meta);
      }
      return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(
          row.code ?? ErrorCode.VALIDATION_ERROR,
          row.message ?? e.message,
          meta,
        );
      }
      return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, e.message, meta);
    }
    if (e instanceof ConflictException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as {
          code?: string;
          message?: string;
          currentContextVersion?: number;
        };
        return mobileErrorResponse(
          row.code ?? 'CONTEXT_VERSION_CONFLICT',
          row.message ?? e.message,
          {
            ...meta,
            contextVersion: row.currentContextVersion,
          },
          row.currentContextVersion != null
            ? { currentContextVersion: row.currentContextVersion }
            : undefined,
        );
      }
      return mobileErrorResponse('CONTEXT_VERSION_CONFLICT', e.message, meta);
    }
    const message = e instanceof Error ? e.message : String(e);
    return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
  }
}
