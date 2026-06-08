/**
 * PRD 3.13 — Match Square 协同决策飞轮 E2E（冰岛兰格维格 × 高焦虑队员）
 *
 * Phase 1: decisionBrief 协作噪音预演
 * Phase 2: 审批 + force-lock + Trip 实例化 + 协同任务派发
 * Phase 3: 任务 confirm + Plan B propose + 队员 protest
 * Phase 4: decision-replay + 预测/观测 fingerprint 对撞审计
 *
 * 前置：
 *   - DATABASE_URL 已配置
 *   - API 服务运行中（默认 http://127.0.0.1:3000）
 *   - Danny 账号 + Odyssey 已完成（可先跑 seed-match-square-laugavegur-demo.ts）
 *
 * 用法：
 *   npx tsx scripts/run-collaborative-flywheel-e2e.ts
 *   POST_ID=<uuid> TRIP_ID=<uuid> npx tsx scripts/run-collaborative-flywheel-e2e.ts  # 跳过 Phase 1-2
 *   SKIP_AUDIT=1 npx tsx scripts/run-collaborative-flywheel-e2e.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { OdysseyIntakeProfile } from '../src/odyssey-intake/types/odyssey-intake.types';
import type { TrekkingFitnessBaseline } from '../src/match-square/types/physical-fitness-gate.types';
import type { PreMatchDecisionBriefView } from '../src/match-square/types/recruitment-task-flywheel.types';
import type { ActiveTripDecisionReplayView } from '../src/match-square/types/active-trip-decision-replay.types';
import {
  TREKKING_SURVIVAL_QUIZ_POOL,
} from '../src/match-square/config/trekking-survival-quiz.config';
import {
  buildCollaborativeFlywheelObservationExport,
  compareCollaborativeFlywheelFingerprints,
  buildCollaborativeFlywheelPredictionExport,
  computeCollaborativeFlywheelPredictionFingerprint,
  computeCollaborativeFlywheelObservationFingerprint,
} from '../src/match-square/observability/collaborative-flywheel-replay-audit.util';
import {
  COLLAB_FLYWHEEL_AUDIT_SCHEMA,
  COLLAB_FLYWHEEL_OUTCOME_SCHEMA,
} from '../src/match-square/observability/collaborative-flywheel-audit.types';

const DANNY_EMAIL = '2293028143@qq.com';
const ANXIOUS_EMAIL = process.env.COLLAB_FLYWHEEL_ANXIOUS_EMAIL ?? 'collab-flywheel-anxious@tripnara.dev';
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET ?? 'tripnara-dev-secret-key';

const LAUGAVEGUR_FITNESS: TrekkingFitnessBaseline = {
  maxDailyAscentM: 1500,
  maxAltitudeM: 4500,
  maxPackWeightKg: 20,
  heavyPackCampingVerified: true,
  recentAerobicSessions30d: 8,
  source: 'trip_history',
  evidenceLabel: 'E2E 飞轮联调 — 重装基线',
  updatedAt: new Date().toISOString(),
};

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

async function issueToken(userId: string, email: string): Promise<string> {
  return jwt.sign({ sub: userId, userId, email }, JWT_SECRET, { expiresIn: '2h' });
}

async function api<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: ApiEnvelope<T> | null; raw: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data: ApiEnvelope<T> | null = null;
  try {
    data = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    /* non-json */
  }
  return { ok: res.ok, status: res.status, data, raw };
}

function assertOk<T>(label: string, res: { ok: boolean; status: number; data: ApiEnvelope<T> | null; raw: string }): T {
  if (!res.ok || !res.data?.success) {
    throw new Error(`${label} failed HTTP ${res.status}: ${res.raw.slice(0, 800)}`);
  }
  return res.data.data;
}

function buildAnxiousOdysseyProfile(): OdysseyIntakeProfile {
  return {
    version: 2,
    completedAt: new Date().toISOString(),
    mbtiType: 'ENFP',
    mbtiSource: 'self_selected',
    mbtiSelectedAt: new Date().toISOString(),
    premiumStressAnswers: {
      resource_scarcity_replan: 'B',
      convoy_division_collaboration: 'B',
      premium_upcharge_decision: 'A',
    },
    dimensionPercents: { E: 70, I: 30, N: 65, S: 35, T: 40, F: 60, J: 35, P: 65 },
    rawScores: {
      financial_flexibility: 2,
      planning_index: 0,
      compromise_index: 1,
      ambiguity_tolerance: -1,
      stress_anxiety_index: 2,
      energy_capacity: 3,
      travel_pace: 1,
      social_drive: 2,
      aesthetic_preference: 2,
      mbti_e_score: 70,
      mbti_i_score: 30,
      mbti_n_score: 65,
      mbti_s_score: 35,
      mbti_j_score: 35,
      mbti_p_score: 65,
      mbti_f_score: 60,
      mbti_t_score: 40,
      quality_baseline: 1,
      risk_appetite: 0,
      safety_first: 1,
      control_desire: 0,
      collaborative_trait: 1,
      financial_elasticity: 1,
      independence: 1,
    },
    card: {
      mbtiType: 'ENFP',
      title: '高焦虑探索者',
      subtitle: 'E2E 飞轮联调画像',
      theme: {
        quadrant: 'NF',
        gradientFrom: '#6B21A8',
        gradientTo: '#DB2777',
      },
      radar: { E: 70, N: 65, F: 60, P: 65 },
    },
    travelCollaborationGene: 'passive_experiencer',
    travelCollaborationGeneLabel: '被动体验者',
  };
}

async function upsertTravelExtendedProfile(
  prisma: PrismaClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const row = await prisma.userTravelProfile.findUnique({
    where: { userId },
    select: { extendedProfile: true },
  });
  const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? {};
  const extendedProfile = { ...ext, ...patch } as unknown as Prisma.InputJsonValue;

  await prisma.userTravelProfile.upsert({
    where: { userId },
    update: { extendedProfile },
    create: {
      userId,
      preferredRouteTypes: [],
      extendedProfile,
      source: 'explicit',
      confidence: 0.9,
    },
  });
}

async function ensureAnxiousDemoUser(prisma: PrismaClient): Promise<{ id: string; email: string }> {
  let user = await prisma.user.findUnique({ where: { email: ANXIOUS_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: ANXIOUS_EMAIL,
        displayName: '飞轮联调·高焦虑队员',
        emailVerified: true,
      },
    });
    console.log(`✓ 创建 demo 用户 ${ANXIOUS_EMAIL}`);
  }

  await upsertTravelExtendedProfile(prisma, user.id, {
    odyssey_intake: buildAnxiousOdysseyProfile(),
    trekking_fitness_baseline: LAUGAVEGUR_FITNESS,
    verified_credentials: {
      education: {
        verified: true,
        degreeLevel: 'master',
        tierTag: 'qs_top50',
        displayTag: '🎓 QS50硕士✓',
        verificationChannel: 'xuexin_online_code',
        badge: {
          verified: true,
          badgeLabel: '已认证',
          badgeMark: '✓',
          renderHint: 'vector_component_watermark',
        },
        verifiedAt: new Date().toISOString(),
      },
      profession: {
        verified: true,
        industryTag: 'tech',
        companyTierTag: 'tier1_tech',
        roleLevelTag: 'senior_expert',
        verificationChannel: 'work_email',
        displayTags: ['泛科技·资深专家✓'],
        badge: {
          verified: true,
          badgeLabel: '已认证',
          badgeMark: '✓',
          renderHint: 'vector_component_watermark',
        },
        verifiedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
  });

  await prisma.userReputationProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      averageStars: 4.6,
      surveyCount: 3,
      tagCloud: [],
    },
    update: {},
  });

  return { id: user.id, email: ANXIOUS_EMAIL };
}

function buildSurvivalQuizAnswers(scriptId: string): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const item of TREKKING_SURVIVAL_QUIZ_POOL.filter((q) => q.scriptIds.includes(scriptId as never))) {
    const correct = item.options.find((o) => o.correct)?.id;
    if (correct) answers[item.id] = correct;
  }
  return answers;
}

async function resolveLaugavegurPostId(prisma: PrismaClient, captainId: string): Promise<string> {
  const envPost = process.env.POST_ID?.trim();
  if (envPost) return envPost;

  const post = await prisma.matchSquareRecruitmentPost.findFirst({
    where: {
      captainUserId: captainId,
      status: 'active',
      destination: { contains: '冰岛' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!post) {
    throw new Error('无 active 冰岛帖 — 请先运行: npx tsx scripts/seed-match-square-laugavegur-demo.ts');
  }
  return post.id;
}

async function cleanupStaleApplications(
  prisma: PrismaClient,
  postId: string,
  applicantUserId: string,
): Promise<void> {
  await prisma.matchSquareRecruitmentApplication.updateMany({
    where: {
      postId,
      applicantUserId,
      status: { in: ['pending', 'approved'] },
    },
    data: { status: 'withdrawn', decidedAt: new Date() },
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const skipAudit = process.env.SKIP_AUDIT === '1';
  const envTripId = process.env.TRIP_ID?.trim();

  const prisma = new PrismaClient();

  let postId = process.env.POST_ID?.trim() ?? '';
  let tripId = envTripId ?? '';
  let applicationId = '';
  let decisionBrief: PreMatchDecisionBriefView | null = null;
  let anxiousUserId = '';

  try {
    console.log('=== Match Square 协同决策飞轮 E2E ===\n');
    console.log(`API_BASE: ${BASE}\n`);

    const danny = await prisma.user.findUnique({ where: { email: DANNY_EMAIL } });
    if (!danny) throw new Error(`队长账号不存在: ${DANNY_EMAIL}`);

    const anxious = await ensureAnxiousDemoUser(prisma);
    anxiousUserId = anxious.id;

    const dannyToken = await issueToken(danny.id, DANNY_EMAIL);
    const anxiousToken = await issueToken(anxious.id, anxious.email);

    if (!tripId) {
      postId = await resolveLaugavegurPostId(prisma, danny.id);
      console.log(`postId: ${postId}`);

      // PRD 3.13 冰岛验收：指挥官全托管风格 → captainControl ≥ 7，触发 blind_nav × anxiety 噪音
      await prisma.matchSquareRecruitmentPost.update({
        where: { id: postId },
        data: { planningStyle: 'full_managed' },
      });

      await cleanupStaleApplications(prisma, postId, anxiousUserId);

      // ── Phase 1: 拼团前 decisionBrief ──
      console.log('\n--- Phase 1: apply-preview + application + decisionBrief ---');

      const preview = assertOk(
        'GET apply-preview',
        await api<{
          canApply: boolean;
          physicalSurvivalQuiz?: Array<{ id: string }>;
        }>('GET', `/api/match-square/posts/${postId}/apply-preview`, anxiousToken),
      );

      if (!preview.canApply) {
        throw new Error('apply-preview.canApply=false，无法继续 E2E');
      }

      const quizAnswers = buildSurvivalQuizAnswers('iceland_laugavegur_heavy_trek');

      const applyResult = assertOk(
        'POST application',
        await api<{ application: { id: string } }>(
          'POST',
          `/api/match-square/posts/${postId}/applications`,
          anxiousToken,
          {
            message: 'E2E 飞轮联调 — 高焦虑但体能达标，申请兰格维格重装位。',
            planningCommitmentAccepted: true,
            teamworkCommitmentAccepted: true,
            targetSlotIndex: 1,
            physicalSurvivalQuizAnswers: quizAnswers,
          },
        ),
      );
      applicationId = applyResult.application.id;
      console.log(`✓ 申请已提交 applicationId=${applicationId}`);

      const apps = assertOk(
        'GET applications',
        await api<{ applications: Array<{ id: string; decisionBrief?: PreMatchDecisionBriefView | null }> }>(
          'GET',
          `/api/match-square/posts/${postId}/applications?status=pending`,
          dannyToken,
        ),
      );

      const appRow = apps.applications.find((a) => a.id === applicationId);
      if (!appRow?.decisionBrief) {
        throw new Error('decisionBrief 缺失 — Phase 1 失败');
      }
      decisionBrief = appRow.decisionBrief;

      console.log(`  noisePercent: ${decisionBrief.inTripCollaborationNoisePercent}%`);
      console.log(`  roleAnchor:   ${decisionBrief.suggestedSceneRoleAnchor}`);
      console.log(`  mitigating:   ${decisionBrief.mitigatingTaskTemplateIds.join(', ')}`);
      if (decisionBrief.narrativeLine) {
        console.log(`  narrative:    ${decisionBrief.narrativeLine.slice(0, 120)}…`);
      }

      if (decisionBrief.inTripCollaborationNoisePercent < 15) {
        throw new Error(
          `Phase 1 断言失败: noisePercent ${decisionBrief.inTripCollaborationNoisePercent} < 15`,
        );
      }
      if (decisionBrief.suggestedSceneRoleAnchor !== 'blind_box_follower') {
        throw new Error(
          `Phase 1 断言失败: roleAnchor=${decisionBrief.suggestedSceneRoleAnchor}, 期望 blind_box_follower`,
        );
      }
      if (!decisionBrief.mitigatingTaskTemplateIds.includes('pre_trip_safety_blueprint')) {
        throw new Error('Phase 1 断言失败: 缺少 pre_trip_safety_blueprint 对冲任务建议');
      }
      console.log('✓ Phase 1 断言通过');

      // ── Phase 2: 审批 + force-lock + 实例化 ──
      console.log('\n--- Phase 2: approve + force-lock + instantiate ---');

      assertOk(
        'PATCH approve',
        await api(
          'PATCH',
          `/api/match-square/posts/${postId}/applications/${applicationId}`,
          dannyToken,
          { action: 'approve' },
        ),
      );
      console.log('✓ 队长审批通过');

      const lockRes = assertOk<{
        instantiation: { tripId?: string } | null;
        activeTripPath: string | null;
      }>(
        'POST force-lock',
        await api(
          'POST',
          `/api/match-square/posts/${postId}/force-lock`,
          dannyToken,
          { note: 'E2E 飞轮 — 核心队员已到，强制锁团', skipInstantiate: false },
        ),
      );

      tripId = lockRes.instantiation?.tripId ?? '';
      if (!tripId && lockRes.activeTripPath) {
        const m = lockRes.activeTripPath.match(/\/trips\/([^/]+)/);
        tripId = m?.[1] ?? '';
      }
      if (!tripId) {
        const inst = assertOk<{ tripId: string }>(
          'POST instantiate-trip',
          await api(
            'POST',
            `/api/match-square/posts/${postId}/instantiate-trip`,
            dannyToken,
            { skipIfExists: true },
          ),
        );
        tripId = inst.tripId;
      }
      if (!tripId) throw new Error('Phase 2 失败: 未获得 tripId');

      const tasksView = assertOk<{
        tasks: Array<{ taskId: string; templateId: string; assigneeUserId: string; title: string }>;
      }>('GET collaborative-tasks', await api('GET', `/api/trips/${tripId}/collaborative-tasks`, dannyToken));

      console.log(`✓ tripId=${tripId}`);
      console.log(`  协同任务数: ${tasksView.tasks.length}`);
      for (const t of tasksView.tasks) {
        console.log(`    · ${t.templateId} → ${t.assigneeUserId.slice(0, 8)}… (${t.title.slice(0, 24)})`);
      }

      if (tasksView.tasks.length < 2) {
        throw new Error(`Phase 2 断言失败: tasks.length=${tasksView.tasks.length} < 2`);
      }
      const mitigatingDispatched = decisionBrief.mitigatingTaskTemplateIds.filter((id) =>
        tasksView.tasks.some((t) => t.templateId === id),
      );
      if (mitigatingDispatched.length === 0) {
        throw new Error('Phase 2 断言失败: 未派发 mitigating 任务');
      }
      console.log('✓ Phase 2 断言通过');
    } else {
      console.log(`跳过 Phase 1-2，使用 TRIP_ID=${tripId}`);
      if (!decisionBrief) {
        const trip = await prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true },
        });
        const meta = trip?.metadata as Record<string, unknown> | null;
        const inst = meta?.matchSquareInstantiation as { recruitmentPostId?: string } | undefined;
        postId = inst?.recruitmentPostId ?? postId;
        if (postId) {
          const app = await prisma.matchSquareRecruitmentApplication.findFirst({
            where: { postId, applicantUserId: anxiousUserId },
            orderBy: { createdAt: 'desc' },
          });
          if (app) {
            applicationId = app.id;
            const post = await prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
            if (post) {
              const { buildApplicationDecisionBrief } = await import(
                '../src/match-square/util/recruitment-task-flywheel.util'
              );
              decisionBrief = buildApplicationDecisionBrief({
                post,
                applicantSnapshot: app.applicantPersonaSnapshot as never,
                hardMetricsPass: true,
              });
            }
          }
        }
      }
    }

    // ── Phase 3: 行中行为捕获 ──
    console.log('\n--- Phase 3: task confirm + Plan B protest ---');

    const tasksNow = assertOk<{
      tasks: Array<{ taskId: string; templateId: string; assigneeUserId: string; status: string }>;
    }>('GET collaborative-tasks', await api('GET', `/api/trips/${tripId}/collaborative-tasks`, dannyToken));

    const demOrSafety =
      tasksNow.tasks.find(
        (t) =>
          t.assigneeUserId === anxiousUserId &&
          (t.templateId === 'satellite_dem_offline_verify' ||
            t.templateId === 'pre_trip_safety_blueprint' ||
            t.templateId === 'ford_gear_shared_checklist'),
      ) ?? tasksNow.tasks.find((t) => t.assigneeUserId === anxiousUserId);

    if (demOrSafety && demOrSafety.status === 'pending') {
      assertOk(
        'POST task confirm',
        await api(
          'POST',
          `/api/trips/${tripId}/collaborative-tasks/${demOrSafety.taskId}/events`,
          anxiousToken,
          {
            action: 'confirm',
            note: 'E2E — 离线地图/DEM 包已预载',
            evidenceRefs: ['e2e:offline_map_sync'],
          },
        ),
      );
      console.log(`✓ 队员确认任务 ${demOrSafety.templateId}`);
    } else {
      console.log('· 跳过 task confirm（无 pending 任务或已确认）');
    }

    assertOk(
      'POST decision-events propose',
      await api(
        'POST',
        `/api/trips/${tripId}/decision-events`,
        dannyToken,
        {
          type: 'route_rollback',
          action: 'propose',
          planBRef: 'route_plan_b_fjordungakvisl_detour_v1',
          milestoneId: 'fjordungakvisl_ford_gear_check',
          note: 'E2E — F-Road 涉水深度超标，建议 Plan B 改线',
          evidenceRefs: ['e2e:river_level_too_high'],
        },
      ),
    );
    console.log('✓ 队长发起 Plan B 改线提案');

    assertOk(
      'POST decision-events protest',
      await api(
        'POST',
        `/api/trips/${tripId}/decision-events`,
        anxiousToken,
        {
          type: 'route_rollback',
          action: 'protest',
          note: '水流太急了，离线地图上这里没有标记，我拒绝通过！',
        },
      ),
    );
    console.log('✓ 高焦虑队员发起 Plan B 异议');
    console.log('✓ Phase 3 完成');

    // ── Phase 4: Replay + Fingerprint 审计 ──
    console.log('\n--- Phase 4: decision-replay + fingerprint audit ---');

    const replay = assertOk<ActiveTripDecisionReplayView>(
      'GET decision-replay',
      await api('GET', `/api/trips/${tripId}/decision-replay`, dannyToken),
    );

    console.log(`  timeline events: ${replay.timeline.length}`);
    console.log(`  rollback events: ${replay.flywheelMetrics.routeRollbackEvents}`);
    console.log(`  Abu: ${replay.abuNarrative.slice(0, 160)}…`);

    if (!decisionBrief) {
      throw new Error('Phase 4 失败: 缺少 decisionBrief（无法对撞预测）');
    }

    const observation = buildCollaborativeFlywheelObservationExport({
      flywheelMetrics: replay.flywheelMetrics,
      timeline: replay.timeline,
    });

    const dispatchedTemplateIds = tasksNow.tasks.map((t) => t.templateId);

    const auditReport = compareCollaborativeFlywheelFingerprints({
      prediction: decisionBrief,
      observation,
      dispatchedMitigatingTemplateIds: dispatchedTemplateIds,
      noiseThresholdPercent: 15,
      confirmLatencyThresholdMs: 30_000,
    });

    console.log('\n=== Fingerprint Audit Report ===');
    console.log(JSON.stringify(auditReport, null, 2));

    for (const a of auditReport.assertions) {
      console.log(`${a.passed ? '✓' : '✗'} ${a.id}: ${a.message}`);
    }

    if (!skipAudit && !auditReport.match) {
      throw new Error('Phase 4 fingerprint 审计未通过 — 见 assertions');
    }

    const auditEnabled =
      ['1', 'true', 'yes'].includes(
        String(process.env.COLLAB_FLYWHEEL_AUDIT ?? '').trim().toLowerCase(),
      );
    if (auditEnabled && applicationId && decisionBrief) {
      const predictionExport = buildCollaborativeFlywheelPredictionExport(decisionBrief);
      const outcomePayload = {
        schema: COLLAB_FLYWHEEL_OUTCOME_SCHEMA,
        recordedAtIso: new Date().toISOString(),
        observation,
        audit: auditReport,
        abuNarrative: replay.abuNarrative,
        dispatchedMitigatingTemplateIds: tasksNow.tasks.map((t) => t.templateId),
      };

      const snapshot = await prisma.collabFlywheelAuditSnapshot.upsert({
        where: { applicationId },
        create: {
          recruitmentPostId: postId,
          applicationId,
          tripId,
          schemaVersion: COLLAB_FLYWHEEL_AUDIT_SCHEMA,
          predictionFingerprint: computeCollaborativeFlywheelPredictionFingerprint(predictionExport),
          prediction: { ...predictionExport, brief: decisionBrief },
          outcome: outcomePayload,
          outcomeFingerprint: computeCollaborativeFlywheelObservationFingerprint(observation),
          auditMatch: auditReport.match,
          outcomeRecordedAt: new Date(),
          outcomeSource: 'e2e_script',
        },
        update: {
          tripId,
          predictionFingerprint: computeCollaborativeFlywheelPredictionFingerprint(predictionExport),
          prediction: { ...predictionExport, brief: decisionBrief },
          outcome: outcomePayload,
          outcomeFingerprint: computeCollaborativeFlywheelObservationFingerprint(observation),
          auditMatch: auditReport.match,
          outcomeRecordedAt: new Date(),
          outcomeSource: 'e2e_script',
        },
      });
      console.log(`✓ DB audit snapshot persisted id=${snapshot.id} auditMatch=${snapshot.auditMatch}`);
    }

    console.log('\n✓ 协同决策飞轮 E2E 全部完成');
    console.log(`  postId:        ${postId}`);
    console.log(`  applicationId: ${applicationId}`);
    console.log(`  tripId:        ${tripId}`);
    console.log(`  audit.match:   ${auditReport.match}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n✗ E2E 失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
