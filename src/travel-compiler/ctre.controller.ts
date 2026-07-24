import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse, ErrorCode, errorResponse } from '../common/dto/standard-response.dto';
import { CTRE_API_TAG } from './constants/ctre.constants';
import type { PlannerDraftIR } from './contracts/planner-draft-ir.types';
import type { TravelCompilerOptions } from './contracts/travel-compiler.types';
import { TravelCompilerService } from './travel-compiler.service';
import { TravelGraphStoreService } from './services/travel-graph-store.service';
import { ConstraintSolverAccessService } from '../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { graphToItinerary } from './projection/graph-to-itinerary.util';
import { buildCtreCompileProgressView } from './contracts/ctre-compile-progress.types';

class CtreCompileDto {
  draft!: PlannerDraftIR;
  options?: TravelCompilerOptions;
}

/**
 * CTRE 对外 API — Canonical Travel Resolution Engine（Travel Compiler 产品名）
 */
@ApiTags(CTRE_API_TAG)
@Controller()
@Public()
export class CtreController {
  constructor(
    private readonly compiler: TravelCompilerService,
    private readonly graphStore: TravelGraphStoreService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Post('travel/ctre/compile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'CTRE compile — PlannerDraftIR → CanonicalTravelGraph',
    description: '别名：POST /travel/compiler（engine=CTRE）',
  })
  async compile(@Body() body: CtreCompileDto) {
    const data = await this.compiler.compile(body.draft, body.options);
    return successResponse(data);
  }

  @Get('trips/:tripId/ctre/graph')
  @ApiOperation({
    summary: 'CTRE graph — CanonicalTravelGraph（只读）',
    description: '别名：GET /trips/:tripId/travel-graph；include=progress|all 附带编译进度',
  })
  @ApiParam({ name: 'tripId' })
  @ApiQuery({ name: 'include', required: false })
  async getGraph(
    @Param('tripId') tripId: string,
    @Query('include') include?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const artifacts = await this.graphStore.getArtifacts(tripId);
      if (!artifacts.graph) {
        return errorResponse(
          ErrorCode.NOT_FOUND,
          `No CTRE graph for trip ${tripId}. Run CTRE compile first.`,
        );
      }

      const payload: Record<string, unknown> = {
        engine: 'CTRE',
        graph: artifacts.graph,
      };
      if (include === 'compilation' || include === 'all') {
        payload.compilation = artifacts.compilation;
        payload.summary = artifacts.summary;
      }
      if (include === 'itinerary' || include === 'all') {
        payload.itinerary =
          artifacts.projectedItinerary ??
          (artifacts.graph ? graphToItinerary(artifacts.graph) : undefined);
      }
      if (include === 'progress' || include === 'all') {
        if (artifacts.compilation) {
          payload.ctre_compile_progress = buildCtreCompileProgressView(artifacts.compilation);
        }
      }

      return successResponse(payload);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found') || message.includes('NOT_FOUND')) {
        return errorResponse(ErrorCode.NOT_FOUND, message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('trips/:tripId/ctre/compile-progress')
  @ApiOperation({ summary: 'CTRE 编译进度面板数据（phaseReports 投影）' })
  @ApiParam({ name: 'tripId' })
  async getCompileProgress(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const artifacts = await this.graphStore.getArtifacts(tripId);
      if (!artifacts.compilation) {
        return errorResponse(ErrorCode.NOT_FOUND, `No CTRE compilation for trip ${tripId}`);
      }
      return successResponse({
        engine: 'CTRE',
        progress: buildCtreCompileProgressView(artifacts.compilation),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found') || message.includes('NOT_FOUND')) {
        return errorResponse(ErrorCode.NOT_FOUND, message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}
