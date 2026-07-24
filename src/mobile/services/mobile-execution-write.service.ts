import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TripEmergencyService } from '../../trips/services/trip-emergency.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { MobileExecutionService } from './mobile-execution.service';
import { InTripCommsService } from '../../trips/in-trip-execution/services/in-trip-comms.service';
import { InTripCommsTranscribeService } from '../../trips/in-trip-execution/services/in-trip-comms-transcribe.service';
import { InTripCommsAudioStorageService } from '../../trips/in-trip-execution/services/in-trip-comms-audio-storage.service';
import {
  resolveCommsAudioFileName,
  resolveCommsAudioMimeType,
} from '../../trips/in-trip-execution/utils/comms-audio-enrich.util';
import {
  computeMobileContextVersion,
  formatTimeHHmm,
  resolveDayNumber,
} from '../utils/mobile-execution.util';
import { resolvePatchDateTime } from '../utils/activity-patch-time.util';
import type { MobileExecutionItemStatus, MobileIntercomMessageResultDto, MobileNavigationSessionDto } from '../dto/mobile-execution.types';
import {
  EMERGENCY_SOS_TYPE_LABELS,
  isMobileNotificationType,
  resolveEmergencySosType,
  type EmergencySosLocationDto,
} from '../dto/emergency-sos.dto';
import {
  EMERGENCY_LOCATION_SHARE_INTERVAL_SECONDS,
  EMERGENCY_SOS_RESOLVE_REASONS,
  type EmergencySosResolveReason,
} from '../dto/emergency-sos-active.dto';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import type { TripContextChangedSection } from '../ws/trip-context-ws.types';
import { isInTripCommsEnabled } from '../../trips/in-trip-execution/utils/in-trip-comms-config.util';
import {
  isIntercomStatusType,
  projectIntercomMessage,
  type MobileIntercomStatusType,
} from '../utils/mobile-intercom.projection.util';
import { MobileEmergencyContactsService } from './mobile-emergency-contacts.service';
import { MobilePushNotificationService } from './mobile-push-notification.service';
import type { NotifyTripPushInput } from './mobile-push-notification.service';

interface MobileActivityOverride {
  title?: string;
  notes?: string;
  plannedDepartAt?: string;
  patchedAt?: string;
  patchedBy?: string;
}

interface MobileExecutionMetadata {
  idempotencyKeys?: Record<string, string>;
  /** 幂等重放缓存：key → JSON 序列化的写结果 */
  idempotencyResults?: Record<string, string>;
  events?: MobileStoredEvent[];
  notifications?: MobileStoredNotification[];
  navigationSessions?: Record<string, MobileNavigationSessionDto>;
  lastCommsClientSeq?: number;
  emergencyLocationShare?: {
    active: boolean;
    userId: string;
    sosId?: string | null;
    mode: 'emergency';
    intervalSeconds: number;
    startedAt: string;
  };
  completedActivities?: Record<
    string,
    {
      completedAt: string;
      actualDurationMinutes?: number;
      notes?: string;
      completedBy: string;
    }
  >;
  /** 单项调整覆盖（title / notes / plannedDepartAt） */
  activityOverrides?: Record<string, MobileActivityOverride>;
  memberPresence?: Record<
    string,
    {
      batteryPercent?: number;
      lastReportedAt: string;
    }
  >;
}

interface MobileStoredEvent {
  id: string;
  type: string;
  title: string;
  severity?: string;
  activityId?: string;
  location?: { lat: number; lng: number };
  description?: string;
  attachments?: unknown[];
  recordedBy: string;
  recordedAt: string;
  idempotencyKey?: string;
}

interface MobileStoredNotification {
  id: string;
  recipientIds: string[];
  type: string;
  title: string;
  body: string;
  attachments?: Record<string, boolean>;
  sentBy: string;
  sentAt: string;
  idempotencyKey?: string;
}

@Injectable()
export class MobileExecutionWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly mobileRead: MobileExecutionService,
    private readonly tripEmergency: TripEmergencyService,
    private readonly comms: InTripCommsService,
    private readonly commsTranscribe: InTripCommsTranscribeService,
    private readonly commsAudio: InTripCommsAudioStorageService,
    private readonly contextNotifier: TripContextChangeNotifierService,
    private readonly emergencyContacts: MobileEmergencyContactsService,
    private readonly mobilePush: MobilePushNotificationService,
  ) {}

  async assertContextVersion(tripId: string, userId: string, ifMatch?: number) {
    await this.assertWrite(tripId, userId, ifMatch);
  }

  async recordExecutionEvent(
    tripId: string,
    userId: string,
    body: {
      type: string;
      title: string;
      severity?: string;
      activityId?: string;
      location?: { lat: number; lng: number };
      description?: string;
      attachments?: unknown[];
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    const mobile = await this.loadMobileMeta(tripId);

    if (opts?.idempotencyKey) {
      const existingId = mobile.idempotencyKeys?.[opts.idempotencyKey];
      if (existingId) {
        const existing = mobile.events?.find((e) => e.id === existingId);
        if (existing) {
          return this.writeResult(tripId, { event: existing, replay: true });
        }
      }
    }

    const event: MobileStoredEvent = {
      id: randomUUID(),
      type: body.type,
      title: body.title,
      severity: body.severity,
      activityId: body.activityId,
      location: body.location,
      description: body.description,
      attachments: body.attachments,
      recordedBy: userId,
      recordedAt: new Date().toISOString(),
      idempotencyKey: opts?.idempotencyKey,
    };

    mobile.events = [...(mobile.events ?? []), event];
    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}), [opts.idempotencyKey]: event.id };
    }

    await this.saveMobileMeta(tripId, mobile);
    return this.writeResult(tripId, { event, replay: false });
  }

  async sendTeamNotification(
    tripId: string,
    userId: string,
    body: {
      recipientIds: string[];
      type: string;
      title: string;
      body: string;
      statusType?: string;
      attachments?: {
        includeLocation?: boolean;
        includeMeetingPoint?: boolean;
        includePlanLink?: boolean;
      };
      location?: EmergencySosLocationDto | null;
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    if (!body.recipientIds?.length) {
      throw new BadRequestException('recipientIds 不能为空');
    }
    if (!isMobileNotificationType(body.type)) {
      throw new BadRequestException(
        `type 必须是: announcement | meeting | safety | risk_alert | location_update | arrived | wait_here | need_rest | separated | intercom_text | intercom_status`,
      );
    }

    const mobile = await this.loadMobileMeta(tripId);
    if (opts?.idempotencyKey) {
      const existingId = mobile.idempotencyKeys?.[opts.idempotencyKey];
      const existing = mobile.notifications?.find((n) => n.id === existingId);
      if (existing) {
        return this.writeResult(tripId, { notification: existing, replay: true });
      }
    }

    let notificationBody = body.body;
    if (body.attachments?.includeLocation && body.location) {
      notificationBody = `${notificationBody}\n📍 ${body.location.lat.toFixed(5)}, ${body.location.lng.toFixed(5)}`.trim();
    }

    const notification: MobileStoredNotification = {
      id: randomUUID(),
      recipientIds: body.recipientIds,
      type: body.type,
      title: body.title,
      body: notificationBody,
      attachments: body.attachments,
      sentBy: userId,
      sentAt: new Date().toISOString(),
      idempotencyKey: opts?.idempotencyKey,
    };

    mobile.notifications = [...(mobile.notifications ?? []), notification];
    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = { ...(mobile.idempotencyKeys ?? {}), [opts.idempotencyKey]: notification.id };
    }

    await this.saveMobileMeta(tripId, mobile);
    const result = await this.writeResult(tripId, { notification, replay: false });

    await this.syncIntercomStatusFromNotification(tripId, userId, notification, body).then(
      (synced) => {
        if (synced) {
          void this.emitIntercomMessageWs(tripId, userId, notification.id, result.contextVersion);
        }
      },
    );

    this.emitPush(result, {
      tripId,
      recipientUserIds: body.recipientIds,
      eventType:
        body.type === 'risk_alert' || body.type === 'location_update'
          ? 'risk_alert'
          : 'team_notification',
      title: body.title,
      body: notificationBody,
      changedSections: ['execution', 'notifications', 'team', 'intercom'],
      excludeUserId: userId,
    });
    return result;
  }

  async persistMemberPresence(
    tripId: string,
    userId: string,
    extras: { batteryPercent?: number },
  ): Promise<void> {
    const mobile = await this.loadMobileMeta(tripId);
    mobile.memberPresence = {
      ...(mobile.memberPresence ?? {}),
      [userId]: {
        batteryPercent: extras.batteryPercent,
        lastReportedAt: new Date().toISOString(),
      },
    };
    await this.saveMobileMeta(tripId, mobile);
  }

  private async syncIntercomStatusFromNotification(
    tripId: string,
    userId: string,
    notification: MobileStoredNotification,
    body: {
      type: string;
      title: string;
      body: string;
      attachments?: { includeLocation?: boolean };
      location?: EmergencySosLocationDto | null;
      statusType?: string;
    },
  ): Promise<boolean> {
    if (!isInTripCommsEnabled()) return false;

    const statusType = this.resolveIntercomStatusType(body);
    if (!statusType) return false;

    const mobile = await this.loadMobileMeta(tripId);
    const clientSeq = (mobile.lastCommsClientSeq ?? 0) + 1;
    const sentAt = notification.sentAt;

    await this.comms.sync(tripId, userId, {
      messages: [
        {
          clientId: notification.id,
          clientSeq,
          type: 'system',
          body: notification.title || notification.body,
          createdAt: sentAt,
          location:
            body.attachments?.includeLocation && body.location
              ? { lat: body.location.lat, lng: body.location.lng }
              : undefined,
          metadata: {
            intercomKind: 'status',
            statusType,
            notificationId: notification.id,
            transport: 'cloud',
            deliveryStatus: 'sent',
          },
        },
      ],
    });

    mobile.lastCommsClientSeq = clientSeq;
    await this.saveMobileMeta(tripId, mobile);
    return true;
  }

  private resolveIntercomStatusType(body: {
    type: string;
    statusType?: string;
  }): MobileIntercomStatusType | null {
    if (body.type === 'intercom_status' && body.statusType && isIntercomStatusType(body.statusType)) {
      return body.statusType;
    }
    if (isIntercomStatusType(body.type)) {
      return body.type;
    }
    return null;
  }

  async sendIntercomTextMessage(
    tripId: string,
    userId: string,
    body: {
      kind: 'text';
      body: string;
      clientId?: string;
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<MobileIntercomMessageResultDto & { contextVersion: number; planVersion?: number }> {
    await this.assertWrite(tripId, userId, opts?.ifMatch);

    if (!isInTripCommsEnabled()) {
      throw new ServiceUnavailableException({
        code: 'COMMS_EXECUTION_DISABLED',
        message: '行中对讲未启用，请设置 IN_TRIP_COMMS_ENABLED=true',
      });
    }
    if (!body.body?.trim()) {
      throw new BadRequestException('body 不能为空');
    }

    const mobile = await this.loadMobileMeta(tripId);
    const clientId = body.clientId ?? randomUUID();

    if (opts?.idempotencyKey) {
      const storedClientId = mobile.idempotencyKeys?.[opts.idempotencyKey];
      if (storedClientId) {
        return this.writeResult(tripId, {
          message: {
            clientId: storedClientId,
            type: 'text' as const,
            body: body.body,
            deliveryStatus: 'sent' as const,
          },
          replay: true,
          previewSummary: '文字已发送',
        });
      }
    }

    const clientSeq = (mobile.lastCommsClientSeq ?? 0) + 1;
    const sentAt = new Date().toISOString();
    const syncResult = await this.comms.sync(tripId, userId, {
      messages: [
        {
          clientId,
          clientSeq,
          type: 'text',
          body: body.body.trim(),
          createdAt: sentAt,
          metadata: {
            transport: 'cloud',
            deliveryStatus: 'sent',
          },
        },
      ],
    });

    mobile.lastCommsClientSeq = clientSeq;
    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = {
        ...(mobile.idempotencyKeys ?? {}),
        [opts.idempotencyKey]: clientId,
      };
    }
    await this.saveMobileMeta(tripId, mobile);

    const persisted = await this.comms.getMessageByClientId(tripId, userId, clientId);

    const result = await this.writeResult(tripId, {
      message: {
        id: persisted?.id,
        clientId,
        type: 'text' as const,
        body: body.body.trim(),
        sentAt,
        deliveryStatus: 'sent' as const,
        serverSeq: syncResult.latestServerSeq,
      },
      replay: false,
      previewSummary: '文字已发送',
    });
    await this.emitIntercomMessageWs(tripId, userId, clientId, result.contextVersion);
    return result;
  }

  /**
   * P0 — 单项调整行程（真正写 Active Plan）
   * PATCH /api/mobile/trips/:tripId/activities/:activityId
   */
  async patchActivity(
    tripId: string,
    userId: string,
    activityId: string,
    body: {
      startTime?: string;
      endTime?: string;
      plannedDepartAt?: string;
      title?: string;
      notes?: string;
      cascadeMode?: 'auto' | 'none';
    },
    opts: { idempotencyKey?: string; ifMatch?: number },
  ) {
    this.assertWriteHeaders(opts);
    await this.assertWrite(tripId, userId, opts.ifMatch);

    const mobile = await this.loadMobileMeta(tripId);
    const idemKey = opts.idempotencyKey!.trim();
    const cached = mobile.idempotencyResults?.[idemKey];
    if (cached) {
      try {
        return JSON.parse(cached) as {
          contextVersion: number;
          planVersion?: number;
          activityId: string;
          startTime: string | null;
          endTime: string | null;
          title: string;
          notes: string;
          plannedDepartAt: string | null;
          replay: boolean;
          patched: true;
        };
      } catch {
        // fall through and re-apply
      }
    }

    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: activityId, TripDay: { tripId } },
      include: { TripDay: true, Place: true },
    });
    if (!item) {
      throw new NotFoundException(`活动 ${activityId} 不存在或不属于该行程`);
    }

    const hasTimePatch =
      body.startTime != null || body.endTime != null || body.plannedDepartAt != null;
    const hasTextPatch = body.title != null || body.notes != null;
    if (!hasTimePatch && !hasTextPatch) {
      throw new BadRequestException(
        '至少提供 startTime / endTime / plannedDepartAt / title / notes 之一',
      );
    }

    const dayDate = item.TripDay.date;
    let nextStart = item.startTime;
    let nextEnd = item.endTime;

    if (body.startTime != null) {
      nextStart = resolvePatchDateTime(dayDate, body.startTime, item.startTime);
    }
    if (body.endTime != null) {
      nextEnd = resolvePatchDateTime(dayDate, body.endTime, item.endTime);
    } else if (body.startTime != null && item.startTime && item.endTime && nextStart) {
      const durationMs = item.endTime.getTime() - item.startTime.getTime();
      if (durationMs > 0) {
        nextEnd = new Date(nextStart.getTime() + durationMs);
      }
    }

    if (nextStart && nextEnd && nextStart >= nextEnd) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    const notePatch =
      body.notes !== undefined
        ? body.notes
        : body.title !== undefined && !item.Place
          ? body.title
          : undefined;

    if (body.startTime != null || body.endTime != null || notePatch !== undefined) {
      await this.prisma.itineraryItem.update({
        where: { id: activityId },
        data: {
          ...(body.startTime != null || body.endTime != null
            ? { startTime: nextStart, endTime: nextEnd }
            : {}),
          ...(notePatch !== undefined ? { note: notePatch } : {}),
        },
      });
    }

    const plannedDepartAtIso =
      body.plannedDepartAt != null
        ? resolvePatchDateTime(dayDate, body.plannedDepartAt, item.endTime ?? item.startTime)?.toISOString() ??
          null
        : undefined;

    const override: MobileActivityOverride = {
      ...(mobile.activityOverrides?.[activityId] ?? {}),
      patchedAt: new Date().toISOString(),
      patchedBy: userId,
    };
    if (body.title !== undefined) override.title = body.title;
    if (body.notes !== undefined) override.notes = body.notes;
    if (plannedDepartAtIso !== undefined) {
      override.plannedDepartAt = plannedDepartAtIso ?? undefined;
    }

    mobile.activityOverrides = {
      ...(mobile.activityOverrides ?? {}),
      [activityId]: override,
    };
    mobile.idempotencyKeys = {
      ...(mobile.idempotencyKeys ?? {}),
      [idemKey]: activityId,
    };

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    const rfcBlock =
      (metadata.rfc001ExecutionActivityContext as {
        byActivityId?: Record<string, { plannedDepartAt?: string }>;
      }) ?? {};
    const byActivityId = { ...(rfcBlock.byActivityId ?? {}) };
    if (plannedDepartAtIso) {
      byActivityId[activityId] = {
        ...(byActivityId[activityId] ?? {}),
        plannedDepartAt: plannedDepartAtIso,
      };
    }

    const bumpedAt = new Date();
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        updatedAt: bumpedAt,
        metadata: toInputJsonValue({
          ...metadata,
          mobileExecution: mobile,
          rfc001ExecutionActivityContext: { byActivityId },
        }),
      },
    });

    const displayTitle =
      override.title ??
      item.Place?.nameCN ??
      item.Place?.nameEN ??
      (typeof notePatch === 'string' ? notePatch : item.note) ??
      '行程项';

    const resultPayload = {
      activityId,
      startTime: nextStart?.toISOString() ?? null,
      endTime: nextEnd?.toISOString() ?? null,
      title: displayTitle,
      notes: override.notes ?? notePatch ?? item.note ?? '',
      plannedDepartAt:
        override.plannedDepartAt ??
        plannedDepartAtIso ??
        nextStart?.toISOString() ??
        null,
      replay: false,
      patched: true as const,
    };

    const written = await this.writeResult(tripId, resultPayload);

    // 幂等缓存写入时固定 updatedAt，避免 contextVersion 相对响应漂移
    mobile.idempotencyResults = {
      ...(mobile.idempotencyResults ?? {}),
      [idemKey]: JSON.stringify({ ...written, replay: true }),
    };
    const after = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const afterMeta = (after?.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        updatedAt: bumpedAt,
        metadata: toInputJsonValue({
          ...afterMeta,
          mobileExecution: mobile,
        }),
      },
    });

    return written;
  }

  async completeActivity(
    tripId: string,
    userId: string,
    activityId: string,
    body: {
      completedAt?: string;
      actualDurationMinutes?: number;
      notes?: string;
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);

    const item = await this.prisma.itineraryItem.findFirst({
      where: {
        id: activityId,
        TripDay: { tripId },
      },
    });
    if (!item) {
      throw new NotFoundException(`活动 ${activityId} 不存在或不属于该行程`);
    }

    const mobile = await this.loadMobileMeta(tripId);
    const idemKey = opts?.idempotencyKey ?? `complete:${activityId}`;
    const existingCompletion = mobile.completedActivities?.[activityId];
    if (existingCompletion && opts?.idempotencyKey) {
      return this.writeResult(tripId, {
        activityId,
        completedAt: existingCompletion.completedAt,
        replay: true,
      });
    }

    const completedAt = body.completedAt ?? new Date().toISOString();
    mobile.completedActivities = {
      ...(mobile.completedActivities ?? {}),
      [activityId]: {
        completedAt,
        actualDurationMinutes: body.actualDurationMinutes,
        notes: body.notes,
        completedBy: userId,
      },
    };
    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = {
        ...(mobile.idempotencyKeys ?? {}),
        [opts.idempotencyKey]: activityId,
      };
    }

    await this.saveMobileMeta(tripId, mobile);
    return this.writeResult(tripId, {
      activityId,
      completedAt,
      actualDurationMinutes: body.actualDurationMinutes,
      replay: false,
    });
  }

  async sendSos(
    tripId: string,
    userId: string,
    body: {
      type?: string;
      location?: EmergencySosLocationDto | null;
      message?: string;
      shareWithTeam?: boolean;
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);

    let sosType;
    try {
      sosType = resolveEmergencySosType(body.type);
    } catch {
      throw new BadRequestException(
        `type 必须是: medical | lost | accident | vehicle | weather | other`,
      );
    }

    const mobile = await this.loadMobileMeta(tripId);

    if (opts?.idempotencyKey) {
      const existingSosId = mobile.idempotencyKeys?.[opts.idempotencyKey];
      if (existingSosId) {
        const history = await this.tripEmergency.getSOSHistory(tripId);
        const existing = history.find((h) => h.sosId === existingSosId);
        if (existing) {
          return this.writeResult(tripId, { sos: existing, replay: true });
        }
      }
    }

    const shareWithTeam = body.shareWithTeam !== false;
    const typeLabel = EMERGENCY_SOS_TYPE_LABELS[sosType];
    const sosMessage = body.message?.trim() || undefined;

    const notifyContacts = shareWithTeam
      ? await this.emergencyContacts.listNotifyOnSosContacts(userId)
      : [];

    const sos = await this.tripEmergency.sendSOS({
      tripId,
      userId,
      type: sosType,
      latitude: body.location?.lat ?? null,
      longitude: body.location?.lng ?? null,
      message: sosMessage,
      shareWithTeam,
      notifiedEmergencyContacts: notifyContacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
    });

    const event: MobileStoredEvent = {
      id: randomUUID(),
      type: 'sos',
      title: `SOS · ${typeLabel}`,
      severity: 'critical',
      location: body.location ?? undefined,
      description: sosMessage,
      recordedBy: userId,
      recordedAt: new Date().toISOString(),
    };
    mobile.events = [...(mobile.events ?? []), event];

    if (shareWithTeam) {
      const leaderIds = await this.loadLeaderUserIds(tripId);
      if (leaderIds.length > 0) {
        const senderName = await this.resolveUserDisplayName(userId);
        const locationLine = body.location
          ? `📍 ${body.location.lat.toFixed(5)}, ${body.location.lng.toFixed(5)}`
          : '位置未知';
        const notification: MobileStoredNotification = {
          id: randomUUID(),
          recipientIds: leaderIds.filter((id) => id !== userId),
          type: 'risk_alert',
          title: `SOS · ${typeLabel}`,
          body: [senderName, '发起紧急求助', sosMessage, locationLine].filter(Boolean).join(' · '),
          attachments: { includeLocation: !!body.location },
          sentBy: userId,
          sentAt: new Date().toISOString(),
        };
        if (notification.recipientIds.length > 0) {
          mobile.notifications = [...(mobile.notifications ?? []), notification];
        }
      }
    }

    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = {
        ...(mobile.idempotencyKeys ?? {}),
        [opts.idempotencyKey]: sos.sosId,
      };
    }

    await this.saveMobileMeta(tripId, mobile);

    const result = await this.writeResult(tripId, { sos, replay: false });
    if (!(result as { replay?: boolean }).replay) {
      const leaderIds = await this.loadLeaderUserIds(tripId);
      this.emitPush(result, {
        tripId,
        recipientUserIds: leaderIds,
        eventType: 'sos',
        title: `SOS · ${typeLabel}`,
        body: sosMessage ?? '成员发起紧急求助',
        changedSections: ['execution', 'risks', 'team', 'notifications'],
        sosId: sos.sosId,
        excludeUserId: userId,
      });
    }
    return result;
  }

  async getActiveSos(tripId: string, userId: string) {
    await this.access.assertTripMember(tripId, userId);
    return this.tripEmergency.getActiveSOS(tripId);
  }

  async acknowledgeSos(tripId: string, userId: string, sosId: string) {
    await this.assertWrite(tripId, userId);
    const isLeader = await this.isTripLeader(tripId, userId);
    if (!isLeader) {
      throw new ForbiddenException('仅领队可确认收到 SOS');
    }
    const displayName = await this.resolveUserDisplayName(userId);
    const active = await this.tripEmergency.acknowledgeSOS(tripId, sosId, {
      userId,
      displayName,
    });
    const result = await this.writeResult(tripId, { activeSos: active });
    if (active.sos?.userId) {
      this.emitPush(result, {
        tripId,
        recipientUserIds: [active.sos.userId],
        eventType: 'sos',
        title: 'SOS 已收到',
        body: `${displayName} 已确认收到你的求助`,
        changedSections: ['execution', 'risks', 'team'],
        sosId,
        excludeUserId: userId,
      });
    }
    return result;
  }

  async resolveSos(
    tripId: string,
    userId: string,
    sosId: string,
    body: { reason: EmergencySosResolveReason; comment?: string },
    opts?: { ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    if (!EMERGENCY_SOS_RESOLVE_REASONS.includes(body.reason)) {
      throw new BadRequestException('reason 必须是 false_alarm | resolved | cancelled');
    }

    const isLeader = await this.isTripLeader(tripId, userId);
    const displayName = await this.resolveUserDisplayName(userId);
    const sos = await this.tripEmergency.resolveSOS(
      tripId,
      sosId,
      { userId, displayName, isLeader },
      { reason: body.reason, comment: body.comment },
    );

    const mobile = await this.loadMobileMeta(tripId);
    if (mobile.emergencyLocationShare?.userId === userId) {
      delete mobile.emergencyLocationShare;
      await this.saveMobileMeta(tripId, mobile);
    }

    const result = await this.writeResult(tripId, {
      sos,
      activeSos: { active: false },
      sosResolved: true,
    });
    const memberIds = await this.mobilePush.listTripMemberIds(tripId, userId);
    this.emitPush(result, {
      tripId,
      recipientUserIds: memberIds,
      eventType: 'sos',
      title: 'SOS 已解除',
      body: body.comment?.trim() || '紧急求助已结束',
      changedSections: ['execution', 'risks', 'team', 'notifications'],
      sosId,
      excludeUserId: userId,
    });
    return result;
  }

  async startEmergencyLocationShare(
    tripId: string,
    userId: string,
    body: { sosId?: string },
    opts?: { ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    const active = await this.tripEmergency.getActiveSOS(tripId);
    if (!active.active) {
      throw new BadRequestException('无进行中的 SOS，无法开启紧急位置共享');
    }
    if (active.sos?.userId && active.sos.userId !== userId) {
      throw new ForbiddenException('仅 SOS 发起者可开启紧急位置共享');
    }

    const mobile = await this.loadMobileMeta(tripId);
    mobile.emergencyLocationShare = {
      active: true,
      userId,
      sosId: body.sosId ?? active.sos?.sosId ?? null,
      mode: 'emergency',
      intervalSeconds: EMERGENCY_LOCATION_SHARE_INTERVAL_SECONDS,
      startedAt: new Date().toISOString(),
    };
    await this.saveMobileMeta(tripId, mobile);

    return this.writeResult(tripId, {
      locationShare: mobile.emergencyLocationShare,
    });
  }

  async stopEmergencyLocationShare(tripId: string, userId: string, opts?: { ifMatch?: number }) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    const mobile = await this.loadMobileMeta(tripId);
    if (mobile.emergencyLocationShare?.userId !== userId) {
      throw new ForbiddenException('仅本人可关闭紧急位置共享');
    }
    delete mobile.emergencyLocationShare;
    await this.saveMobileMeta(tripId, mobile);
    return this.writeResult(tripId, { locationShare: { active: false } });
  }

  async createNavigationSession(
    tripId: string,
    userId: string,
    body: {
      activityId: string;
      destinationId: string;
      shareWithTeam?: boolean;
    },
    opts?: { idempotencyKey?: string; ifMatch?: number },
  ) {
    await this.assertWrite(tripId, userId, opts?.ifMatch);
    if (!body.activityId?.trim() || !body.destinationId?.trim()) {
      throw new BadRequestException('activityId 与 destinationId 不能为空');
    }

    const mobile = await this.loadMobileMeta(tripId);
    if (opts?.idempotencyKey) {
      const existingId = mobile.idempotencyKeys?.[opts.idempotencyKey];
      const existing = existingId ? mobile.navigationSessions?.[existingId] : undefined;
      if (existing) {
        return this.writeResult(tripId, { session: existing, replay: true });
      }
    }

    const session: MobileNavigationSessionDto = {
      id: randomUUID(),
      activityId: body.activityId,
      destinationId: body.destinationId,
      shareWithTeam: body.shareWithTeam ?? true,
      startedAt: new Date().toISOString(),
      startedBy: userId,
    };

    mobile.navigationSessions = {
      ...(mobile.navigationSessions ?? {}),
      [session.id]: session,
    };
    if (opts?.idempotencyKey) {
      mobile.idempotencyKeys = {
        ...(mobile.idempotencyKeys ?? {}),
        [opts.idempotencyKey]: session.id,
      };
    }

    await this.saveMobileMeta(tripId, mobile);
    return this.writeResult(tripId, { session, replay: false });
  }

  async sendIntercomVoiceMessage(
    tripId: string,
    userId: string,
    audioBuffer: Buffer,
    options: {
      durationSeconds?: number;
      clientId?: string;
      language?: string;
      format?: string;
      idempotencyKey?: string;
      ifMatch?: number;
    },
  ): Promise<MobileIntercomMessageResultDto & { contextVersion: number; planVersion?: number }> {
    await this.assertWrite(tripId, userId, options.ifMatch);

    if (!isInTripCommsEnabled()) {
      throw new ServiceUnavailableException({
        code: 'COMMS_EXECUTION_DISABLED',
        message: '行中对讲未启用，请设置 IN_TRIP_COMMS_ENABLED=true',
      });
    }
    if (!audioBuffer?.length || audioBuffer.length < 64) {
      throw new BadRequestException({
        code: 'INTERCOM_AUDIO_INVALID',
        message: '请上传有效的音频文件（建议 m4a/webm，>64 bytes）',
      });
    }

    const mobile = await this.loadMobileMeta(tripId);
    const clientId = options.clientId ?? randomUUID();

    if (options.idempotencyKey) {
      const storedClientId = mobile.idempotencyKeys?.[options.idempotencyKey];
      if (storedClientId) {
        return this.writeResult(tripId, {
          message: {
            clientId: storedClientId,
            type: 'voice' as const,
            body: '(replay)',
          },
          replay: true,
        });
      }
    }

    let transcription: Awaited<ReturnType<InTripCommsTranscribeService['transcribe']>>;
    try {
      transcription = await this.commsTranscribe.transcribe(tripId, userId, audioBuffer, {
        language: options.language,
        format: options.format,
        clientId,
        durationSec: options.durationSeconds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('fetch failed') || message.includes('VoiceService')) {
        throw new ServiceUnavailableException({
          code: 'TRANSCRIBE_PROVIDER_UNAVAILABLE',
          message: '语音转写服务不可用，请确认 VoiceService 配置或使用真实音频联调',
        });
      }
      throw err;
    }

    const clientSeq = (mobile.lastCommsClientSeq ?? 0) + 1;
    const mimeType = resolveCommsAudioMimeType(options.format);
    const storedAudio = await this.commsAudio.save(tripId, audioBuffer, {
      mimeType,
      fileName: resolveCommsAudioFileName(clientId, mimeType),
    });

    const syncResult = await this.comms.sync(tripId, userId, {
      messages: [
        {
          clientId,
          clientSeq,
          type: 'voice',
          body: transcription.transcript,
          audio: {
            durationSec: transcription.durationSec,
            transcriptId: transcription.transcriptId,
            mimeType: storedAudio.mimeType,
            storageKey: storedAudio.storageKey,
            fileUrl: storedAudio.fileUrl,
          },
          createdAt: new Date().toISOString(),
          metadata: {
            transport: 'cloud',
            deliveryStatus: 'sent',
          },
        },
      ],
    });

    mobile.lastCommsClientSeq = clientSeq;
    if (options.idempotencyKey) {
      mobile.idempotencyKeys = {
        ...(mobile.idempotencyKeys ?? {}),
        [options.idempotencyKey]: clientId,
      };
    }
    await this.saveMobileMeta(tripId, mobile);

    const persisted = await this.comms.getMessageByClientId(tripId, userId, clientId);

    const result = await this.writeResult(tripId, {
      message: {
        id: persisted?.id,
        clientId,
        type: 'voice' as const,
        body: transcription.transcript,
        transcript: transcription.transcript,
        transcriptId: transcription.transcriptId,
        durationSec: transcription.durationSec,
        durationSeconds: transcription.durationSec,
        audioUrl: persisted?.audio?.url,
        sentAt: new Date().toISOString(),
        deliveryStatus: 'sent' as const,
        serverSeq: syncResult.latestServerSeq,
      },
      replay: false,
      previewSummary: '语音已发送',
    });
    await this.emitIntercomMessageWs(tripId, userId, clientId, result.contextVersion);
    return result;
  }

  async getTodayProgress(tripId: string, userId: string, dayIndex?: number) {
    await this.access.assertTripMember(tripId, userId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const dayNumber = resolveDayNumber(trip.startDate, trip.endDate, undefined, dayIndex);
    const items = await this.mobileRead.getTodayItinerary(tripId, userId, { dayIndex: dayNumber });
    const completedCount = items.items.filter((i) => i.status === 'completed').length;
    const totalCount = items.items.length;
    const mobile = await this.loadMobileMeta(tripId);

    const eventLog = (mobile.events ?? []).slice(-20).map((e) => ({
      id: e.id,
      time: formatTimeHHmm(e.recordedAt),
      type: e.type,
      title: e.title,
      detail: e.description ?? '',
      actor: e.recordedBy,
    }));

    return {
      contextVersion: items.contextVersion,
      completedCount,
      totalCount,
      completionPercent: totalCount > 0 ? completedCount / totalCount : 0,
      currentDelay: items.items.find((i) => i.status === 'delayed')?.impactNote ?? '—',
      safetyScore: 85,
      teamCompletionRate: totalCount > 0 ? completedCount / totalCount : 0,
      milestones: items.items.map((i) => ({
        time: i.time,
        title: i.title,
        location: i.location ?? '—',
        status: mapItemStatusToMilestone(i.status),
      })),
      chartPoints: items.items.map((i, idx) => ({
        time: i.time,
        planned: idx + 1,
        actual: i.status === 'completed' ? idx + 1 : idx,
      })),
      eventLog,
    };
  }

  private assertWriteHeaders(opts: { ifMatch?: number; idempotencyKey?: string }) {
    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
  }

  private async assertWrite(tripId: string, userId: string, ifMatch?: number) {
    await this.access.assertTripMember(tripId, userId);
    if (ifMatch == null) return;

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const current = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    if (current !== ifMatch) {
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        message: 'contextVersion 已过期，请刷新后重试',
        currentContextVersion: current,
      });
    }
  }

  private async emitIntercomMessageWs(
    tripId: string,
    senderId: string,
    clientId: string,
    contextVersion: number,
  ): Promise<void> {
    if (!isInTripCommsEnabled()) return;
    try {
      const row = await this.comms.getMessageByClientId(tripId, senderId, clientId);
      if (!row) return;
      const senderName = await this.resolveUserDisplayName(senderId);
      const message = projectIntercomMessage(
        { ...row, senderDisplayName: senderName },
        senderId,
      );
      this.contextNotifier.notifyIntercomMessage({
        tripId,
        contextVersion,
        message,
      });
    } catch {
      // WS 广播失败不阻断写操作
    }
  }

  private async writeResult<T extends Record<string, unknown>>(
    tripId: string,
    payload: T,
  ): Promise<{ contextVersion: number; planVersion?: number } & T> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const planVersion = snapshot?.bindings?.constraintsVersion ?? undefined;
    const contextVersion = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip!.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });
    const result = { contextVersion, planVersion, ...payload } as { contextVersion: number; planVersion?: number } & T;
    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      planVersion,
      changedSections: inferChangedSections(payload),
    });
    return result;
  }

  private emitPush(
    result: { contextVersion: number; planVersion?: number },
    input: Omit<NotifyTripPushInput, 'contextVersion' | 'planVersion'>,
  ) {
    this.mobilePush.notifyTripEvent({
      ...input,
      contextVersion: result.contextVersion,
      planVersion: result.planVersion,
    });
  }

  private async isTripLeader(tripId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.tripCollaborator.findFirst({
      where: { tripId, userId, role: { in: ['OWNER', 'EDITOR'] } },
    });
    return !!row;
  }

  private async loadLeaderUserIds(tripId: string): Promise<string[]> {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: {
        tripId,
        role: { in: ['OWNER', 'EDITOR'] },
      },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async resolveUserDisplayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    return user?.displayName ?? user?.email?.split('@')[0] ?? '成员';
  }

  private async loadMobileMeta(tripId: string): Promise<MobileExecutionMetadata> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    return (metadata.mobileExecution as MobileExecutionMetadata) ?? {};
  }

  private async saveMobileMeta(tripId: string, mobile: MobileExecutionMetadata) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          mobileExecution: mobile,
        }),
      },
    });
  }
}

function mapItemStatusToMilestone(
  status: MobileExecutionItemStatus,
): 'completed' | 'inProgress' | 'upcoming' {
  if (status === 'completed') return 'completed';
  if (status === 'inProgress' || status === 'delayed' || status === 'risk') return 'inProgress';
  return 'upcoming';
}

function inferChangedSections(payload: Record<string, unknown>): TripContextChangedSection[] {
  if ('event' in payload) return ['execution', 'events'];
  if ('notification' in payload) return ['execution', 'notifications', 'team', 'intercom'];
  if ('activityId' in payload && 'patched' in payload) return ['plan', 'itinerary', 'execution'];
  if ('activityId' in payload && 'completedAt' in payload) return ['execution', 'itinerary'];
  if ('sos' in payload) return ['execution', 'risks', 'team', 'notifications'];
  if ('sosResolved' in payload || 'activeSos' in payload) {
    return ['execution', 'risks', 'team', 'notifications'];
  }
  if ('locationShare' in payload) return ['execution', 'team'];
  if ('session' in payload) return ['execution', 'navigation'];
  if ('message' in payload) return ['execution', 'team', 'intercom'];
  return ['execution'];
}
