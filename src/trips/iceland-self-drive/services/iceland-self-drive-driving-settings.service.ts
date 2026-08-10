import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  PatchIcelandSelfDriveDrivingSettingsDto,
  PreviewDrivingSettingsImpactDto,
  ReevaluateDrivingSettingsDto,
} from '../dto/patch-driving-settings.dto';
import { readIcelandSelfDriveMetadata } from './iceland-self-drive-response.util';
import {
  bootstrapIcelandSelfDriveMetadata,
  isIcelandSelfDriveProductTrip,
} from './iceland-self-drive-metadata-hydrate.util';
import {
  buildDrivingSettingsResponse,
  bumpContextVersion,
  mergeDrivingSettings,
  previewVehicleImpact,
  type IcelandSelfDriveDrivingSettingsResponse,
  type IcelandSelfDriveVehicleImpactPreview,
} from './iceland-self-drive-driving-settings.util';
import type {
  IcelandSelfDriveTripMetadata,
  IcelandSelfDriveVehicleDocumentRecord,
} from '../types/iceland-self-drive.types';
import {
  createVehicleDocumentRecord,
  type VehicleDocumentUploadInput,
} from './iceland-self-drive-vehicle-document.util';
import { normalizeDrivingSettingsState } from './iceland-self-drive-completion.util';
import { normalizeDriverCandidate } from './iceland-self-drive-driving-settings-extend.util';
import type { TripMemberProfile } from './iceland-self-drive-driving-settings-view.util';
import {
  enrichCandidatesFromProjections,
  loadUserDrivingDefaultsProjection,
  type UserDrivingDefaultsProjection,
} from './iceland-self-drive-user-defaults-projection.util';
import { mirrorDrivingSettingsIntoConstraints } from '../../../decision-runtime/decision-cases/utils/decision-driving-settings-sync.util';
import { DecisionCaseService } from '../../../decision-runtime/decision-cases/services/decision-case.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  emitSelfDriveReadinessChanged,
  stampReadinessInvalidationOnMeta,
} from './iceland-self-drive-readiness-notify.util';

@Injectable()
export class IcelandSelfDriveDrivingSettingsService {
  private readonly logger = new Logger(IcelandSelfDriveDrivingSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => DecisionCaseService))
    private readonly decisionCases?: DecisionCaseService,
  ) {}

  async get(
    userId: string,
    tripId: string,
  ): Promise<IcelandSelfDriveDrivingSettingsResponse> {
    const { isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const members = await this.loadTripMembers(tripId);
    const settings = normalizeDrivingSettingsState(
      isd.drivingSettings,
      isd.wizard.vehicleAcquisition,
    );
    const projections = await this.loadMemberProjections(members.map((m) => m.memberId));
    const enrichedCandidates = enrichCandidatesFromProjections(
      settings.drivers.candidates,
      projections,
    );
    // Also seed synthetic candidate stubs for members with no stored state so GET shows defaults.
    const stateById = new Map(enrichedCandidates.map((c) => [c.memberId, c]));
    for (const m of members) {
      if (stateById.has(m.memberId)) continue;
      const p = projections.get(m.memberId);
      if (!p) continue;
      enrichedCandidates.push({
        memberId: m.memberId,
        isSelected: false,
        role: 'none',
        snowExperience: p.drivers.snowExperience,
        gravelExperience: p.drivers.gravelExperience,
        nightAcceptance: p.drivers.nightAcceptance,
        isAdditionalDriver: false,
      });
    }

    return buildDrivingSettingsResponse({
      tripId,
      contextVersion: isd.contextVersion,
      settings: {
        ...settings,
        drivers: { ...settings.drivers, candidates: enrichedCandidates },
      },
      regionIds: isd.wizard.regionIds,
      members,
      routeSkeleton: isd.routeSkeleton,
    });
  }

  async patch(
    userId: string,
    tripId: string,
    dto: PatchIcelandSelfDriveDrivingSettingsDto,
  ): Promise<IcelandSelfDriveDrivingSettingsResponse> {
    const { tripMeta, isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const members = await this.loadTripMembers(tripId);
    const memberIds = new Set(members.map((m) => m.memberId));

    if (dto.drivers?.candidates?.length) {
      for (const c of dto.drivers.candidates) {
        if (!memberIds.has(c.memberId)) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: `Unknown memberId in drivers.candidates: ${c.memberId}`,
          });
        }
      }
      const normalized = dto.drivers.candidates
        .map(normalizeDriverCandidate)
        .filter((c): c is NonNullable<typeof c> => c != null);
      const mains = normalized.filter((c) => c.isSelected && c.role === 'main');
      if (normalized.some((c) => c.isSelected) && mains.length !== 1) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Exactly one selected candidate must have role=main',
        });
      }
    }

    if (dto.fuel) {
      const useDynamic = dto.fuel.useDynamicSafetyMargin !== false;
      if (
        dto.fuel.useDynamicSafetyMargin === false &&
        (dto.fuel.safetyMarginPercent == null ||
          dto.fuel.safetyMarginPercent < 10 ||
          dto.fuel.safetyMarginPercent > 40)
      ) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message:
            'fuel.safetyMarginPercent required in [10,40] when useDynamicSafetyMargin=false',
        });
      }
      void useDynamic;
    }

    const nextSettings = mergeDrivingSettings(isd.drivingSettings, {
      vehicle: dto.vehicle,
      drivers: dto.drivers,
      members: dto.members,
      routePreference: dto.routePreference,
      fuel: dto.fuel,
      insurance: dto.insurance,
    });

    const nextIsd: IcelandSelfDriveTripMetadata = {
      ...isd,
      drivingSettings: nextSettings,
      contextVersion: bumpContextVersion(isd.contextVersion),
      wizard: {
        ...isd.wizard,
        vehicleAcquisition:
          dto.vehicle?.acquisition ?? isd.wizard.vehicleAcquisition,
      },
      lastEvents: [
        ...(isd.lastEvents ?? []),
        {
          type: 'driving_settings_updated',
          at: new Date().toISOString(),
          message: dto.reevaluate ? 'reevaluate_requested' : undefined,
        },
      ],
    };

    await this.persistIsdWithConstraintMirror(tripId, tripMeta, nextIsd, {
      vehicleTouched: Boolean(dto.vehicle),
      insuranceTouched: Boolean(dto.insurance),
    });

    this.logger.log(
      `Patched driving-settings trip=${tripId} contextVersion=${nextIsd.contextVersion} reevaluate=${dto.reevaluate === true}`,
    );

    if (this.decisionCases) {
      try {
        await this.decisionCases.ensureAndCollectRows(tripId);
      } catch (err) {
        this.logger.warn(
          `decision ensure after driving-settings patch failed trip=${tripId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return buildDrivingSettingsResponse({
      tripId,
      contextVersion: nextIsd.contextVersion,
      settings: nextSettings,
      regionIds: nextIsd.wizard.regionIds,
      members,
      routeSkeleton: nextIsd.routeSkeleton,
    });
  }

  async previewImpact(
    userId: string,
    tripId: string,
    dto: PreviewDrivingSettingsImpactDto,
  ): Promise<IcelandSelfDriveVehicleImpactPreview> {
    const { isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const current = normalizeDrivingSettingsState(
      isd.drivingSettings,
      isd.wizard.vehicleAcquisition,
    );
    const draft = mergeDrivingSettings(current, {
      vehicle: dto.vehicle,
      routePreference: dto.routePreference,
      fuel: dto.fuel,
      insurance: dto.insurance,
    });
    return previewVehicleImpact({
      regionIds: isd.wizard.regionIds,
      vehicle: draft.vehicle,
      routePreference: draft.routePreference,
    });
  }

  async reevaluate(
    userId: string,
    tripId: string,
    dto: ReevaluateDrivingSettingsDto,
  ): Promise<{
    proposalId: string | null;
    status: 'queued' | 'unsupported';
    summaryZh: string;
    previewBullets: string[];
    contextVersion: string;
  }> {
    const { tripMeta, isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const settings = normalizeDrivingSettingsState(
      isd.drivingSettings,
      isd.wizard.vehicleAcquisition,
    );
    const nextVersion = bumpContextVersion(isd.contextVersion);
    const nextIsd: IcelandSelfDriveTripMetadata = {
      ...isd,
      contextVersion: nextVersion,
      lastEvents: [
        ...(isd.lastEvents ?? []),
        {
          type: 'trip_context_changed',
          at: new Date().toISOString(),
          message: `reevaluate:${dto.source ?? 'driving_settings'}:${dto.reason ?? 'manual'}`,
        },
      ],
    };
    await this.persistIsd(tripId, tripMeta, nextIsd);

    const bullets: string[] = [];
    if (
      settings.routePreference.fRoadPreference === 'avoid' ||
      settings.vehicle.rentalRestrictions.includes('no_f_road')
    ) {
      bullets.push('Day 4 F208 路段可能需要替换');
    }
    if (settings.vehicle.rentalRestrictions.includes('no_wading')) {
      bullets.push('涉水路段相关活动可能需要替换');
    }
    if (bullets.length === 0) {
      bullets.push('1 个活动可能需要替换');
    }

    // P0：契约形状冻结；完整草案生成后续接 decision/proposal 管线
    return {
      proposalId: null,
      status: 'queued',
      summaryZh: '将基于当前保险与车辆限制生成行程调整草案',
      previewBullets: bullets,
      contextVersion: nextVersion,
    };
  }

  async uploadVehicleDocument(
    userId: string,
    tripId: string,
    input: VehicleDocumentUploadInput,
  ): Promise<IcelandSelfDriveVehicleDocumentRecord> {
    const { tripMeta, isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const record = createVehicleDocumentRecord(input);
    const nextIsd: IcelandSelfDriveTripMetadata = {
      ...isd,
      contextVersion: bumpContextVersion(isd.contextVersion),
      vehicleDocuments: {
        ...(isd.vehicleDocuments ?? {}),
        [record.docId]: record,
      },
      lastEvents: [
        ...(isd.lastEvents ?? []),
        {
          type: 'driving_settings_updated',
          at: new Date().toISOString(),
          message: `vehicle_document_uploaded:${record.docId}`,
        },
      ],
    };
    await this.persistIsd(tripId, tripMeta, nextIsd);
    this.logger.log(
      `Uploaded vehicle document trip=${tripId} docId=${record.docId} status=${record.status}`,
    );
    return record;
  }

  async getVehicleDocument(
    userId: string,
    tripId: string,
    docId: string,
  ): Promise<IcelandSelfDriveVehicleDocumentRecord> {
    const { isd } = await this.requireOwnedIcelandTrip(userId, tripId);
    const doc = isd.vehicleDocuments?.[docId];
    if (!doc) {
      throw new NotFoundException({
        code: 'VEHICLE_DOCUMENT_NOT_FOUND',
        message: `Vehicle document ${docId} not found`,
      });
    }
    return doc;
  }

  private async loadTripMembers(tripId: string): Promise<TripMemberProfile[]> {
    const collabs = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (collabs.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: collabs.map((c) => c.userId) } },
      select: { id: true, displayName: true, email: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return collabs.map((c) => {
      const u = byId.get(c.userId);
      const displayName =
        u?.displayName?.trim() ||
        u?.email?.split('@')[0] ||
        '成员';
      const initial = displayName.charAt(0).toUpperCase();
      return {
        memberId: c.userId,
        displayName,
        initial,
        avatarUrl: u?.avatarUrl ?? null,
        licenseVerified: false,
        profileComplete: Boolean(u?.displayName),
      };
    });
  }

  private async loadMemberProjections(
    memberIds: string[],
  ): Promise<Map<string, UserDrivingDefaultsProjection>> {
    const map = new Map<string, UserDrivingDefaultsProjection>();
    await Promise.all(
      memberIds.map(async (id) => {
        const p = await loadUserDrivingDefaultsProjection(this.prisma, id);
        if (p) map.set(id, p);
      }),
    );
    return map;
  }

  private async persistIsd(
    tripId: string,
    tripMeta: unknown,
    nextIsd: IcelandSelfDriveTripMetadata,
  ) {
    const prev = { ...((tripMeta as Record<string, unknown>) ?? {}) };
    const readinessCv = stampReadinessInvalidationOnMeta(
      prev,
      nextIsd.contextVersion,
    );
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...prev,
          icelandSelfDrive: nextIsd,
          productLine: 'iceland_self_drive',
        }),
        updatedAt: new Date(),
      },
    });
    emitSelfDriveReadinessChanged(tripId, readinessCv);
  }

  /** Persist drivingSettings and mirror vehicle/insurance/route into constraints. */
  private async persistIsdWithConstraintMirror(
    tripId: string,
    tripMeta: unknown,
    nextIsd: IcelandSelfDriveTripMetadata,
    flags: { vehicleTouched: boolean; insuranceTouched: boolean },
  ) {
    const prev = { ...((tripMeta as Record<string, unknown>) ?? {}) };
    const constraints = mirrorDrivingSettingsIntoConstraints({
      constraints: {
        ...((prev.constraints as Record<string, unknown> | undefined) ?? {}),
      },
      drivingSettings: nextIsd.drivingSettings as unknown as Record<string, unknown>,
    });
    const now = new Date().toISOString();
    if (flags.vehicleTouched && nextIsd.drivingSettings.vehicle.vehicleClass) {
      prev.vehicleConfirmedAt = now;
    }
    if (flags.insuranceTouched && nextIsd.drivingSettings.insurance.configured) {
      prev.insuranceConfirmedAt = now;
    }
    const readinessCv = stampReadinessInvalidationOnMeta(
      prev,
      nextIsd.contextVersion,
    );

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...prev,
          icelandSelfDrive: nextIsd,
          productLine: 'iceland_self_drive',
          constraints,
        }),
        updatedAt: new Date(),
      },
    });
    emitSelfDriveReadinessChanged(tripId, readinessCv);
  }

  private async requireOwnedIcelandTrip(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        metadata: true,
        destination: true,
        startDate: true,
        endDate: true,
        TripCollaborator: {
          where: { userId },
          select: { userId: true },
          take: 1,
        },
      },
    });

    if (!trip) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: `Trip ${tripId} not found`,
      });
    }
    if (trip.TripCollaborator.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not a collaborator on this trip',
      });
    }

    let isd = readIcelandSelfDriveMetadata(trip.metadata);
    if (!isd) {
      if (!isIcelandSelfDriveProductTrip(trip.metadata, trip.destination)) {
        throw new NotFoundException({
          code: 'NOT_ICELAND_SELF_DRIVE',
          message: 'Trip is not an iceland_self_drive product trip',
        });
      }
      // Initial Plan 行程常只有 productLine，缺 icelandSelfDrive 块 → 惰性补齐并落库
      isd = bootstrapIcelandSelfDriveMetadata({
        tripId,
        startDate: trip.startDate,
        endDate: trip.endDate,
        destination: trip.destination,
        existingMeta: trip.metadata,
      });
      const prev = (trip.metadata as Record<string, unknown>) ?? {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: toInputJsonValue({
            ...prev,
            icelandSelfDrive: isd,
            productLine: 'iceland_self_drive',
          }),
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Hydrated icelandSelfDrive metadata for trip=${tripId}`);
      return { tripMeta: { ...prev, icelandSelfDrive: isd, productLine: 'iceland_self_drive' }, isd };
    }

    return { tripMeta: trip.metadata, isd };
  }
}