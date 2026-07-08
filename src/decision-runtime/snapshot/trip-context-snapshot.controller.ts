import {
  Controller,
  Get,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripContextSnapshotAssemblerService } from './trip-context-snapshot.assembler.service';

@ApiTags('trip-context-snapshot')
@Public()
@Controller('trips/:tripId')
export class TripContextSnapshotController {
  constructor(
    private readonly assembler: TripContextSnapshotAssemblerService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('context-snapshot')
  @ApiOperation({
    summary: 'Trip Context Snapshot — 规划/验证/修复/重规划统一 SSOT',
    description:
      '聚合 Trip Goal、TravelDecisionContract、Effective Plan、Open Decisions、World Facts。' +
      '下游 Decision Run 应声明读取的 snapshotId + revision。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'persist',
    required: false,
    description: 'persist=1 时写入 RFC-001 world snapshot binding',
  })
  async getContextSnapshot(
    @Param('tripId') tripId: string,
    @Query('persist') persist?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const data = await this.assembler.assemble(tripId, {
        persistWorldBinding: persist === '1' || persist === 'true',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found') || message.includes('NOT_FOUND')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
