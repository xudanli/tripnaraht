import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { successResponse } from '../../common/dto/standard-response.dto';
import { CreateTripFromNaturalLanguageDto } from '../dto/create-trip-from-nl.dto';
import { TripStatus } from '../dto/trip-status.dto';
import { NLConversationContextService } from './nl-conversation-context.service';
import { TripPlanningReadinessService } from './trip-planning-readiness.service';
import type {
  DraftTripInput,
  FeasibilityStatus,
  LightweightTripIntent,
  TripLifecycleStatus,
} from '../types/nl-draft-trip.types';
import { ProjectMembershipService } from '../../identity-governance/services/project-membership.service';

@Injectable()
export class NlTripCreationOrchestrator {
  private readonly logger = new Logger(NlTripCreationOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nlConversationContextService: NLConversationContextService,
    private readonly readinessService: TripPlanningReadinessService,
    private readonly projectMembership: ProjectMembershipService,
  ) {}

  async execute(dto: CreateTripFromNaturalLanguageDto, userId: string) {
    const sessionId = await this.prepareSession(dto, userId);
    const existingContext = await this.nlConversationContextService.getContext(sessionId, userId);
    await this.nlConversationContextService.addMessage(sessionId, userId, 'user', dto.text);

    const intent = this.parseLightweightIntent(dto.text);
    const readiness = this.readinessService.evaluateForDraft(intent);
    const draftInput: DraftTripInput = {
      userId,
      title: this.buildDraftTitle(intent),
      destinationCountryCode: intent.destinationCountryCode,
      destinationText: intent.destinationText,
      durationDays: intent.durationDays,
      rawUserIntent: dto.text,
      partialParams: intent as Record<string, unknown>,
    };

    const existingTripId =
      typeof existingContext?.partialParams?.tripId === 'string'
        ? existingContext.partialParams.tripId
        : undefined;
    const trip = await this.createOrUpdateDraftTrip(draftInput, existingTripId);
    const lifecycleStatus: TripLifecycleStatus = intent.destinationCountryCode || intent.destinationText
      ? 'INTENT_UNDERSTOOD'
      : 'IDEA_CAPTURED';
    const feasibilityStatus: FeasibilityStatus = 'NOT_CHECKED';
    const nowIso = new Date().toISOString();

    await this.nlConversationContextService.updateContext(sessionId, userId, {
      partialParams: {
        ...intent,
        tripId: trip.id,
        lifecycleStatus,
        planningReadiness: readiness.planningReadiness,
        feasibilityStatus,
      },
      currentIntentSnapshot: {
        confirmedParams: {
          tripId: trip.id,
          rawUserIntent: dto.text,
          destinationCountryCode: intent.destinationCountryCode,
          destinationText: intent.destinationText,
          durationDays: intent.durationDays,
          dateText: intent.dateText,
          datePrecision: intent.datePrecision,
        },
        lastConfirmedAt: nowIso,
      },
    });

    const plannerReply = this.buildFirstReply(intent, trip.name || '新的旅行想法', readiness.nextQuestion);
    const plannerResponseBlocks = this.buildPlannerBlocks(intent, readiness.nextQuestion);
    const clarificationQuestions = readiness.nextQuestion
      ? [
          {
            id: `v3_next_${Date.now()}`,
            question: readiness.nextQuestion,
            type: 'text',
            required: false,
            group: 'primary',
            metadata: {
              ...(readiness.nextQuestionPolicy || {}),
            },
          },
        ]
      : [];

    await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', plannerReply, {
      tripId: trip.id,
      needsClarification: clarificationQuestions.length > 0,
      needsConfirmation: false,
      showConfirmCard: false,
      parsedParams: intent as Record<string, any>,
      plannerResponseBlocks,
      clarificationQuestions,
      thinkingProcess: {
        summary: '已接住旅行愿望',
        content: '先创建 Draft Trip，再按策略、行程、验证分阶段补信息；Gate 和 Solver 不再阻止第一步创建。',
      },
      progressSteps: [
        { id: 'capture', label: '已创建 Draft Trip', status: 'completed', detail: `Trip ID: ${trip.id}` },
        { id: 'strategy', label: '准备生成初始方向', status: 'running' },
        { id: 'itinerary', label: '详细行程生成', status: 'pending' },
        { id: 'verify', label: '可行性验证', status: 'pending' },
      ],
      lifecycleStatus,
      planningReadiness: readiness.planningReadiness,
      feasibilityStatus,
    });

    return successResponse({
      sessionId,
      trip,
      tripId: trip.id,
      created: true,
      draftFirst: true,
      lifecycleStatus,
      planningReadiness: readiness.planningReadiness,
      feasibilityStatus,
      intent,
      plannerReply,
      plannerResponseBlocks,
      clarificationQuestions,
      strategyGeneration: {
        status: readiness.planningReadiness === 'INSUFFICIENT' ? 'waiting_for_minimum_identity' : 'queued',
        missingForStrategy: readiness.missingForStrategy,
      },
    });
  }

  private async prepareSession(dto: CreateTripFromNaturalLanguageDto, userId: string): Promise<string> {
    let sessionId = dto.sessionId;
    if (dto.isNewConversation || !sessionId) {
      try {
        await this.nlConversationContextService.deleteAllUserSessions(userId);
      } catch (error: any) {
        this.logger.warn(`清空旧 NL 会话失败，继续 v3 创建: ${error?.message}`);
      }
      sessionId = undefined;
    }
    return this.nlConversationContextService.getOrCreateSession(sessionId, userId);
  }

  private async createOrUpdateDraftTrip(input: DraftTripInput, existingTripId?: string) {
    const dateWindow = this.resolveStorageDateWindow(input.partialParams as Partial<LightweightTripIntent>);
    const metadata = this.buildDraftMetadata(input, dateWindow);
    const destination = input.destinationCountryCode || input.destinationText || 'UNSPECIFIED';

    if (existingTripId) {
      const existing = await this.prisma.trip.findUnique({ where: { id: existingTripId } });
      if (existing) {
        return this.prisma.trip.update({
          where: { id: existingTripId },
          data: {
            name: input.title || existing.name,
            destination,
            startDate: dateWindow.startDate.toJSDate(),
            endDate: dateWindow.endDate.toJSDate(),
            status: TripStatus.DRAFT,
            metadata: { ...((existing.metadata as Record<string, unknown>) || {}), ...metadata } as any,
            updatedAt: new Date(),
          },
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          name: input.title,
          destination,
          startDate: dateWindow.startDate.toJSDate(),
          endDate: dateWindow.endDate.toJSDate(),
          status: TripStatus.DRAFT,
          metadata: metadata as any,
          updatedAt: new Date(),
        } as any,
      });
      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId: trip.id,
          userId: input.userId,
          role: 'OWNER',
          updatedAt: new Date(),
        } as any,
      });
      await this.projectMembership.syncFromCollaborator(trip.id, input.userId, 'OWNER', tx);
      return trip;
    });
  }

  private buildDraftMetadata(input: DraftTripInput, dateWindow: { startDate: DateTime; endDate: DateTime; placeholderDates: boolean }) {
    const lifecycleStatus: TripLifecycleStatus = input.destinationCountryCode || input.destinationText
      ? 'INTENT_UNDERSTOOD'
      : 'IDEA_CAPTURED';
    return {
      createdFromNaturalLanguage: true,
      nlDraft: {
        version: 1,
        rawUserIntent: input.rawUserIntent,
        destinationCountryCode: input.destinationCountryCode,
        destinationText: input.destinationText,
        durationDays: input.durationDays,
        partialParams: input.partialParams,
        placeholderDates: dateWindow.placeholderDates,
        createdAt: new Date().toISOString(),
      },
      lifecycleStatus,
      planningReadiness: 'PARTIAL',
      feasibilityStatus: 'NOT_CHECKED',
      planningStages: {
        tripDaysInitialized: false,
        strategyGenerated: false,
        itineraryGenerated: false,
        feasibilityChecked: false,
      },
    };
  }

  private resolveStorageDateWindow(intent: Partial<LightweightTripIntent>): {
    startDate: DateTime;
    endDate: DateTime;
    placeholderDates: boolean;
  } {
    const now = DateTime.now().startOf('day');
    const durationDays = Math.max(1, Math.min(60, intent.durationDays || 1));
    const monthMatch = intent.dateText?.match(/(\d{1,2})\s*月/);
    if (monthMatch) {
      const month = Number(monthMatch[1]);
      if (month >= 1 && month <= 12) {
        const year = month >= now.month ? now.year : now.year + 1;
        const startDate = DateTime.local(year, month, 1);
        return { startDate, endDate: startDate.plus({ days: durationDays - 1 }), placeholderDates: true };
      }
    }
    return { startDate: now, endDate: now.plus({ days: durationDays - 1 }), placeholderDates: true };
  }

  private parseLightweightIntent(text: string): LightweightTripIntent {
    const destination = this.detectDestination(text);
    const durationDays = this.detectDurationDays(text);
    const companions = this.detectCompanions(text);
    const mustHaveExperiences = this.detectExperiences(text);
    const constraints = this.detectConstraints(text);
    const dateText = this.detectDateText(text);
    return {
      destinationCountryCode: destination.countryCode,
      destinationText: destination.text,
      dateText,
      datePrecision: dateText ? 'MONTH' : 'NONE',
      durationDays,
      companions,
      mustHaveExperiences,
      constraints,
      pace: this.detectPace(text, companions, constraints),
    };
  }

  private detectDestination(text: string): { countryCode?: string; text?: string } {
    const destinationMap: Array<[RegExp, string, string]> = [
      [/冰岛|iceland/i, 'IS', '冰岛'],
      [/日本|东京|大阪|京都|japan/i, 'JP', '日本'],
      [/新西兰|new zealand/i, 'NZ', '新西兰'],
      [/挪威|norway|罗弗敦|lofoten/i, 'NO', '挪威'],
      [/格陵兰|greenland/i, 'GL', '格陵兰'],
      [/斯瓦尔巴|svalbard/i, 'SJ', '斯瓦尔巴'],
      [/阿尔卑斯|alps|瑞士|switzerland/i, 'AL', '阿尔卑斯'],
      [/西藏|tibet/i, 'XZ', '西藏'],
    ];
    for (const [pattern, countryCode, label] of destinationMap) {
      if (pattern.test(text)) return { countryCode, text: label };
    }
    const loose = text.match(/去([^，。,.]{2,12})/);
    return loose ? { text: loose[1].trim() } : {};
  }

  private detectDurationDays(text: string): number | undefined {
    const m = text.match(/(\d{1,2})\s*(天|日|days?)/i);
    if (!m) return undefined;
    const days = Number(m[1]);
    return days > 0 && days <= 60 ? days : undefined;
  }

  private detectDateText(text: string): string | undefined {
    const month = text.match(/(\d{1,2})\s*月/);
    if (month) return month[0];
    const season = text.match(/暑假|寒假|国庆|春节|夏天|冬天|秋天|春天/);
    return season?.[0];
  }

  private detectCompanions(text: string): string[] {
    const companions: string[] = [];
    if (/父母|爸妈|老人|长辈/.test(text)) companions.push('PARENTS');
    if (/孩子|小孩|带娃|亲子/.test(text)) companions.push('CHILDREN');
    if (/情侣|蜜月|伴侣/.test(text)) companions.push('COUPLE');
    if (/朋友|同学|同事/.test(text)) companions.push('FRIENDS');
    return companions.length ? companions : ['ADULTS'];
  }

  private detectExperiences(text: string): string[] {
    const atoms: string[] = [];
    if (/冰川|冰洞|glacier/i.test(text)) atoms.push('GLACIER_ADVENTURE');
    if (/极光|aurora/i.test(text)) atoms.push('AURORA');
    if (/摄影|拍照|photo/i.test(text)) atoms.push('CINEMATIC_PHOTOGRAPHY');
    if (/温泉|spa/i.test(text)) atoms.push('HOT_SPRING');
    if (/世界尽头|荒野|孤独|小众/.test(text)) atoms.push('REMOTE_WORLD_EDGE');
    return atoms;
  }

  private detectConstraints(text: string): string[] {
    const constraints: string[] = [];
    if (/不想.*累|不要.*累|少走路|轻松|舒适/.test(text)) constraints.push('LOW_PHYSICAL_LOAD');
    if (/不自驾|不开车/.test(text)) constraints.push('NO_SELF_DRIVE');
    if (/预算有限|省钱|便宜/.test(text)) constraints.push('BUDGET_SENSITIVE');
    return constraints;
  }

  private detectPace(
    text: string,
    companions: string[],
    constraints: string[],
  ): LightweightTripIntent['pace'] {
    if (/特种兵|紧凑|多安排|尽量多/.test(text)) return 'INTENSIVE';
    if (/轻松|舒适|慢|不赶|少走路/.test(text) || companions.includes('PARENTS') || constraints.includes('LOW_PHYSICAL_LOAD')) {
      return 'RELAXED';
    }
    return undefined;
  }

  private buildDraftTitle(intent: LightweightTripIntent): string {
    const destination = intent.destinationText || intent.destinationCountryCode || '新的旅行';
    if (intent.companions.includes('PARENTS')) return `${destination}家庭探索之旅`;
    if (intent.mustHaveExperiences.includes('CINEMATIC_PHOTOGRAPHY')) return `${destination}摄影旅行`;
    return `${destination}旅行想法`;
  }

  private buildFirstReply(intent: LightweightTripIntent, title: string, nextQuestion?: string): string {
    const lines = [`已为你创建“${title}”。`, '', '我先按这个方向规划：', this.describeStrategyDirection(intent)];
    if (nextQuestion) lines.push('', `我先只问一个问题：${nextQuestion}`);
    lines.push('', '正在为你比较几种可行路线。');
    return lines.join('\n');
  }

  private buildPlannerBlocks(intent: LightweightTripIntent, nextQuestion?: string) {
    const understanding = [
      intent.dateText ? `${intent.dateText}左右` : undefined,
      intent.durationDays ? `${intent.durationDays}天` : undefined,
      intent.companions.includes('PARENTS') ? '和父母同行' : undefined,
      intent.mustHaveExperiences.includes('GLACIER_ADVENTURE') ? '想保留冰川体验' : undefined,
      intent.pace === 'RELAXED' ? '整体节奏偏舒适' : undefined,
      intent.constraints.includes('LOW_PHYSICAL_LOAD') ? '需要控制体力负荷' : undefined,
    ].filter(Boolean);
    return [
      { type: 'highlight', highlightType: 'success', highlightText: '已创建 Draft Trip' },
      { type: 'list', title: '我理解的是', items: understanding.length ? understanding : ['已捕捉到一个新的旅行愿望'] },
      { type: 'paragraph', content: this.describeStrategyDirection(intent) },
      ...(nextQuestion ? [{ type: 'question_card', questionText: nextQuestion }] : []),
    ];
  }

  private describeStrategyDirection(intent: LightweightTripIntent): string {
    if (intent.destinationCountryCode === 'IS' && intent.companions.includes('PARENTS')) {
      return '先按黄金圈 + 南岸舒适路线做策略比较，暂不默认完整环岛，优先保留关键体验并减少频繁换酒店。';
    }
    if (intent.destinationText || intent.destinationCountryCode) {
      return `先围绕${intent.destinationText || intent.destinationCountryCode}生成初始路线方向，再在真正影响方案时补关键问题。`;
    }
    return '先建立旅行想法，再用最高信息增益的问题补齐目的地和时间。';
  }
}
