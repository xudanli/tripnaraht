import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CommsHeartbeatRequest,
  CommsHeartbeatResult,
  CommsPeersQuery,
  CommsPeersResult,
  IntercomPeerDto,
} from '../types/in-trip-comms.types';
import { haversineDistanceMeters, isPlausibleCoord } from '../utils/comms-haversine.util';
import {
  COMMS_DEFAULT_PEER_TTL_SEC,
  isInTripCommsEnabled,
} from '../utils/in-trip-comms-config.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';

@Injectable()
export class InTripCommsPeersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
  ) {}

  async heartbeat(
    tripId: string,
    userId: string,
    body: CommsHeartbeatRequest,
  ): Promise<CommsHeartbeatResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const shareLocation = body.shareLocation !== false;
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;

    if (shareLocation && lat != null && lng != null && !isPlausibleCoord(lat, lng)) {
      throw new BadRequestException('lat/lng 坐标无效');
    }

    const lastSeenAt = body.clientTimestamp
      ? DateTime.fromISO(body.clientTimestamp)
      : DateTime.now();
    if (!lastSeenAt.isValid) {
      throw new BadRequestException('clientTimestamp 须为有效 ISO8601');
    }

    await this.prisma.tripInTripCommsPeerPresence.upsert({
      where: { tripId_userId: { tripId, userId } },
      create: {
        tripId,
        userId,
        lastLat: shareLocation && lat != null ? lat : null,
        lastLng: shareLocation && lng != null ? lng : null,
        accuracyMeters: body.accuracyMeters ?? null,
        shareLocation,
        lastSeenAt: lastSeenAt.toJSDate(),
      },
      update: {
        lastLat: shareLocation && lat != null ? lat : null,
        lastLng: shareLocation && lng != null ? lng : null,
        accuracyMeters: body.accuracyMeters ?? null,
        shareLocation,
        lastSeenAt: lastSeenAt.toJSDate(),
      },
    });

    return { accepted: true, ttlSec: COMMS_DEFAULT_PEER_TTL_SEC };
  }

  async getPeers(
    tripId: string,
    userId: string,
    query: CommsPeersQuery,
  ): Promise<CommsPeersResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const staleAfterSec = query.staleAfterSec ?? COMMS_DEFAULT_PEER_TTL_SEC;
    const now = DateTime.now();
    const nameMap = await this.resolveMemberNameMap(tripId);
    const trip = await this.access.requireTrip(tripId);
    const memberIds = new Set(
      (trip.TripCollaborator ?? []).map((c) => c.userId).concat([userId]),
    );

    const presenceRows = await this.prisma.tripInTripCommsPeerPresence.findMany({
      where: { tripId },
    });
    const presenceByUser = new Map(presenceRows.map((r) => [r.userId, r]));

    const selfPresence = presenceByUser.get(userId);
    const refExplicit =
      query.refLat != null &&
      query.refLng != null &&
      isPlausibleCoord(Number(query.refLat), Number(query.refLng))
        ? { lat: Number(query.refLat), lng: Number(query.refLng), source: 'explicit' as const }
        : null;
    const refSelf =
      selfPresence?.shareLocation &&
      selfPresence.lastLat != null &&
      selfPresence.lastLng != null
        ? {
            lat: selfPresence.lastLat,
            lng: selfPresence.lastLng,
            source: 'self' as const,
          }
        : null;
    const referencePoint = refExplicit ?? refSelf;

    const peers: IntercomPeerDto[] = [];

    for (const memberId of memberIds) {
      const row = presenceByUser.get(memberId);
      const lastSeenAt = row?.lastSeenAt ?? now.minus({ days: 1 }).toJSDate();
      const ageSec = now.diff(DateTime.fromJSDate(lastSeenAt), 'seconds').seconds;
      const connection = ageSec <= staleAfterSec ? 'online' : 'offline';

      let distanceMeters: number | null = null;
      let lastLocation: IntercomPeerDto['lastLocation'];

      if (
        row?.shareLocation &&
        row.lastLat != null &&
        row.lastLng != null &&
        referencePoint
      ) {
        distanceMeters = haversineDistanceMeters(
          referencePoint.lat,
          referencePoint.lng,
          row.lastLat,
          row.lastLng,
        );
        if (memberId !== userId || query.refLat != null) {
          lastLocation = {
            lat: row.lastLat,
            lng: row.lastLng,
            accuracyMeters: row.accuracyMeters ?? undefined,
          };
        }
      }

      if (memberId === userId) {
        distanceMeters = 0;
      }

      peers.push({
        userId: memberId,
        displayName: nameMap.get(memberId) ?? memberId.slice(0, 8),
        distanceMeters,
        lastSeenAt: lastSeenAt.toISOString(),
        connection,
        lastLocation,
      });
    }

    peers.sort((a, b) => {
      if (a.userId === userId) return -1;
      if (b.userId === userId) return 1;
      return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
    });

    return {
      peers,
      referencePoint: referencePoint
        ? { lat: referencePoint.lat, lng: referencePoint.lng, source: referencePoint.source }
        : null,
      asOf: now.toISO()!,
    };
  }

  private async resolveMemberNameMap(tripId: string): Promise<Map<string, string>> {
    const snapshot = await this.anchorHandoff.getSnapshot(tripId);
    const map = new Map<string, string>();
    for (const m of snapshot?.team?.members ?? []) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }

  private assertCommsEnabled(): void {
    if (!isInTripCommsEnabled()) {
      throw new ServiceUnavailableException({
        code: 'COMMS_EXECUTION_DISABLED',
        message: '行中团队对讲未启用（设置 IN_TRIP_COMMS_ENABLED=true）',
      });
    }
  }
}
