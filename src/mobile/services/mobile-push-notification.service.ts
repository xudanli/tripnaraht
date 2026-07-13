import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MobileApnsService } from './mobile-apns.service';
import { MobilePushTokenService } from './mobile-push-token.service';
import type { MobilePushEventType, MobilePushPayloadDto } from '../dto/mobile-push.dto';

export interface NotifyTripPushInput {
  tripId: string;
  contextVersion: number;
  recipientUserIds: string[];
  eventType: MobilePushEventType;
  title: string;
  body: string;
  changedSections?: string[];
  planVersion?: number;
  sosId?: string;
  decisionId?: string;
  excludeUserId?: string;
}

@Injectable()
export class MobilePushNotificationService {
  private readonly logger = new Logger(MobilePushNotificationService.name);

  constructor(
    private readonly tokens: MobilePushTokenService,
    private readonly apns: MobileApnsService,
    private readonly prisma: PrismaService,
  ) {}

  /** 非阻塞：写路径调用后 fire-and-forget */
  notifyTripEvent(input: NotifyTripPushInput): void {
    void this.deliverTripEvent(input).catch((err) => {
      this.logger.warn(`推送失败: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async deliverTripEvent(input: NotifyTripPushInput): Promise<void> {
    const recipientIds = [...new Set(input.recipientUserIds)].filter(
      (id) => id && id !== input.excludeUserId,
    );
    if (!recipientIds.length) return;

    const custom: MobilePushPayloadDto = {
      tripId: input.tripId,
      contextVersion: input.contextVersion,
      eventType: input.eventType,
      changedSections: input.changedSections,
      planVersion: input.planVersion,
      sosId: input.sosId,
      decisionId: input.decisionId,
    };

    const deviceRows = await this.tokens.listTokensForUsers(recipientIds);
    if (!deviceRows.length) {
      this.logger.debug(`无 iOS push token: users=${recipientIds.join(',')}`);
      return;
    }

    const results = await Promise.all(
      deviceRows.map((row) =>
        this.apns.send(row.token.token, {
          title: input.title,
          body: input.body,
          custom: custom as unknown as Record<string, unknown>,
        }),
      ),
    );

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      this.logger.warn(`APNs 部分失败 trip=${input.tripId} event=${input.eventType} failed=${failed}`);
    }
  }

  async listTripMemberIds(tripId: string, excludeUserId?: string): Promise<string[]> {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId).filter((id) => id !== excludeUserId);
  }

  async listLeaderUserIds(tripId: string): Promise<string[]> {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: { tripId, role: { in: ['OWNER', 'EDITOR'] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
