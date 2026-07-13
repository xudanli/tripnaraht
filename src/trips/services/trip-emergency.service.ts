// src/trips/services/trip-emergency.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../budget-os/utils/prisma-json.util';
import { randomUUID } from 'crypto';
import type { EmergencySosType } from '../../mobile/dto/emergency-sos.dto';
import { mapLegacySosStatus } from '../../mobile/dto/emergency-sos.dto';
import type { ActiveSosReadDto } from '../../mobile/dto/emergency-sos-active.dto';
import {
  EMERGENCY_SOS_RESOLVE_REASONS,
  type EmergencySosResolveReason,
} from '../../mobile/dto/emergency-sos-active.dto';
import {
  extractActiveSosRecord,
  projectActiveSosRead,
  type StoredEmergencySosRecord,
} from '../utils/sos-active.util';

export interface EmergencySOSRequest {
  tripId: string;
  userId?: string;
  type?: EmergencySosType;
  latitude?: number | null;
  longitude?: number | null;
  message?: string;
  shareWithTeam?: boolean;
  timestamp?: Date;
  notifiedEmergencyContacts?: Array<{ id: string; name: string; phone: string }>;
}

export interface EmergencySOSResponse {
  sosId: string;
  tripId: string;
  type: EmergencySosType;
  status: 'SENT' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
  /** iOS 对齐：open | acknowledged | resolved */
  publicStatus: 'open' | 'acknowledged' | 'resolved';
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  location: { lat: number; lng: number } | null;
  message?: string;
  sentAt: Date;
  userId?: string;
  shareWithTeam?: boolean;
  rescueInfo?: {
    estimatedArrival?: string;
    contactNumber?: string;
    progress?: string;
  };
}

@Injectable()
export class TripEmergencyService {
  private readonly logger = new Logger(TripEmergencyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 发送紧急求救信号
   */
  async sendSOS(request: EmergencySOSRequest): Promise<EmergencySOSResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: request.tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${request.tripId} 不存在`);
    }

    const sosId = randomUUID();
    const sentAt = request.timestamp || new Date();
    const sosType = request.type ?? 'other';
    const hasCoords =
      request.latitude != null &&
      request.longitude != null &&
      Number.isFinite(request.latitude) &&
      Number.isFinite(request.longitude);

    const tripContext = {
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      currentDate: sentAt,
      itinerary: trip.TripDay.flatMap((day) =>
        day.ItineraryItem.map((item) => ({
          date: day.date,
          place: item.Place
            ? {
                name: item.Place.nameCN || item.Place.nameEN,
                address: item.Place.address,
                coordinates: undefined,
              }
            : null,
        })),
      ),
    };

    this.logger.log(
      `发送紧急求救信号: SOS ID=${sosId}, Trip ID=${request.tripId}, type=${sosType}, 坐标=${
        hasCoords ? `(${request.latitude}, ${request.longitude})` : '未知'
      }`,
    );

    if (request.notifiedEmergencyContacts?.length) {
      this.logger.log(
        `SOS 紧急联系人待通知 (${request.notifiedEmergencyContacts.length}): ${request.notifiedEmergencyContacts
          .map((c) => c.phone)
          .join(', ')}`,
      );
    }

    const emergencyRecord = {
      sosId,
      type: sosType,
      userId: request.userId,
      shareWithTeam: request.shareWithTeam ?? true,
      coordinates: hasCoords
        ? {
            latitude: request.latitude!,
            longitude: request.longitude!,
          }
        : null,
      message: request.message,
      sentAt: sentAt.toISOString(),
      status: 'SENT',
      notifiedEmergencyContacts: request.notifiedEmergencyContacts ?? [],
      tripContext,
    };

    const currentMetadata = (trip.metadata as Record<string, unknown>) || {};
    const emergencyHistory = (currentMetadata.emergencyHistory as unknown[]) || [];
    emergencyHistory.push(emergencyRecord);

    await this.prisma.trip.update({
      where: { id: request.tripId },
      data: {
        metadata: toInputJsonValue({
          ...currentMetadata,
          emergencyHistory,
          lastEmergencySOS: emergencyRecord,
        }),
      },
    });

    return this.toResponse(request.tripId, emergencyRecord, sentAt);
  }

  async getActiveSOS(tripId: string): Promise<ActiveSosReadDto> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    return projectActiveSosRead(trip.metadata);
  }

  async acknowledgeSOS(
    tripId: string,
    sosId: string,
    actor: { userId: string; displayName: string },
  ): Promise<ActiveSosReadDto> {
    const record = await this.loadActiveSosRecord(tripId, sosId);
    if (mapLegacySosStatus(record.status) !== 'open') {
      return projectActiveSosRead(
        (await this.prisma.trip.findUnique({ where: { id: tripId } }))!.metadata,
      );
    }

    const updated: StoredEmergencySosRecord = {
      ...record,
      status: 'ACKNOWLEDGED',
      acknowledgedBy: {
        memberId: actor.userId,
        name: actor.displayName,
        at: new Date().toISOString(),
      },
    };
    await this.persistSosRecord(tripId, updated);
    return projectActiveSosRead(
      (await this.prisma.trip.findUnique({ where: { id: tripId } }))!.metadata,
    );
  }

  async resolveSOS(
    tripId: string,
    sosId: string,
    actor: { userId: string; displayName: string; isLeader: boolean },
    input: { reason: EmergencySosResolveReason; comment?: string },
  ): Promise<EmergencySOSResponse> {
    if (!EMERGENCY_SOS_RESOLVE_REASONS.includes(input.reason)) {
      throw new BadRequestException('reason 必须是 false_alarm | resolved | cancelled');
    }

    const record = await this.loadActiveSosRecord(tripId, sosId);
    const isInitiator = record.userId === actor.userId;
    if (!isInitiator && !actor.isLeader) {
      throw new ForbiddenException('仅 SOS 发起者或领队可解除');
    }

    const resolvedAt = new Date().toISOString();
    const updated: StoredEmergencySosRecord = {
      ...record,
      status: 'RESOLVED',
      resolvedBy: { memberId: actor.userId, name: actor.displayName, at: resolvedAt },
      resolveReason: input.reason,
      resolveComment: input.comment?.trim() || undefined,
    };
    await this.persistSosRecord(tripId, updated);
    return this.toResponse(
      tripId,
      updated as unknown as Record<string, unknown>,
      new Date(String(record.sentAt ?? resolvedAt)),
    );
  }

  async getSOSHistory(tripId: string): Promise<EmergencySOSResponse[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const emergencyHistory = (metadata.emergencyHistory as Record<string, unknown>[]) || [];

    return emergencyHistory.map((record) =>
      this.toResponse(tripId, record, new Date(String(record.sentAt))),
    );
  }

  async updateRescueProgress(
    sosId: string,
    progress: {
      status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
      estimatedArrival?: string;
      contactNumber?: string;
      progress?: string;
    },
  ): Promise<void> {
    const trips = await this.prisma.trip.findMany({
      where: {
        metadata: {
          path: ['lastEmergencySOS', 'sosId'],
          equals: sosId,
        },
      },
    });

    if (trips.length === 0) {
      throw new NotFoundException(`未找到 SOS ID ${sosId} 对应的行程`);
    }

    const trip = trips[0];
    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const emergencyHistory = (metadata.emergencyHistory as Record<string, unknown>[]) || [];

    const updatedHistory = emergencyHistory.map((record) => {
      if (record.sosId === sosId) {
        return {
          ...record,
          status: progress.status,
          rescueInfo: {
            estimatedArrival: progress.estimatedArrival,
            contactNumber: progress.contactNumber,
            progress: progress.progress,
          },
        };
      }
      return record;
    });

    const lastEmergency = updatedHistory[updatedHistory.length - 1];
    if (lastEmergency && lastEmergency.sosId === sosId) {
      metadata.lastEmergencySOS = {
        ...lastEmergency,
        status: progress.status,
        rescueInfo: {
          estimatedArrival: progress.estimatedArrival,
          contactNumber: progress.contactNumber,
          progress: progress.progress,
        },
      };
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          emergencyHistory: updatedHistory,
          lastEmergencySOS: metadata.lastEmergencySOS,
        }),
      },
    });

    this.logger.log(`更新救援进度: SOS ID=${sosId}, Status=${progress.status}`);
  }

  private async loadActiveSosRecord(tripId: string, sosId: string): Promise<StoredEmergencySosRecord> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const record = extractActiveSosRecord(trip.metadata);
    if (!record || record.sosId !== sosId) {
      throw new NotFoundException(`未找到进行中的 SOS ${sosId}`);
    }
    return record;
  }

  private async persistSosRecord(tripId: string, record: StoredEmergencySosRecord): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const emergencyHistory = ((metadata.emergencyHistory as StoredEmergencySosRecord[]) || []).map(
      (row) => (row.sosId === record.sosId ? { ...row, ...record } : row),
    );

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          emergencyHistory,
          lastEmergencySOS: record,
        }),
      },
    });
  }

  private toResponse(
    tripId: string,
    record: Record<string, unknown>,
    sentAt: Date,
  ): EmergencySOSResponse {
    const coords = record.coordinates as { latitude: number; longitude: number } | null | undefined;
    const hasCoords =
      coords != null &&
      Number.isFinite(coords.latitude) &&
      Number.isFinite(coords.longitude);
    const legacyStatus = (record.status as EmergencySOSResponse['status']) || 'SENT';

    return {
      sosId: String(record.sosId),
      tripId,
      type: (record.type as EmergencySosType) ?? 'other',
      status: legacyStatus,
      publicStatus: mapLegacySosStatus(legacyStatus),
      coordinates: hasCoords ? coords! : null,
      location: hasCoords ? { lat: coords!.latitude, lng: coords!.longitude } : null,
      message: record.message as string | undefined,
      sentAt,
      userId: record.userId as string | undefined,
      shareWithTeam: record.shareWithTeam as boolean | undefined,
      rescueInfo: record.rescueInfo as EmergencySOSResponse['rescueInfo'],
    };
  }
}
