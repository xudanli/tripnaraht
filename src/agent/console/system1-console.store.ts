/**
 * System1 Runtime Console — Prisma 持久化仓。
 * 启动时若库中无 Golden Run 则种子写入；读写均走 DB。
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildKnowledgeQaClaims,
  buildLiveFeasibilityClaims,
  getRequiredEvidenceSpec,
  projectSystem1TurnTrace,
  runSystem1DecisionRuntime,
  SYSTEM1_RUNTIME_BOUNDARY,
  type System1Evidence,
  type System1TurnTrace,
} from '../system1-runtime';
import { compileAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import { resolveUnifiedIntent } from '../intent/unified-intent.resolver';
import {
  evaluateClaimGroundingForHarness,
  type ClaimGroundingEvalV1,
} from '../harness/hardening/claim-grounding-eval.util';

export type System1ConsoleRunRecord = {
  runId: string;
  utterance: string;
  createdAt: string;
  durationMs: number;
  lifecycle: string;
  taskType: string | null;
  family: string | null;
  recommendedRoute: string;
  answerMode: string;
  sufficiency: string | null;
  groundingPassed: boolean | null;
  finalAnswer: string;
  trace: System1TurnTrace;
  projected: Record<string, unknown>;
  claimGroundingEval: ClaimGroundingEvalV1;
  upstream: {
    unifiedIntent: Record<string, unknown>;
    contract: Record<string, unknown>;
  };
  labels: Array<{ kind: string; reason?: string; at: string }>;
  sufficiencyLabel?: {
    label: 'FALSE_SUFFICIENT' | 'FALSE_INSUFFICIENT' | 'CORRECT';
    expectedSufficiency?: string;
    noteZh?: string;
  };
};

export type System1ConsoleFeedback = {
  feedbackId: string;
  runId: string;
  rating?: number;
  thumbs?: 'UP' | 'DOWN';
  category?: string;
  commentZh?: string;
  status: 'NEW' | 'DIAGNOSED' | 'FIXED' | 'REPLAYED' | 'CLOSED';
  issueCode?: string;
  createdAt: string;
};

function ev(
  key: string,
  status: System1Evidence['status'],
  value: unknown,
  id = key,
): System1Evidence {
  return {
    evidenceId: id,
    key,
    sourceType: key.startsWith('trip.')
      ? 'TRIP_STATE'
      : key.startsWith('knowledge.')
        ? 'KNOWLEDGE'
        : 'WORLD_STATE',
    value,
    status,
    observedAt: new Date().toISOString(),
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class System1ConsoleStore implements OnModuleInit {
  private readonly logger = new Logger(System1ConsoleStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureSeeded();
    } catch (e: any) {
      this.logger.error(
        `System1 Console DB seed failed: ${e?.message || e}`,
        e?.stack,
      );
    }
  }

  private rowToRecord(row: any): System1ConsoleRunRecord {
    return {
      runId: row.runId,
      utterance: row.utterance,
      createdAt: row.createdAt.toISOString(),
      durationMs: row.durationMs,
      lifecycle: row.lifecycle,
      taskType: row.taskType,
      family: row.family,
      recommendedRoute: row.recommendedRoute,
      answerMode: row.answerMode,
      sufficiency: row.sufficiency,
      groundingPassed: row.groundingPassed,
      finalAnswer: row.finalAnswer,
      trace: row.trace as System1TurnTrace,
      projected: (row.projected ?? {}) as Record<string, unknown>,
      claimGroundingEval: row.claimGroundingEval as ClaimGroundingEvalV1,
      upstream: (row.upstream ?? {
        unifiedIntent: {},
        contract: {},
      }) as System1ConsoleRunRecord['upstream'],
      labels: (row.labels ?? []) as System1ConsoleRunRecord['labels'],
      sufficiencyLabel: (row.sufficiencyLabel ?? undefined) as
        | System1ConsoleRunRecord['sufficiencyLabel']
        | undefined,
    };
  }

  private async upsertRunRecord(rec: System1ConsoleRunRecord) {
    await this.prisma.system1ConsoleRun.upsert({
      where: { runId: rec.runId },
      create: {
        runId: rec.runId,
        utterance: rec.utterance,
        createdAt: new Date(rec.createdAt),
        durationMs: rec.durationMs,
        lifecycle: rec.lifecycle,
        taskType: rec.taskType,
        family: rec.family,
        recommendedRoute: rec.recommendedRoute,
        answerMode: rec.answerMode,
        sufficiency: rec.sufficiency,
        groundingPassed: rec.groundingPassed,
        finalAnswer: rec.finalAnswer,
        trace: asJson(rec.trace),
        projected: asJson(rec.projected),
        claimGroundingEval: asJson(rec.claimGroundingEval),
        upstream: asJson(rec.upstream),
        labels: asJson(rec.labels),
        sufficiencyLabel: rec.sufficiencyLabel
          ? asJson(rec.sufficiencyLabel)
          : Prisma.JsonNull,
      },
      update: {
        utterance: rec.utterance,
        durationMs: rec.durationMs,
        lifecycle: rec.lifecycle,
        taskType: rec.taskType,
        family: rec.family,
        recommendedRoute: rec.recommendedRoute,
        answerMode: rec.answerMode,
        sufficiency: rec.sufficiency,
        groundingPassed: rec.groundingPassed,
        finalAnswer: rec.finalAnswer,
        trace: asJson(rec.trace),
        projected: asJson(rec.projected),
        claimGroundingEval: asJson(rec.claimGroundingEval),
        upstream: asJson(rec.upstream),
        labels: asJson(rec.labels),
        sufficiencyLabel: rec.sufficiencyLabel
          ? asJson(rec.sufficiencyLabel)
          : Prisma.JsonNull,
      },
    });
  }

  private buildRunRecord(input: {
    runId: string;
    utterance: string;
    durationMs: number;
    trace: System1TurnTrace;
  }): System1ConsoleRunRecord {
    const contract = compileAgentTaskContract({
      message: input.utterance,
      turnId: input.runId,
      tripId: '00000000-0000-4000-8000-0000000000aa',
    });
    const intent = resolveUnifiedIntent({
      message: input.utterance,
      tripId: '00000000-0000-4000-8000-0000000000aa',
    });
    const claimGroundingEval = evaluateClaimGroundingForHarness(input.trace);
    return {
      runId: input.runId,
      utterance: input.utterance,
      createdAt: new Date().toISOString(),
      durationMs: input.durationMs,
      lifecycle: input.trace.taskFrame.lifecycle,
      taskType: contract.taskType,
      family: input.trace.family ?? null,
      recommendedRoute: input.trace.routeDecision.recommendedRoute,
      answerMode: input.trace.routeDecision.answerMode,
      sufficiency: input.trace.sufficiency?.status ?? null,
      groundingPassed: claimGroundingEval.passed,
      finalAnswer: input.trace.finalAnswer,
      trace: input.trace,
      projected: projectSystem1TurnTrace(input.trace),
      claimGroundingEval,
      upstream: {
        unifiedIntent: {
          semanticIntent: intent.semanticIntent,
          topic: intent.topic,
          routeClass: intent.routeClass,
          mutationPolicy: intent.mutationPolicy,
        },
        contract: {
          taskType: contract.taskType,
          authority: contract.authority,
          allowFullPlanning: contract.allowFullPlanning,
        },
      },
      labels: [],
    };
  }

  private async ensureSeeded() {
    const count = await this.prisma.system1ConsoleRun.count();
    if (count === 0) {
      this.logger.log('Seeding System1 Console Golden Cases into DB…');
      await this.seedGoldenCases();
    } else {
      this.logger.log(`System1 Console runs already in DB: count=${count}`);
    }

    const toolCount = await this.prisma.system1ConsoleToolMatrix.count();
    if (toolCount === 0) await this.seedToolMatrix();

    const gapCount = await this.prisma.system1ConsoleGap.count();
    if (gapCount === 0) await this.seedGaps();

    const violCount = await this.prisma.system1ConsoleAuthorityViolation.count();
    if (violCount === 0) {
      await this.prisma.system1ConsoleAuthorityViolation.create({
        data: {
          violationId: 'viol_seed_1',
          source: 'System1ExecutorService',
          attemptedAction: 'DELETE_ITEM',
          reason: 'SYSTEM1_WRITE_FORBIDDEN',
          status: 'FIXED',
        },
      });
    }
  }

  private async seedToolMatrix() {
    const rows = [
      {
        toolId: 'road_api',
        toolName: 'Iceland Road API',
        allowedClaimTypes: ['ACCESSIBILITY', 'FEASIBILITY', 'RISK_ASSESSMENT'],
        allowedEvidenceKeys: ['route.status'],
        forbiddenClaimTypes: ['RECOMMENDATION'],
      },
      {
        toolId: 'weather_api',
        toolName: 'Weather API',
        allowedClaimTypes: ['RISK_ASSESSMENT', 'WORLD_FACT', 'FEASIBILITY'],
        allowedEvidenceKeys: ['weather.wind'],
        forbiddenClaimTypes: ['BOOKING_FACT'],
        notesZh: '不得单独支撑「一定安全」STRONG',
      },
      {
        toolId: 'poi_db',
        toolName: 'POI / Knowledge',
        allowedClaimTypes: ['RECOMMENDATION', 'STATE_FACT', 'WORLD_FACT'],
        allowedEvidenceKeys: ['knowledge.hit'],
        forbiddenClaimTypes: ['FEASIBILITY'],
      },
      {
        toolId: 'booking_api',
        toolName: 'Booking API',
        allowedClaimTypes: ['BOOKING_FACT'],
        allowedEvidenceKeys: ['inventory.hit'],
        forbiddenClaimTypes: ['FEASIBILITY'],
      },
    ];
    for (const r of rows) {
      await this.prisma.system1ConsoleToolMatrix.upsert({
        where: { toolId: r.toolId },
        create: {
          toolId: r.toolId,
          toolName: r.toolName,
          allowedClaimTypes: asJson(r.allowedClaimTypes),
          allowedEvidenceKeys: asJson(r.allowedEvidenceKeys),
          forbiddenClaimTypes: asJson(r.forbiddenClaimTypes),
          notesZh: (r as any).notesZh ?? null,
        },
        update: {
          toolName: r.toolName,
          allowedClaimTypes: asJson(r.allowedClaimTypes),
          allowedEvidenceKeys: asJson(r.allowedEvidenceKeys),
          forbiddenClaimTypes: asJson(r.forbiddenClaimTypes),
          notesZh: (r as any).notesZh ?? null,
        },
      });
    }
  }

  private async seedGaps() {
    await this.prisma.system1ConsoleGap.upsert({
      where: { gapId: 'gap_froad_winter' },
      create: {
        gapId: 'gap_froad_winter',
        kind: 'WORLD_STATE_MISSING',
        titleZh: '冰岛冬季 F-road 开放状态缺失',
        missingEvidenceKeys: asJson(['route.status']),
        affectedClaimTypes: asJson(['FEASIBILITY', 'ACCESSIBILITY']),
        occurrenceCount: 23,
        priority: 'HIGH',
        status: 'OPEN',
      },
      update: {},
    });
  }

  private async seedGoldenCases() {
    const trip = '00000000-0000-4000-8000-0000000000aa';

    const c1 = '明天还能走 F208 吗？';
    await this.upsertRunRecord(
      this.buildRunRecord({
        runId: 's1run_case1_f208',
        utterance: c1,
        durationMs: 3200,
        trace: runSystem1DecisionRuntime({
          message: c1,
          tripId: trip,
          family: 'LIVE_FEASIBILITY',
          evidence: [
            ev('route.status', 'VERIFIED', 'F208 CLOSED', 'road'),
            ev('weather.wind', 'VERIFIED', '阵风偏大', 'wx'),
            ev('vehicle.profile', 'VERIFIED', '两驱', 'veh'),
            ev('trip.current_location', 'VERIFIED', '雷克雅未克', 'loc'),
          ],
          claims: buildLiveFeasibilityClaims({
            conclusionZh: '明天不建议走 F208',
            verdict: 'NO',
            hasWeather: true,
          }),
          draftAnswer: '明天不建议走 F208（路况关闭）。',
        }),
      }),
    );

    const c2 = '哪一天没有住宿？';
    await this.upsertRunRecord(
      this.buildRunRecord({
        runId: 's1run_case2_lodging',
        utterance: c2,
        durationMs: 180,
        trace: runSystem1DecisionRuntime({
          message: c2,
          tripId: trip,
          family: 'TRIP_QUERY_LODGING',
          evidence: [
            ev('trip.day_list', 'VERIFIED', { dayCount: 7 }),
            ev('trip.accommodation_anchors', 'VERIFIED', {
              missingDayNumbers: [3],
            }),
          ],
          claims: [
            {
              claimId: 'c_state',
              type: 'STATE_FACT',
              text: '第 3 天没有住宿。',
              evidenceKeys: ['trip.day_list', 'trip.accommodation_anchors'],
              strength: 'STRONG',
            },
          ],
          draftAnswer: '第 3 天没有住宿。',
        }),
      }),
    );

    const c3 = '冰河湖和钻石沙滩哪个更值得去？';
    await this.upsertRunRecord(
      this.buildRunRecord({
        runId: 's1run_case3_recommend',
        utterance: c3,
        durationMs: 420,
        trace: runSystem1DecisionRuntime({
          message: c3,
          tripId: trip,
          family: 'KNOWLEDGE_QA',
          evidence: [
            ev(
              'knowledge.hit',
              'VERIFIED',
              '两者相邻；时间紧优先冰河湖',
              'k1',
            ),
          ],
          claims: buildKnowledgeQaClaims({
            text: '时间紧优先冰河湖',
            asRecommendation: true,
          }),
          draftAnswer: '时间紧优先冰河湖。',
        }),
      }),
    );

    const c4 = '今天天气怎么样？';
    await this.upsertRunRecord(
      this.buildRunRecord({
        runId: 's1run_weather_stale',
        utterance: c4,
        durationMs: 510,
        trace: runSystem1DecisionRuntime({
          message: c4,
          tripId: trip,
          family: 'WEATHER_ROAD_QA',
          evidence: [ev('weather.wind', 'STALE', '昨日风力中等', 'wx_stale')],
          claims: [
            {
              claimId: 'c_wx',
              type: 'WORLD_FACT',
              text: '风力中等（数据可能过期）',
              evidenceKeys: ['weather.wind'],
              strength: 'CONDITIONAL',
            },
          ],
          draftAnswer: '风力中等（请以官方实况为准）。',
        }),
      }),
    );
  }

  async listRuns(): Promise<System1ConsoleRunRecord[]> {
    const rows = await this.prisma.system1ConsoleRun.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.rowToRecord(r));
  }

  async getRun(runId: string): Promise<System1ConsoleRunRecord | null> {
    const row = await this.prisma.system1ConsoleRun.findUnique({
      where: { runId },
    });
    return row ? this.rowToRecord(row) : null;
  }

  async addLabel(runId: string, label: { kind: string; reason?: string }) {
    const r = await this.getRun(runId);
    if (!r) return null;
    r.labels.push({ ...label, at: new Date().toISOString() });
    await this.prisma.system1ConsoleRun.update({
      where: { runId },
      data: { labels: asJson(r.labels) },
    });
    return r;
  }

  async setSufficiencyLabel(
    runId: string,
    label: System1ConsoleRunRecord['sufficiencyLabel'],
  ) {
    const r = await this.getRun(runId);
    if (!r) return null;
    r.sufficiencyLabel = label;
    await this.prisma.system1ConsoleRun.update({
      where: { runId },
      data: {
        sufficiencyLabel: label ? asJson(label) : Prisma.JsonNull,
      },
    });
    return r;
  }

  async listFeedback(): Promise<System1ConsoleFeedback[]> {
    const rows = await this.prisma.system1ConsoleFeedback.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((f) => ({
      feedbackId: f.feedbackId,
      runId: f.runId,
      rating: f.rating ?? undefined,
      thumbs: (f.thumbs as any) ?? undefined,
      category: f.category ?? undefined,
      commentZh: f.commentZh ?? undefined,
      status: f.status as System1ConsoleFeedback['status'],
      issueCode: f.issueCode ?? undefined,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  async addFeedback(
    row: Omit<System1ConsoleFeedback, 'feedbackId' | 'createdAt' | 'status'> & {
      status?: System1ConsoleFeedback['status'];
    },
  ) {
    const feedbackId = `fb_${Date.now()}`;
    const created = await this.prisma.system1ConsoleFeedback.create({
      data: {
        feedbackId,
        runId: row.runId,
        rating: row.rating ?? null,
        thumbs: row.thumbs ?? null,
        category: row.category ?? null,
        commentZh: row.commentZh ?? null,
        status: row.status ?? 'NEW',
        issueCode: row.issueCode ?? null,
      },
    });
    return {
      feedbackId: created.feedbackId,
      runId: created.runId,
      rating: created.rating ?? undefined,
      thumbs: (created.thumbs as any) ?? undefined,
      category: created.category ?? undefined,
      commentZh: created.commentZh ?? undefined,
      status: created.status as System1ConsoleFeedback['status'],
      issueCode: created.issueCode ?? undefined,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateFeedback(id: string, patch: Partial<System1ConsoleFeedback>) {
    try {
      const updated = await this.prisma.system1ConsoleFeedback.update({
        where: { feedbackId: id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.issueCode !== undefined
            ? { issueCode: patch.issueCode }
            : {}),
          ...(patch.commentZh !== undefined
            ? { commentZh: patch.commentZh }
            : {}),
        },
      });
      return {
        feedbackId: updated.feedbackId,
        runId: updated.runId,
        rating: updated.rating ?? undefined,
        thumbs: (updated.thumbs as any) ?? undefined,
        category: updated.category ?? undefined,
        commentZh: updated.commentZh ?? undefined,
        status: updated.status as System1ConsoleFeedback['status'],
        issueCode: updated.issueCode ?? undefined,
        createdAt: updated.createdAt.toISOString(),
      };
    } catch {
      return null;
    }
  }

  async listGaps() {
    const rows = await this.prisma.system1ConsoleGap.findMany({
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((g) => ({
      gapId: g.gapId,
      kind: g.kind,
      titleZh: g.titleZh,
      missingEvidenceKeys: g.missingEvidenceKeys as string[],
      affectedClaimTypes: g.affectedClaimTypes as string[],
      occurrenceCount: g.occurrenceCount,
      priority: g.priority,
      status: g.status,
      lastSeenAt: g.lastSeenAt.toISOString(),
    }));
  }

  async updateGap(id: string, patch: Record<string, unknown>) {
    try {
      const data: Prisma.System1ConsoleGapUpdateInput = {};
      if (patch.status != null) data.status = String(patch.status);
      if (patch.priority != null) data.priority = String(patch.priority);
      if (patch.titleZh != null) data.titleZh = String(patch.titleZh);
      if (patch.occurrenceCount != null) {
        data.occurrenceCount = Number(patch.occurrenceCount);
      }
      const g = await this.prisma.system1ConsoleGap.update({
        where: { gapId: id },
        data,
      });
      return {
        gapId: g.gapId,
        kind: g.kind,
        titleZh: g.titleZh,
        missingEvidenceKeys: g.missingEvidenceKeys as string[],
        affectedClaimTypes: g.affectedClaimTypes as string[],
        occurrenceCount: g.occurrenceCount,
        priority: g.priority,
        status: g.status,
        lastSeenAt: g.lastSeenAt.toISOString(),
      };
    } catch {
      return null;
    }
  }

  async listTools() {
    const rows = await this.prisma.system1ConsoleToolMatrix.findMany({
      orderBy: { toolId: 'asc' },
    });
    return rows.map((t) => ({
      toolId: t.toolId,
      toolName: t.toolName,
      provider: t.provider ?? undefined,
      allowedClaimTypes: t.allowedClaimTypes as string[],
      allowedEvidenceKeys: t.allowedEvidenceKeys as string[],
      forbiddenClaimTypes: t.forbiddenClaimTypes as string[],
      notesZh: t.notesZh ?? undefined,
    }));
  }

  async upsertTool(toolId: string, body: Record<string, unknown>) {
    const allowedClaimTypes =
      (body.allowedClaimTypes as string[]) ??
      ((await this.listTools()).find((t) => t.toolId === toolId)
        ?.allowedClaimTypes ??
        []);
    const allowedEvidenceKeys =
      (body.allowedEvidenceKeys as string[]) ??
      ((await this.listTools()).find((t) => t.toolId === toolId)
        ?.allowedEvidenceKeys ??
        []);
    const forbiddenClaimTypes =
      (body.forbiddenClaimTypes as string[]) ??
      ((await this.listTools()).find((t) => t.toolId === toolId)
        ?.forbiddenClaimTypes ??
        []);
    const row = await this.prisma.system1ConsoleToolMatrix.upsert({
      where: { toolId },
      create: {
        toolId,
        toolName: String(body.toolName ?? toolId),
        provider: body.provider ? String(body.provider) : null,
        allowedClaimTypes: asJson(allowedClaimTypes),
        allowedEvidenceKeys: asJson(allowedEvidenceKeys),
        forbiddenClaimTypes: asJson(forbiddenClaimTypes),
        notesZh: body.notesZh ? String(body.notesZh) : null,
      },
      update: {
        ...(body.toolName != null ? { toolName: String(body.toolName) } : {}),
        ...(body.provider !== undefined
          ? { provider: body.provider ? String(body.provider) : null }
          : {}),
        allowedClaimTypes: asJson(allowedClaimTypes),
        allowedEvidenceKeys: asJson(allowedEvidenceKeys),
        forbiddenClaimTypes: asJson(forbiddenClaimTypes),
        ...(body.notesZh !== undefined
          ? { notesZh: body.notesZh ? String(body.notesZh) : null }
          : {}),
      },
    });
    return {
      toolId: row.toolId,
      toolName: row.toolName,
      provider: row.provider ?? undefined,
      allowedClaimTypes: row.allowedClaimTypes as string[],
      allowedEvidenceKeys: row.allowedEvidenceKeys as string[],
      forbiddenClaimTypes: row.forbiddenClaimTypes as string[],
      notesZh: row.notesZh ?? undefined,
    };
  }

  async listViolations() {
    const rows = await this.prisma.system1ConsoleAuthorityViolation.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((v) => ({
      violationId: v.violationId,
      runId: v.runId ?? undefined,
      source: v.source,
      attemptedAction: v.attemptedAction,
      reason: v.reason,
      createdAt: v.createdAt.toISOString(),
      status: v.status as 'OPEN' | 'FIXED' | 'IGNORED',
    }));
  }

  async updateViolation(id: string, status: 'OPEN' | 'FIXED' | 'IGNORED') {
    try {
      const v = await this.prisma.system1ConsoleAuthorityViolation.update({
        where: { violationId: id },
        data: { status },
      });
      return {
        violationId: v.violationId,
        runId: v.runId ?? undefined,
        source: v.source,
        attemptedAction: v.attemptedAction,
        reason: v.reason,
        createdAt: v.createdAt.toISOString(),
        status: v.status as 'OPEN' | 'FIXED' | 'IGNORED',
      };
    } catch {
      return null;
    }
  }

  boundary() {
    return SYSTEM1_RUNTIME_BOUNDARY;
  }

  codeDefaultPolicies() {
    const families = [
      'LIVE_FEASIBILITY',
      'TRIP_QUERY_LODGING',
      'KNOWLEDGE_QA',
      'WEATHER_ROAD_QA',
      'INVENTORY_CONSULT',
      'DECISION_SUPPORT',
    ] as const;
    return families.map((family) => ({
      policyId: `family:${family}`,
      scope: 'FAMILY' as const,
      scopeKey: family,
      requiredEvidence: getRequiredEvidenceSpec(family),
      version: 1,
      updatedAt: new Date().toISOString(),
      source: 'CODE_DEFAULT' as const,
    }));
  }
}
