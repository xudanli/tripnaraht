/**
 * Driving-settings GET/PATCH backed by in-memory Trip Shell (not Prisma Trip).
 * Same soft-auth as Preview; PATCH bumps context and regenerates Preview.
 */

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PatchIcelandSelfDriveDrivingSettingsDto } from '../dto/patch-driving-settings.dto';
import type { IcelandTripShellContextPayload } from '../types/iceland-trip-shell-preview.types';
import {
  buildDrivingSettingsResponse,
  mergeDrivingSettings,
  type IcelandSelfDriveDrivingSettingsResponse,
} from './iceland-self-drive-driving-settings.util';
import {
  ensureShellDrivingSettings,
  syncVehicleProfileFromSettings,
} from '../utils/iceland-shell-driving-settings.util';
import { IcelandTripShellRepository } from './iceland-trip-shell.repository';
import { IcelandStoredProposalRepository } from './iceland-stored-proposal.repository';
import { IcelandInitialPlanPreviewService } from './iceland-initial-plan-preview.service';

export type ShellDrivingSettingsPatchResult =
  IcelandSelfDriveDrivingSettingsResponse & {
    contextHash: string;
    previewRegenerated: boolean;
    activeProposalId?: string;
    writesPlanVersion: false;
  };

@Injectable()
export class IcelandShellDrivingSettingsService {
  private readonly logger = new Logger(IcelandShellDrivingSettingsService.name);

  constructor(
    private readonly shells: IcelandTripShellRepository,
    private readonly proposals: IcelandStoredProposalRepository,
    private readonly preview: IcelandInitialPlanPreviewService,
  ) {}

  get(ownerId: string, tripId: string): IcelandSelfDriveDrivingSettingsResponse {
    const shell = this.requireOwnedShell(ownerId, tripId);
    const settings = ensureShellDrivingSettings(shell.contextPayload);
    return buildDrivingSettingsResponse({
      tripId,
      contextVersion: String(shell.contextVersion),
      settings,
      regionIds: shell.contextPayload.regionIds ?? [],
      members: [
        {
          memberId: ownerId,
          displayName: 'Owner',
          initial: 'O',
          avatarUrl: null,
        },
      ],
      routeSkeleton: null,
    });
  }

  async patch(
    ownerId: string,
    tripId: string,
    dto: PatchIcelandSelfDriveDrivingSettingsDto,
  ): Promise<ShellDrivingSettingsPatchResult> {
    const shell = this.requireOwnedShell(ownerId, tripId);
    if (shell.creationStatus === 'ITINERARY_APPLIED') {
      throw new ConflictException({
        code: 'ALREADY_APPLIED',
        message: 'Cannot patch driving-settings after Apply; use prisma trip APIs',
      });
    }

    const current = ensureShellDrivingSettings(shell.contextPayload);
    const nextSettings = mergeDrivingSettings(current, {
      vehicle: dto.vehicle,
      drivers: dto.drivers,
      members: dto.members,
      routePreference: dto.routePreference,
      fuel: dto.fuel,
      insurance: dto.insurance,
    });

    const nextPayload: IcelandTripShellContextPayload = {
      ...shell.contextPayload,
      drivingSettings: nextSettings,
      vehicleProfile: syncVehicleProfileFromSettings(
        nextSettings,
        shell.contextPayload.vehicleProfile,
      ),
      preferences: {
        ...shell.contextPayload.preferences,
        ...(nextSettings.drivers.dailyDrivingLimitHours != null
          ? {
              dailyDrivingLimitMin: Math.round(
                nextSettings.drivers.dailyDrivingLimitHours * 60,
              ),
            }
          : {}),
      },
    };

    const contextVersion = shell.contextVersion + 1;
    const contextHash = hashJson({
      dates: shell.travelDates,
      ...nextPayload,
    });

    this.proposals.markAllStaleForTrip(tripId);
    this.shells.update(tripId, {
      contextPayload: nextPayload,
      contextVersion,
      contextHash,
      activeProposalId: undefined,
      creationStatus: 'CONTEXT_SAVED',
    });

    this.logger.log(
      `Shell driving-settings patched trip=${tripId} contextVersion=${contextVersion} regeneratingPreview=true`,
    );

    let activeProposalId: string | undefined;
    let previewRegenerated = false;
    try {
      const created = await this.preview.createProposal(
        ownerId,
        tripId,
        `settings-patch:v${contextVersion}:${contextHash}`,
      );
      activeProposalId = created.proposalId;
      previewRegenerated = true;
    } catch (err) {
      this.logger.warn(
        `Preview regen after shell settings patch failed trip=${tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const response = buildDrivingSettingsResponse({
      tripId,
      contextVersion: String(contextVersion),
      settings: nextSettings,
      regionIds: nextPayload.regionIds ?? [],
      members: [
        {
          memberId: ownerId,
          displayName: 'Owner',
          initial: 'O',
          avatarUrl: null,
        },
      ],
      routeSkeleton: null,
    });

    return {
      ...response,
      contextHash,
      previewRegenerated,
      activeProposalId,
      writesPlanVersion: false,
    };
  }

  private requireOwnedShell(ownerId: string, tripId: string) {
    const shell = this.shells.get(tripId);
    if (!shell) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: 'Trip shell not found',
      });
    }
    if (shell.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not trip owner',
      });
    }
    return shell;
  }
}

function hashJson(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
}
