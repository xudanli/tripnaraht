/**
 * HTTP BFF: Trip Shell + Initial Plan Preview + Confirm.
 * Paths under /api/iceland-self-drive/trips (avoids TripsController collision).
 * Confirm never writes PlanVersion. Apply remains closed.
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { CreateIcelandTripShellDto } from './dto/create-iceland-trip-shell.dto';
import { ConfirmIcelandProposalDto } from './dto/confirm-iceland-proposal.dto';
import { ApplyIcelandProposalDto } from './dto/apply-iceland-proposal.dto';
import { IcelandInitialPlanPreviewService } from './services/iceland-initial-plan-preview.service';
import { resolveIcelandShellOwnerId } from './utils/iceland-shell-owner.util';

@ApiTags('Iceland Initial Plan Preview')
@Public()
@Controller('iceland-self-drive/trips')
export class IcelandInitialPlanPreviewController {
  constructor(private readonly preview: IcelandInitialPlanPreviewService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Iceland Trip Shell (no PlanVersion)' })
  createShell(
    @Body() body: CreateIcelandTripShellDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.createTripShell(ownerId, body);
  }

  @Post(':tripId/initial-plan/proposals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate Initial Plan Preview Proposal' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async createProposal(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.createProposal(ownerId, tripId, idempotencyKey);
  }

  @Post(':tripId/initial-plan/proposals/:proposalId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm Initial Plan Preview (acks only; opens Apply, no PlanVersion yet)',
  })
  confirmProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ConfirmIcelandProposalDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.confirmProposal(ownerId, tripId, proposalId, body);
  }

  @Post(':tripId/initial-plan/proposals/:proposalId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply confirmed Preview into Prisma Trip/ItineraryItem + Iceland PlanVersion (not OR-Tools)',
  })
  async applyProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ApplyIcelandProposalDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.applyProposal(ownerId, tripId, proposalId, body);
  }

  @Get(':tripId/initial-plan/proposals/current')
  @ApiOperation({ summary: 'Get current active Preview Proposal' })
  getCurrent(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.getCurrentProposal(ownerId, tripId);
  }

  @Get(':tripId/initial-plan/proposals/:proposalId/shadow-vs-platform')
  @ApiOperation({
    summary:
      'Full Shadow vs platform contrast report (calibration only; does not affect Confirm/Apply)',
  })
  getShadowVsPlatformContrast(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.getShadowVsPlatformContrast(
      ownerId,
      tripId,
      proposalId,
    );
  }

  @Get(':tripId/initial-plan/proposals/:proposalId')
  @ApiOperation({ summary: 'Get Initial Plan Preview by id' })
  getProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Headers('x-owner-id') ownerHeader?: string,
  ) {
    const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
    return this.preview.getProposal(ownerId, tripId, proposalId);
  }
}
