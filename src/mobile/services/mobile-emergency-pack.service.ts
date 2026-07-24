import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CountriesService } from '../../countries/countries.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { normalizeTripDestinationCode } from '../../trips/trip-constraint-solver/utils/country-official-constraints.util';
import { mapCollaboratorRole } from '../utils/mobile-execution.util';
import {
  projectLocalEmergencyNumbers,
  type LocalEmergencyNumbersDto,
} from '../utils/local-emergency-numbers.util';

export interface EmergencyPackDto {
  tripId: string;
  tripName: string;
  memberCount: number;
  leader: { id: string; name: string; phone?: string | null };
  medicalNotes?: string | null;
  vehicleInfo?: { plate?: string; model?: string; color?: string } | null;
  offlinePackAvailable: boolean;
  offlinePackVersion?: string | null;
  localEmergencyNumber: string;
}

@Injectable()
export class MobileEmergencyPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly countries: CountriesService,
  ) {}

  async getEmergencyPack(tripId: string, userId: string): Promise<EmergencyPackDto> {
    await this.access.assertTripMember(tripId, userId);

    const [trip, collaborators, offlinePack] = await Promise.all([
      this.prisma.trip.findUnique({ where: { id: tripId } }),
      this.prisma.tripCollaborator.findMany({ where: { tripId } }),
      this.prisma.tripOfflinePack.findUnique({ where: { tripId } }),
    ]);

    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const userIds = collaborators.map((c) => c.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderRow =
      collaborators.find((c) => mapCollaboratorRole(c.role) === 'leader') ?? collaborators[0];
    const leaderUser = leaderRow ? userMap.get(leaderRow.userId) : undefined;

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const emergencyMeta = (metadata.emergencyPack as Record<string, unknown> | undefined) ?? {};
    const vehicleRaw =
      (metadata.vehicleInfo as Record<string, unknown> | undefined) ??
      (emergencyMeta.vehicleInfo as Record<string, unknown> | undefined);

    const countryCode = resolveTripCountryCode(trip.destination, metadata);
    const localNumbers = await this.getLocalNumbersForCountry(countryCode);

    const medicalNotes = extractMedicalNotes(metadata, emergencyMeta);

    return {
      tripId: trip.id,
      tripName: trip.name ?? trip.destination ?? '未命名行程',
      memberCount: collaborators.length,
      leader: {
        id: leaderRow?.userId ?? userId,
        name:
          leaderUser?.displayName ??
          leaderUser?.email?.split('@')[0] ??
          '领队',
        phone: pickString(emergencyMeta.leaderPhone) ?? null,
      },
      medicalNotes,
      vehicleInfo: vehicleRaw
        ? {
            plate: pickString(vehicleRaw.plate),
            model: pickString(vehicleRaw.model),
            color: pickString(vehicleRaw.color),
          }
        : null,
      offlinePackAvailable: !!offlinePack,
      offlinePackVersion: offlinePack?.updatedAt
        ? offlinePack.updatedAt.toISOString().slice(0, 10)
        : null,
      localEmergencyNumber: localNumbers.primary,
    };
  }

  async getLocalNumbers(tripId: string, userId: string): Promise<LocalEmergencyNumbersDto> {
    await this.access.assertTripMember(tripId, userId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const countryCode = resolveTripCountryCode(trip.destination, metadata);
    return this.getLocalNumbersForCountry(countryCode);
  }

  private async getLocalNumbersForCountry(countryCode: string): Promise<LocalEmergencyNumbersDto> {
    try {
      const profile = await this.countries.getCountryProfile(countryCode);
      const emergency = profile.emergency as Record<string, unknown> | undefined;
      return projectLocalEmergencyNumbers(countryCode, emergency ?? null);
    } catch {
      return projectLocalEmergencyNumbers(countryCode, null);
    }
  }
}

function resolveTripCountryCode(
  destination: string | null | undefined,
  metadata: Record<string, unknown>,
): string {
  const fromMeta =
    typeof metadata.countryCode === 'string'
      ? metadata.countryCode
      : typeof metadata.destinationCountryCode === 'string'
        ? metadata.destinationCountryCode
        : undefined;
  if (fromMeta?.trim()) return fromMeta.trim().toUpperCase();
  return normalizeTripDestinationCode(destination);
}

function extractMedicalNotes(
  metadata: Record<string, unknown>,
  emergencyMeta: Record<string, unknown>,
): string | null {
  const direct =
    pickString(emergencyMeta.medicalNotes) ??
    pickString(metadata.medicalNotes) ??
    pickString((metadata.travelerHealth as Record<string, unknown> | undefined)?.notes);
  if (direct) return direct;

  const allergies = (emergencyMeta.allergies ?? metadata.allergies) as unknown;
  if (Array.isArray(allergies) && allergies.length > 0) {
    return `过敏：${allergies.map(String).join('、')}`;
  }
  return null;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}
