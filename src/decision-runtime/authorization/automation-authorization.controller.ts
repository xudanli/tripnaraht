import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { AutomationAuthorizationService } from './automation-authorization.service';
import {
  AutomationPolicyDto,
  ChangeStrategyProfileDto,
  TeamGovernancePolicyDto,
} from '../../trips/trip-constraint-solver/dto/travel-decision-contract.dto';
import type { AutomationAuthorizationScope } from './automation-authorization.types';

class SaveAutomationAuthorizationDto {
  @ApiProperty({ enum: ['TRIP', 'USER_TEMPLATE'] })
  @IsEnum(['TRIP', 'USER_TEMPLATE'])
  scope!: AutomationAuthorizationScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  automationPaused?: boolean;

  @ApiPropertyOptional({ type: AutomationPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationPolicyDto)
  automation?: AutomationPolicyDto;

  @ApiPropertyOptional({ type: ChangeStrategyProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChangeStrategyProfileDto)
  changeStrategy?: ChangeStrategyProfileDto;

  @ApiPropertyOptional({ type: TeamGovernancePolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TeamGovernancePolicyDto)
  teamGovernance?: TeamGovernancePolicyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resetToDefaults?: boolean;
}

class SetAutomationPausedDto {
  @ApiProperty()
  @IsBoolean()
  paused!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}

class SaveUserAutomationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  automationPaused?: boolean;

  @ApiPropertyOptional({ type: AutomationPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationPolicyDto)
  automation?: AutomationPolicyDto;

  @ApiPropertyOptional({ type: ChangeStrategyProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChangeStrategyProfileDto)
  changeStrategy?: ChangeStrategyProfileDto;

  @ApiPropertyOptional({ type: TeamGovernancePolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TeamGovernancePolicyDto)
  teamGovernance?: TeamGovernancePolicyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resetToDefaults?: boolean;
}

@ApiTags('automation-authorization')
@Public()
@Controller()
export class AutomationAuthorizationController {
  constructor(
    private readonly service: AutomationAuthorizationService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('trips/:tripId/automation-authorization')
  @ApiOperation({ summary: 'AI 自动执行授权中心 — 页面聚合读模型' })
  async getTripView(@Param('tripId') tripId: string, @CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.resolveUser(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.service.getView(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('trips/:tripId/automation-authorization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '保存授权规则（本行程或用户模板）' })
  async saveTrip(
    @Param('tripId') tripId: string,
    @Body() body: SaveAutomationAuthorizationDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUser(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.service.save(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('trips/:tripId/automation-authorization/reset-defaults')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复 catalog 默认授权' })
  async resetDefaults(@Param('tripId') tripId: string, @CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.resolveUser(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.service.resetDefaults(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('trips/:tripId/automation-authorization/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '暂停 / 恢复本行程自动执行' })
  async setPaused(
    @Param('tripId') tripId: string,
    @Body() body: SetAutomationPausedDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUser(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(
        await this.service.setPaused(tripId, userId, body.paused, body.constraintsVersion),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('users/me/automation-authorization-template')
  @ApiOperation({ summary: '获取用户默认自动化授权模板（全部我的行程）' })
  async getUserTemplate(@CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.resolveUser(user);
      return successResponse(await this.service.getUserTemplate(userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('users/me/automation-authorization-template')
  @ApiOperation({ summary: '更新用户默认自动化授权模板' })
  async saveUserTemplate(
    @Body() body: SaveUserAutomationTemplateDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUser(user);
      return successResponse(await this.service.saveUserTemplate(userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('users/me/automation-authorization-template/reset-defaults')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复用户默认模板为 catalog 默认值' })
  async resetUserTemplate(@CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.resolveUser(user);
      return successResponse(await this.service.saveUserTemplate(userId, { resetToDefaults: true }));
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUser(user?: CurrentUserPayload): string {
    const userId = this.access.resolveUserId(user);
    if (!userId) throw new UnauthorizedException('需要登录');
    return userId;
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found') || message.includes('NOT_FOUND')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    if (message.includes('STALE') || message.includes('409') || message.includes('CONSTRAINTS_STALE')) {
      return errorResponse(ErrorCode.BAD_REQUEST, message);
    }
    if (message.includes('required') || message.includes('invalid')) {
      return errorResponse(ErrorCode.BAD_REQUEST, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
