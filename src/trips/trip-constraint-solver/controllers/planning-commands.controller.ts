import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { TripConstraintCommandsService } from '../services/trip-constraint-commands.service';
import { PlanningConstraintsCommandDto } from '../dto/planning-commands.dto';

@ApiTags('trip-constraints')
@Public()
@Controller('trips/:tripId/planning')
export class PlanningCommandsController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly commands: TripConstraintCommandsService,
  ) {}

  @Post('commands')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '规划命令入口（UPDATE_CONSTRAINTS 批量写 + 可选重算）',
    description: 'PRD §11.8：批量更新约束并可选触发 route_and_run',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async executeCommand(
    @Param('tripId') tripId: string,
    @Body() body: PlanningConstraintsCommandDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.commands.execute(tripId, userId, body);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      const payload =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e instanceof Error ? e.message : String(e) };
      return errorResponse(payload.code ?? ErrorCode.BAD_REQUEST, payload.message ?? String(e));
    }
    if (e instanceof ConflictException) {
      const resp = e.getResponse();
      const payload =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e instanceof Error ? e.message : String(e) };
      return errorResponse(payload.code ?? 'CONSTRAINTS_STALE', payload.message ?? String(e));
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
