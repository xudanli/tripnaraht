import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { TripConstraintRegistryService } from '../services/trip-constraint-registry.service';
import {
  CreateTripConstraintDto,
  DisableConstraintDto,
  ListTripConstraintsQueryDto,
  PatchTripConstraintDto,
  PreviewConstraintImpactDto,
  RepairConstraintsDto,
} from '../dto/trip-constraint.dto';

@ApiTags('trip-constraints')
@Public()
@Controller('trips/:tripId/constraints')
export class TripConstraintsController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly registry: TripConstraintRegistryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '获取行程约束列表（统一 SSOT 读模型）',
    description:
      '合成 intent / budget / pacing / wishes / feasibility 为 TripConstraint[]；支持 type/category/status/conflictOnly 过滤',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async list(
    @Param('tripId') tripId: string,
    @Query() query: ListTripConstraintsQueryDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(
      async (userId) => this.registry.list(tripId, userId, query),
      user,
      tripId,
    );
  }

  @Post('preview-impact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预览约束变更影响',
    description: '默认不持久化；persist=true 时先写入再对比 planning-conflicts',
  })
  async previewImpact(
    @Param('tripId') tripId: string,
    @Body() body: PreviewConstraintImpactDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(
      (userId) => this.registry.previewImpact(tripId, userId, body),
      user,
      tripId,
    );
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检测约束与方案冲突',
    description: '委托 planning-conflicts BFF',
  })
  async check(@Param('tripId') tripId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.handle(() => this.registry.check(tripId), user, tripId);
  }

  @Post('repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成约束冲突修复建议',
    description: '委托 feasibility-report repair-options；缺省 issueId 取首个 must_handle',
  })
  async repair(
    @Param('tripId') tripId: string,
    @Body() body: RepairConstraintsDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(() => this.registry.repair(tripId, body), user, tripId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '新增约束',
    description:
      'CUSTOM 写入 metadata.unifiedConstraints；PRIVATE_WISH 写入 wishes；legacy 合成项请 PATCH 对应 ID',
  })
  async create(
    @Param('tripId') tripId: string,
    @Body() body: CreateTripConstraintDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle((userId) => this.registry.create(tripId, userId, body), user, tripId);
  }

  @Patch(':constraintId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改约束' })
  async patch(
    @Param('tripId') tripId: string,
    @Param('constraintId') constraintId: string,
    @Body() body: PatchTripConstraintDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(
      (userId) => this.registry.patch(tripId, userId, constraintId, body),
      user,
      tripId,
    );
  }

  @Delete(':constraintId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除约束（custom / 部分 legacy / wish）' })
  async remove(
    @Param('tripId') tripId: string,
    @Param('constraintId') constraintId: string,
    @Query('constraintsVersion') constraintsVersion?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const version =
      constraintsVersion != null && constraintsVersion !== ''
        ? Number(constraintsVersion)
        : undefined;
    return this.handle(
      (userId) => this.registry.remove(tripId, userId, constraintId, version),
      user,
      tripId,
    );
  }

  @Post(':constraintId/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停用约束（不删除存量字段）' })
  async disable(
    @Param('tripId') tripId: string,
    @Param('constraintId') constraintId: string,
    @Body() body: DisableConstraintDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(
      (userId) => this.registry.disable(tripId, userId, constraintId, body),
      user,
      tripId,
    );
  }

  private async handle<T>(
    fn: (userId: string) => Promise<T>,
    user: CurrentUserPayload | undefined,
    tripId: string,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await fn(userId));
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
          : { message: e.message };
      return errorResponse(payload.code ?? ErrorCode.BAD_REQUEST, payload.message ?? e.message);
    }
    if (e instanceof ConflictException) {
      const resp = e.getResponse();
      const payload =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e.message };
      return errorResponse(payload.code ?? 'CONSTRAINTS_STALE', payload.message ?? e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
