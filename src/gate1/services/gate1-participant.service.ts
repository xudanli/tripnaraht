import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GATE1_CONSENT_ITEMS,
  GATE1_CONSENT_TEXT_BY_TYPE,
  GATE1_CONSENT_TYPES,
  GATE1_CONSENT_VERSION,
} from '../constants/gate1.constants';
import {
  ConsentDto,
  CreateInvitationDto,
  SavePreferencesDto,
  AcceptInvitationDto,
} from '../dto/gate1.dto';
import {
  canSubmitPrivateConstraints,
  canSubmitPublicPreferences,
} from '../utils/gate1-consent.util';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1CryptoService } from './gate1-crypto.service';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1ParticipantNotificationService } from './gate1-participant-notification.service';
import { generateInviteToken } from './gate1-project.service';
import { buildInvitePath } from '../utils/gate1-project-fit-bridge.util';
import { Gate1RuntimeEventService } from '../../decision-runtime/services/gate1-runtime-event.service';
import type { Gate1RuntimeEmitResult } from '../../decision-runtime/types/gate1-runtime-emit.types';

type ResolveOptions = { allowExpired?: boolean };

@Injectable()
export class Gate1ParticipantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly crypto: Gate1CryptoService,
    private readonly notifications: Gate1ParticipantNotificationService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async createInvitation(projectId: string, actorId: string, dto: CreateInvitationDto) {
    const project = await this.guard.requireProject(projectId);
    if (!['BASELINE_READY', 'COLLECTING'].includes(project.experimentStatus)) {
      throw new BadRequestException('Invitations require BASELINE_READY or COLLECTING status');
    }

    const token = generateInviteToken();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86400000)
      : new Date(Date.now() + 14 * 86400000);

    const participant = await this.prisma.gate1Participant.create({
      data: {
        projectId,
        displayName: dto.displayName,
        contactHint: dto.contactHint ?? null,
        inviteToken: token,
        inviteExpiresAt: expiresAt,
        status: 'INVITED',
      },
    });

    if (project.experimentStatus === 'BASELINE_READY') {
      await this.guard.transitionProject(projectId, 'COLLECTING');
    }

    await this.analytics.track(projectId, project.cohort, 'invitation_sent', {
      actorId,
      participantId: participant.id,
      properties: { channel: 'link' },
    });

    const invitePath = buildInvitePath(token);
    await this.notifications.queueAndSend({
      eventType: 'participant_invite_sent',
      dedupeKey: `invite:${participant.id}`,
      title: `邀请您加入「${project.title}」`,
      body: `您被邀请参与 TripNARA 旅行协作。预计 3-5 分钟完成首次填写。打开链接：${invitePath}`,
      projectId,
      participantId: participant.id,
      recipientEmail: dto.contactHint?.includes('@') ? dto.contactHint : undefined,
    });

    return {
      participant,
      inviteUrl: invitePath,
    };
  }

  async resolveByToken(token: string, options?: ResolveOptions) {
    const participant = await this.prisma.gate1Participant.findUnique({
      where: { inviteToken: token },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            destination: true,
            cohort: true,
            advisorUserId: true,
            experimentStatus: true,
            startDate: true,
            endDate: true,
          },
        },
        consentRecords: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!participant) throw new NotFoundException('Invitation not found');
    if (participant.inviteRevokedAt) throw new ForbiddenException('Invitation revoked');

    const expired =
      participant.inviteExpiresAt != null && participant.inviteExpiresAt < new Date();
    if (expired && !options?.allowExpired) {
      throw new ForbiddenException('Invitation expired');
    }

    return { ...participant, inviteExpired: expired };
  }

  async openInvitation(token: string) {
    const participant = await this.resolveByToken(token, { allowExpired: true });

    if (participant.inviteExpired) {
      return {
        expired: true,
        canRequestResend: true,
        message: '邀请已过期，可申请重新发送',
        project: participant.project,
        participant: {
          id: participant.id,
          displayName: participant.displayName,
          status: participant.status,
        },
        consentCatalog: this.buildConsentCatalogPayload(),
      };
    }

    if (participant.status === 'INVITED') {
      await this.prisma.gate1Participant.update({
        where: { id: participant.id },
        data: { status: 'OPENED', openedAt: new Date() },
      });
      await this.analytics.track(
        participant.projectId,
        participant.project.cohort,
        'participant_invite_opened',
        { participantId: participant.id },
      );
    }

    const baseline = await this.prisma.gate1ExperimentBaseline.findFirst({
      where: { projectId: participant.projectId, isConfirmed: true },
      orderBy: { version: 'desc' },
    });

    return {
      expired: false,
      project: {
        ...participant.project,
        summary: baseline?.originalPlanSummary ?? null,
        dateRange:
          baseline?.startDate && baseline?.endDate
            ? { start: baseline.startDate, end: baseline.endDate }
            : null,
        participantCount: baseline?.participantCount ?? null,
      },
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        status: participant.status === 'INVITED' ? 'OPENED' : participant.status,
      },
      participationGuide: {
        estimatedMinutes: '3-5',
        steps: ['接受邀请', '完成知情同意', '填写偏好与可选私密约束', '查看方案并反馈'],
      },
      privacySummary: {
        publicPrefs: '团队/顾问按项目权限可见',
        privateConstraints: '仅本人与指定隐私分析员可见原文；顾问仅见脱敏结论',
      },
      consentCatalog: this.buildConsentCatalogPayload(),
    };
  }

  async acceptInvitation(token: string, dto?: AcceptInvitationDto) {
    const participant = await this.resolveByToken(token);
    if (['DECLINED', 'WITHDRAWN', 'DELETED'].includes(participant.status)) {
      throw new BadRequestException('Invitation no longer active');
    }

    const userId = dto?.userId ?? participant.userId;
    if (userId && participant.userId && participant.userId !== userId && !dto?.confirmMismatch) {
      return {
        needsConfirmation: true,
        reason: 'ACCOUNT_MISMATCH',
        message: '当前登录账号与邀请目标不一致，请确认是否继续绑定',
      };
    }

    if (
      dto?.contactEmail &&
      participant.contactHint &&
      participant.contactHint.toLowerCase() !== dto.contactEmail.toLowerCase() &&
      !dto?.confirmMismatch
    ) {
      return {
        needsConfirmation: true,
        reason: 'CONTACT_MISMATCH',
        message: '登录邮箱与邀请联系方式不一致，请确认是否继续',
      };
    }

    const status =
      participant.status === 'CONSENTED' ||
      participant.status === 'IN_PROGRESS' ||
      participant.status === 'SUBMITTED'
        ? participant.status
        : 'JOINED';

    await this.prisma.gate1Participant.update({
      where: { id: participant.id },
      data: {
        status,
        acceptedAt: participant.acceptedAt ?? new Date(),
        userId: userId ?? null,
      },
    });

    await this.analytics.track(
      participant.projectId,
      participant.project.cohort,
      'participant_invite_accepted',
      {
        participantId: participant.id,
        properties: { userIdBound: !!userId, confirmMismatch: dto?.confirmMismatch ?? false },
      },
    );

    return { status: 'JOINED', participantId: participant.id, needsConfirmation: false };
  }

  async listProjectsForUser(userId: string) {
    const rows = await this.prisma.gate1Participant.findMany({
      where: {
        userId,
        status: { notIn: ['DECLINED', 'WITHDRAWN', 'DELETED'] },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            destination: true,
            experimentStatus: true,
            cohort: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    return rows.map((r) => ({
      participantId: r.id,
      inviteToken: r.inviteToken,
      displayName: r.displayName,
      status: r.status,
      role: r.role,
      project: r.project,
      portalPath: `/participant/projects/${r.inviteToken}/dashboard`,
    }));
  }

  async recordConsent(token: string, dto: ConsentDto) {
    const participant = await this.resolveByToken(token);

    if (dto.action === 'DECLINE') {
      await this.prisma.gate1Participant.update({
        where: { id: participant.id },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: dto.declineReason ?? null,
        },
      });
      return { status: 'DECLINED' };
    }

    const grants = dto.consents ?? {
      BASE_SERVICE: true,
      HUMAN_ASSISTED: dto.humanAssisted ?? true,
      RESEARCH: dto.research ?? false,
      ANONYMIZED_CASE: dto.anonymizedCase ?? false,
    };

    if (!grants.BASE_SERVICE) {
      throw new BadRequestException('BASE_SERVICE consent is required to join');
    }

    const grantedTypes = GATE1_CONSENT_TYPES.filter((type) => grants[type]);

    const staged: Gate1RuntimeEmitResult[] = [];

    const humanAssistedGranted = grants.HUMAN_ASSISTED === true;
    const newStatus = humanAssistedGranted ? 'CONSENTED' : 'JOINED';

    await this.prisma.$transaction(async (tx) => {
      for (const type of grantedTypes) {
        await tx.gate1ConsentRecord.create({
          data: {
            participantId: participant.id,
            consentType: type,
            consentVersion: GATE1_CONSENT_VERSION,
            consentText: GATE1_CONSENT_TEXT_BY_TYPE[type],
            status: 'GRANTED',
            grantedAt: new Date(),
            scope: { type, label: GATE1_CONSENT_ITEMS[type].label },
          },
        });
      }

      await tx.gate1Participant.update({
        where: { id: participant.id },
        data: {
          status: newStatus,
          consentedAt: humanAssistedGranted ? new Date() : participant.consentedAt,
          acceptedAt: participant.acceptedAt ?? new Date(),
        },
      });

      if (humanAssistedGranted) {
        const emitResult = await this.runtimeEvents.participantConsented({
          projectId: participant.projectId,
          participantId: participant.id,
          actorId: participant.userId ?? participant.id,
          grantedConsentTypes: grantedTypes,
          humanAssistedGranted,
          tx,
        });
        if (emitResult) staged.push(emitResult);
      }
    });

    this.runtimeEvents.flushStaged(staged);

    await this.analytics.track(
      participant.projectId,
      participant.project.cohort,
      'participant_consent_completed',
      {
        participantId: participant.id,
        properties: {
          consentVersion: GATE1_CONSENT_VERSION,
          manualAssistanceAck: humanAssistedGranted,
          grantedTypes,
        },
      },
    );

    return {
      status: newStatus,
      humanAssistedGranted,
      canSubmitPreferences: humanAssistedGranted && grants.BASE_SERVICE,
      canSubmitPrivateConstraints: humanAssistedGranted,
    };
  }

  async savePreferences(token: string, dto: SavePreferencesDto) {
    const participant = await this.resolveByToken(token);
    const consents = await this.prisma.gate1ConsentRecord.findMany({
      where: { participantId: participant.id },
    });

    if (!canSubmitPublicPreferences(consents)) {
      throw new BadRequestException(
        'Complete required consents (BASE_SERVICE + HUMAN_ASSISTED) before preferences',
      );
    }

    if (!['CONSENTED', 'IN_PROGRESS', 'SUBMITTED', 'JOINED'].includes(participant.status)) {
      throw new BadRequestException('Consent required before preferences');
    }

    if (dto.privateConstraints?.length && !canSubmitPrivateConstraints(consents)) {
      throw new BadRequestException(
        'HUMAN_ASSISTED consent required for private constraints (TC-02)',
      );
    }

    const startedNow = !participant.formStartedAt;
    if (startedNow) {
      await this.analytics.track(
        participant.projectId,
        participant.project.cohort,
        'preference_form_started',
        { participantId: participant.id },
      );
    }

    const latestPref = await this.prisma.gate1PreferenceResponse.findFirst({
      where: { participantId: participant.id },
      orderBy: { version: 'desc' },
    });

    let version = 1;
    if (latestPref) {
      version = latestPref.status === 'SUBMITTED' ? latestPref.version + 1 : latestPref.version;
    }

    const staged: Gate1RuntimeEmitResult[] = [];

    const pref = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.gate1PreferenceResponse.upsert({
        where: {
          participantId_version: { participantId: participant.id, version },
        },
        create: {
          participantId: participant.id,
          version,
          publicPrefs: asInputJson(dto.publicPrefs)!,
          status: dto.submit ? 'SUBMITTED' : 'DRAFT',
          submittedAt: dto.submit ? new Date() : null,
        },
        update: {
          publicPrefs: asInputJson(dto.publicPrefs)!,
          status: dto.submit ? 'SUBMITTED' : 'DRAFT',
          submittedAt: dto.submit ? new Date() : null,
        },
      });

      if (dto.privateConstraints?.length) {
        for (const item of dto.privateConstraints) {
          const created = await tx.gate1PrivateConstraint.create({
            data: {
              participantId: participant.id,
              fieldKey: item.fieldKey,
              encryptedValue: this.crypto.encrypt(item.value),
              authorizationLevel: item.authorizationLevel,
              status: 'ACTIVE',
            },
          });
          const emitResult = await this.runtimeEvents.constraintRecorded({
            projectId: participant.projectId,
            constraintId: created.id,
            participantId: participant.id,
            fieldKey: item.fieldKey,
            visibility: 'PRIVATE',
            actorId: participant.userId ?? participant.id,
            tx,
          });
          if (emitResult) staged.push(emitResult);
        }
      }

      const status = dto.submit ? 'SUBMITTED' : 'IN_PROGRESS';
      await tx.gate1Participant.update({
        where: { id: participant.id },
        data: {
          status,
          formStartedAt: participant.formStartedAt ?? new Date(),
          submittedAt: dto.submit ? new Date() : participant.submittedAt,
        },
      });

      if (dto.submit) {
        const emitResult = await this.runtimeEvents.constraintRecorded({
          projectId: participant.projectId,
          constraintId: saved.id,
          participantId: participant.id,
          fieldKey: 'public_preferences',
          visibility: 'PUBLIC',
          actorId: participant.userId ?? participant.id,
          tx,
        });
        if (emitResult) staged.push(emitResult);
      }

      return saved;
    });

    this.runtimeEvents.flushStaged(staged);

    if (dto.privateConstraints?.length) {
      for (const item of dto.privateConstraints) {
        await this.analytics.track(
          participant.projectId,
          participant.project.cohort,
          'private_constraint_added',
          {
            participantId: participant.id,
            properties: {
              constraintType: item.fieldKey,
              requestHumanContact: item.requestHumanContact ?? false,
            },
          },
        );
      }
    }

    if (dto.submit) {
      const privateUsed = (dto.privateConstraints?.length ?? 0) > 0;
      await this.analytics.track(
        participant.projectId,
        participant.project.cohort,
        'preference_form_submitted',
        {
          participantId: participant.id,
          properties: { privateUsed, version },
        },
      );
    }

    return pref;
  }

  async withdraw(token: string) {
    const participant = await this.resolveByToken(token, { allowExpired: true });
    await this.prisma.gate1Participant.update({
      where: { id: participant.id },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    await this.prisma.gate1ConsentRecord.updateMany({
      where: { participantId: participant.id, status: 'GRANTED' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.prisma.gate1PrivateConstraint.updateMany({
      where: { participantId: participant.id },
      data: { status: 'WITHDRAWN' },
    });

    await this.analytics.track(
      participant.projectId,
      participant.project.cohort,
      'consent_withdrawn',
      { participantId: participant.id },
    );

    return { status: 'WITHDRAWN', deletionTicket: `gate1-delete-${participant.id}` };
  }

  async listProgress(projectId: string) {
    const participants = await this.prisma.gate1Participant.findMany({
      where: { projectId },
      select: {
        id: true,
        displayName: true,
        status: true,
        role: true,
        invitedAt: true,
        openedAt: true,
        acceptedAt: true,
        consentedAt: true,
        submittedAt: true,
        reminderCount: true,
      },
    });
    const submitted = participants.filter((p) => p.status === 'SUBMITTED').length;
    return {
      participants,
      completionRate: participants.length ? submitted / participants.length : 0,
    };
  }

  private buildConsentCatalogPayload() {
    return {
      version: GATE1_CONSENT_VERSION,
      items: GATE1_CONSENT_TYPES.map((type) => ({
        type,
        ...GATE1_CONSENT_ITEMS[type],
        text: GATE1_CONSENT_TEXT_BY_TYPE[type],
      })),
    };
  }
}
