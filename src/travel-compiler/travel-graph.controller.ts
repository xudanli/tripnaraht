import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TravelGraphStoreService } from './services/travel-graph-store.service';
import { graphToItinerary } from './projection/graph-to-itinerary.util';
import { CTRE_API_TAG } from './constants/ctre.constants';

@ApiTags('Travel Graph', CTRE_API_TAG)
@Public()
@Controller('trips/:tripId')
export class TravelGraphController {
  constructor(
    private readonly store: TravelGraphStoreService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('travel-graph')
  @ApiOperation({
    summary: 'Canonical Travel Graph — Travel Compiler 产物（只读）',
    description:
      '读取 Trip.metadata 中最新编译的 CanonicalTravelGraph。' +
      '若尚未编译，返回 404。可选 include=compilation 附带完整 CompilationResult。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'include',
    required: false,
    description: 'include=compilation 时附带 travelCompilationResult',
  })
  async getTravelGraph(
    @Param('tripId') tripId: string,
    @Query('include') include?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const artifacts = await this.store.getArtifacts(tripId);
      if (!artifacts.graph) {
        return errorResponse(
          ErrorCode.NOT_FOUND,
          `No Canonical Travel Graph for trip ${tripId}. Run Travel Compiler first.`,
        );
      }

      const payload: Record<string, unknown> = { graph: artifacts.graph };
      if (include === 'compilation' || include === 'all') {
        payload.compilation = artifacts.compilation;
        payload.summary = artifacts.summary;
      }
      if (include === 'itinerary' || include === 'all') {
        payload.itinerary =
          artifacts.projectedItinerary ??
          (artifacts.graph ? graphToItinerary(artifacts.graph) : undefined);
      }

      return successResponse(payload);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found') || message.includes('NOT_FOUND')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
