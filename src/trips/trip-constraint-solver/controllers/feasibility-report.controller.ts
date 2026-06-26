import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { FeasibilityReportService } from '../services/feasibility-report.service';
import {
  FeasibilityApplyRepairBodyDto,
  FeasibilityPreviewRepairBodyDto,
  FeasibilityValidateScopeDto,
  ValidateFeasibilityBodyDto,
} from '../dto/feasibility-report.dto';

@ApiTags('trip-constraint-solver')
@Public()
@Controller('trips/:tripId/feasibility-report')
export class FeasibilityReportController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly feasibility: FeasibilityReportService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取整趟可执行性报告（Plan Validation 读模型）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getReport(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.getReport(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '触发整趟可执行性重验证并绑定行程版本' })
  async validate(
    @Param('tripId') tripId: string,
    @Body() body: ValidateFeasibilityBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.validate(tripId, {
        forceRefreshEvidence: body?.forceRefreshEvidence,
        lang: body?.lang,
        runMonteCarlo: body?.runMonteCarlo,
        monteCarloSampleSize: body?.monteCarloSampleSize,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('validate-scope')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '局部可执行性验证（单日 / 单 issue / 单路线）' })
  async validateScope(
    @Param('tripId') tripId: string,
    @Body() body: FeasibilityValidateScopeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.validateScope(tripId, body.scope);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('issues/:issueId/preview-repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修复预览 diff（修改前/后/影响）' })
  async previewRepair(
    @Param('tripId') tripId: string,
    @Param('issueId') issueId: string,
    @Body() body: FeasibilityPreviewRepairBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.previewRepair(tripId, issueId, body);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('issues/:issueId/apply-repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '应用修复（复用 readiness apply-repair）' })
  async applyRepair(
    @Param('tripId') tripId: string,
    @Param('issueId') issueId: string,
    @Body() body: FeasibilityApplyRepairBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.applyRepair(tripId, issueId, body);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('issues/:issueId/repair-options')
  @ApiOperation({
    summary: '获取问题的修复选项',
    description:
      'C 端首选 GET；issueId 与 feasibility-report.issues[].id 对齐，blockerId 为 readiness 语义（经 normalize 映射）',
  })
  @ApiParam({ name: 'issueId', description: 'feasibility issue id（≡ report.issues[].id）' })
  async getRepairOptions(
    @Param('tripId') tripId: string,
    @Param('issueId') issueId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.feasibility.getRepairOptions(tripId, issueId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      const msg = typeof resp === 'string' ? resp : (resp as { message?: string }).message ?? e.message;
      return errorResponse(ErrorCode.BAD_REQUEST, msg);
    }
    const err = e as Error;
    return errorResponse(ErrorCode.INTERNAL_ERROR, err?.message ?? '内部错误');
  }
}
