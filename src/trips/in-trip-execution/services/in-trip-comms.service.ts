import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  CommsListQuery,
  CommsListResult,
  CommsSyncIncomingMessage,
  CommsSyncRequest,
  CommsSyncResult,
  CommsSyncWarning,
} from '../types/in-trip-comms.types';
import {
  buildCommsPayload,
  isValidMessageType,
  isValidUuid,
  toIntercomMessageDto,
} from '../utils/comms-message-mapper.util';
import { assertCommsSyncMessagePayloadAllowed } from '../utils/comms-sync-guard.util';
import {
  COMMS_DEFAULT_LIST_LIMIT,
  COMMS_MAX_BODY_LENGTH,
  COMMS_MAX_LIST_LIMIT,
  COMMS_MAX_SYNC_BATCH,
  isInTripCommsEnabled,
} from '../utils/in-trip-comms-config.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';

@Injectable()
export class InTripCommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
  ) {}

  async sync(tripId: string, userId: string, request: CommsSyncRequest): Promise<CommsSyncResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const incoming = [...(request.messages ?? [])].sort((a, b) => a.clientSeq - b.clientSeq);
    if (incoming.length > COMMS_MAX_SYNC_BATCH) {
      throw new PayloadTooLargeException({
        code: 'COMMS_PAYLOAD_TOO_LARGE',
        message: `单次最多同步 ${COMMS_MAX_SYNC_BATCH} 条消息`,
      });
    }

    const nameMap = await this.resolveMemberNameMap(tripId);
    const syncedIds: string[] = [];
    const warnings: CommsSyncWarning[] = [];
    let lastClientSeq: number | null = null;

    for (const msg of incoming) {
      try {
        this.validateIncomingMessage(msg);
        assertCommsSyncMessagePayloadAllowed(msg);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('COMMS_AUDIO_IN_JSON')) {
          throw new BadRequestException({
            code: 'COMMS_AUDIO_IN_JSON',
            message: '原始音频不得通过 sync JSON 上传，请走 BLE 或 POST comms/transcribe',
          });
        }
        throw err;
      }
      if (lastClientSeq != null && msg.clientSeq > lastClientSeq + 1) {
        warnings.push({
          clientId: msg.clientId,
          code: 'SEQ_GAP',
          message: `clientSeq gap: expected ${lastClientSeq + 1}, got ${msg.clientSeq}`,
        });
      }
      lastClientSeq = msg.clientSeq;

      const existing = await this.prisma.tripInTripCommsMessage.findUnique({
        where: {
          tripId_senderId_clientId: {
            tripId,
            senderId: userId,
            clientId: msg.clientId,
          },
        },
      });

      if (existing) {
        syncedIds.push(msg.clientId);
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        const serverSeq = await this.allocateServerSeq(tripId, tx);
        await tx.tripInTripCommsMessage.create({
          data: {
            tripId,
            senderId: userId,
            clientId: msg.clientId,
            clientSeq: BigInt(msg.clientSeq),
            serverSeq,
            messageType: msg.type,
            body: msg.body,
            payload: toInputJsonValue(
              buildCommsPayload({
                audio: msg.audio,
                location: msg.location,
                metadata: msg.metadata,
              }) ?? {},
            ),
            clientCreatedAt: new Date(msg.createdAt),
          },
        });
      });
      syncedIds.push(msg.clientId);
    }

    const lastKnown = request.lastKnownServerSeq ?? 0;
    const serverMessages = await this.prisma.tripInTripCommsMessage.findMany({
      where: {
        tripId,
        serverSeq: { gt: BigInt(lastKnown) },
        NOT: { senderId: userId },
      },
      orderBy: { serverSeq: 'asc' },
      take: COMMS_MAX_LIST_LIMIT,
    });

    const latestServerSeq = await this.getLatestServerSeq(tripId);

    return {
      syncedIds,
      serverMessages: serverMessages.map((row) =>
        toIntercomMessageDto(row, nameMap.get(row.senderId)),
      ),
      latestServerSeq,
      syncedAt: new Date().toISOString(),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async listMessages(
    tripId: string,
    userId: string,
    query: CommsListQuery,
  ): Promise<CommsListResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const limit = Math.min(
      Math.max(1, query.limit ?? COMMS_DEFAULT_LIST_LIMIT),
      COMMS_MAX_LIST_LIMIT,
    );
    const nameMap = await this.resolveMemberNameMap(tripId);
    const where: Prisma.TripInTripCommsMessageWhereInput = { tripId };

    if (query.before) {
      const beforeNum = Number(query.before);
      if (Number.isFinite(beforeNum) && beforeNum > 0) {
        where.serverSeq = { lt: BigInt(beforeNum) };
      } else {
        const beforeDate = new Date(query.before);
        if (!Number.isNaN(beforeDate.getTime())) {
          where.serverCreatedAt = { lt: beforeDate };
        }
      }
    }

    if (query.since) {
      const sinceNum = Number(query.since);
      if (Number.isFinite(sinceNum) && String(query.since).trim() === String(sinceNum)) {
        where.serverSeq = {
          ...(where.serverSeq as Prisma.BigIntFilter | undefined),
          gt: BigInt(sinceNum),
        };
      } else {
        const sinceDate = new Date(query.since);
        if (Number.isNaN(sinceDate.getTime())) {
          throw new BadRequestException('since 须为 ISO8601 或 serverSeq 数字');
        }
        where.serverCreatedAt = {
          ...(where.serverCreatedAt as Prisma.DateTimeFilter | undefined),
          gte: sinceDate,
        };
      }
    }

    const rows = await this.prisma.tripInTripCommsMessage.findMany({
      where,
      orderBy: { serverSeq: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    const latestServerSeq = await this.getLatestServerSeq(tripId);
    const oldest = page[0];

    return {
      messages: page.map((row) => toIntercomMessageDto(row, nameMap.get(row.senderId))),
      latestServerSeq,
      hasMore,
      nextBefore: hasMore && oldest ? String(oldest.serverSeq) : null,
    };
  }

  private validateIncomingMessage(msg: CommsSyncIncomingMessage): void {
    if (!msg.clientId || !isValidUuid(msg.clientId)) {
      throw new BadRequestException('clientId 须为有效 UUID');
    }
    if (!Number.isFinite(msg.clientSeq) || msg.clientSeq < 0) {
      throw new BadRequestException('clientSeq 须为非负整数');
    }
    if (!isValidMessageType(msg.type)) {
      throw new BadRequestException(`不支持的消息类型: ${msg.type}`);
    }
    if (!msg.body || msg.body.length > COMMS_MAX_BODY_LENGTH) {
      throw new BadRequestException(`body 不能为空且不超过 ${COMMS_MAX_BODY_LENGTH} 字符`);
    }
    const createdAt = new Date(msg.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('createdAt 须为有效 ISO8601');
    }
  }

  private async allocateServerSeq(
    tripId: string,
    tx: Prisma.TransactionClient,
  ): Promise<bigint> {
    const agg = await tx.tripInTripCommsMessage.aggregate({
      where: { tripId },
      _max: { serverSeq: true },
    });
    return (agg._max.serverSeq ?? BigInt(0)) + BigInt(1);
  }

  private async getLatestServerSeq(tripId: string): Promise<number> {
    const agg = await this.prisma.tripInTripCommsMessage.aggregate({
      where: { tripId },
      _max: { serverSeq: true },
    });
    return Number(agg._max.serverSeq ?? BigInt(0));
  }

  private async resolveMemberNameMap(tripId: string): Promise<Map<string, string>> {
    const snapshot = await this.anchorHandoff.getSnapshot(tripId);
    const map = new Map<string, string>();
    for (const m of snapshot?.team?.members ?? []) {
      map.set(m.userId, m.displayName);
    }
    if (map.size === 0) {
      const trip = await this.access.requireTrip(tripId);
      for (const c of trip.TripCollaborator ?? []) {
        map.set(c.userId, c.userId.slice(0, 8));
      }
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
