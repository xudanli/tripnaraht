/**
 * Seed a full Gate 1 mock order and print step-by-step API curl hints.
 *
 * Usage:
 *   npx tsx scripts/seed-gate1-mock-order.ts
 *
 * Optional:
 *   GATE1_SEED_ADVISOR_ID=advisor-demo
 *   GATE1_SEED_ANALYST_ID=analyst-demo
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const ADVISOR_ID = process.env.GATE1_SEED_ADVISOR_ID ?? 'gate1-advisor-demo';
const ANALYST_ID = process.env.GATE1_SEED_ANALYST_ID ?? 'gate1-analyst-demo';
const OPS_ID = process.env.GATE1_SEED_OPS_ID ?? 'gate1-ops-demo';

function encryptField(value: string): string {
  const key = createHash('sha256')
    .update(process.env.GATE1_FIELD_ENCRYPTION_KEY ?? 'gate1-dev-key-change-in-production')
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

async function main() {
  const startDate = new Date('2026-08-01');
  const endDate = new Date('2026-08-08');
  const linkedTrip = await prisma.trip.create({
    data: {
      id: randomUUID(),
      destination: 'IS',
      startDate,
      endDate,
      status: 'PLANNING',
      name: 'Gate1 冰岛南部模拟 Trip',
      updatedAt: new Date(),
      metadata: { source: 'gate1-seed' },
    },
  });

  const project = await prisma.gate1Project.create({
    data: {
      title: '冰岛南部 6 人精品团 · Gate1 模拟订单',
      cohort: 'PLANNING',
      advisorUserId: ADVISOR_ID,
      destination: 'IS',
      participantCount: 3,
      linkedTripId: linkedTrip.id,
      startDate,
      endDate,
      experimentStatus: 'DRAFT',
    },
  });

  await prisma.gate1ExperimentBaseline.create({
    data: {
      projectId: project.id,
      version: 1,
      submittedBy: ADVISOR_ID,
      submittedAt: new Date(),
      isConfirmed: true,
      participantCount: 3,
      destination: 'IS',
      customerType: 'family_friends',
      budgetRange: '1.5-2万/人',
      expectedTotalHours: 12,
      expectedRevisionRounds: 2,
      difficultyLevel: 4,
      knownConflicts: [{ type: 'pace', note: '部分成员希望慢节奏' }],
      mightRejectWithoutTripnara: 'UNCERTAIN',
      originalPlanSummary: '经典南部环线 + 冰川徒步，住宿 mid-range',
    },
  });

  await prisma.gate1Project.update({
    where: { id: project.id },
    data: { experimentStatus: 'BASELINE_READY' },
  });

  const token = randomBytes(24).toString('hex');
  const participant = await prisma.gate1Participant.create({
    data: {
      projectId: project.id,
      displayName: '成员 A',
      inviteToken: token,
      inviteExpiresAt: new Date(Date.now() + 14 * 86400000),
      status: 'SUBMITTED',
      consentedAt: new Date(),
      submittedAt: new Date(),
    },
  });

  await prisma.gate1PreferenceResponse.create({
    data: {
      participantId: participant.id,
      version: 1,
      publicPrefs: { pace: 'slow', mustSee: ['杰古沙龙冰河湖'] },
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  });

  await prisma.gate1PrivateConstraint.create({
    data: {
      participantId: participant.id,
      fieldKey: 'budget',
      encryptedValue: encryptField('实际预算约 12000 CNY'),
      authorizationLevel: 'SANITIZED_TO_ADVISOR',
    },
  });

  await prisma.gate1Project.update({
    where: { id: project.id },
    data: { experimentStatus: 'COLLECTING' },
  });

  await prisma.gate1PrivacyAnalystAssignment.create({
    data: {
      projectId: project.id,
      analystId: ANALYST_ID,
      grantedBy: OPS_ID,
      startsAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 7 * 86400000),
    },
  });

  await prisma.gate1SanitizedConstraint.create({
    data: {
      projectId: project.id,
      participantId: participant.id,
      explanation: '部分成员预算约束与当前住宿方案存在冲突',
      impactSummary: '建议调整住宿层级或活动选配',
      reviewStatus: 'APPROVED',
      reviewedBy: OPS_ID,
      reviewedAt: new Date(),
      createdBy: ANALYST_ID,
    },
  });

  const report = await prisma.gate1ConflictReport.create({
    data: {
      projectId: project.id,
      version: 1,
      status: 'PUBLISHED',
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 90,
      createdBy: OPS_ID,
      publishedBy: OPS_ID,
      publishedAt: new Date(),
      findings: {
        create: [
          {
            conflictType: 'budget',
            severity: 'HIGH',
            confidence: 'HIGH',
            source: 'member_input',
            baselineStatus: 'NEWLY_FOUND',
            title: '预算与住宿方案不匹配',
            description: '脱敏后：部分成员预算约束与 mid-range 住宿冲突',
            resolutionDirection: 'budget_tiering',
            isBlocker: false,
          },
          {
            conflictType: 'pace',
            severity: 'MEDIUM',
            confidence: 'MEDIUM',
            source: 'member_input',
            baselineStatus: 'PARTIALLY_KNOWN',
            title: '团队节奏差异',
            description: '公开偏好显示慢节奏诉求，与原方案紧凑动线部分冲突',
            resolutionDirection: 'time_adjustment',
          },
        ],
      },
    },
    include: { findings: true },
  });

  const candidateA = await prisma.gate1CandidateStrategy.create({
    data: {
      projectId: project.id,
      version: 1,
      label: '方案 A · 紧凑经典线',
      status: 'PUBLISHED',
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 120,
      strategySummary: '保留核心 POI，压缩自由时间',
      publishedBy: OPS_ID,
      publishedAt: new Date(),
      createdBy: OPS_ID,
    },
  });

  const candidateB = await prisma.gate1CandidateStrategy.create({
    data: {
      projectId: project.id,
      version: 1,
      label: '方案 B · 慢节奏分层',
      status: 'PUBLISHED',
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 120,
      strategySummary: '增缓冲日，住宿分层，可选活动分流',
      publishedBy: OPS_ID,
      publishedAt: new Date(),
      createdBy: OPS_ID,
    },
  });

  await prisma.gate1ManualWorkLog.createMany({
    data: [
      { projectId: project.id, taskType: 'CONFLICT_REPORT', assigneeId: OPS_ID, minutes: 90 },
      { projectId: project.id, taskType: 'CANDIDATE_STRATEGY', assigneeId: OPS_ID, minutes: 240 },
    ],
  });

  await prisma.gate1Project.update({
    where: { id: project.id },
    data: { experimentStatus: 'ADVISOR_DECIDING' },
  });

  // ── V0.2: NEAR_DEPARTURE order with Readiness + Plan B ──
  const nearTrip = await prisma.trip.create({
    data: {
      id: randomUUID(),
      destination: 'IS',
      startDate: new Date(Date.now() + 10 * 86400000),
      endDate: new Date(Date.now() + 15 * 86400000),
      status: 'PLANNING',
      name: 'Gate1 冰岛北部临出发 Trip',
      updatedAt: new Date(),
      metadata: { source: 'gate1-seed' },
    },
  });

  const nearProject = await prisma.gate1Project.create({
    data: {
      title: '冰岛北部 4 人 · 临出发 Readiness 模拟',
      cohort: 'NEAR_DEPARTURE',
      advisorUserId: ADVISOR_ID,
      destination: 'IS',
      participantCount: 4,
      linkedTripId: nearTrip.id,
      experimentStatus: 'READY',
      startDate: new Date(Date.now() + 10 * 86400000),
    },
  });

  await prisma.gate1ExperimentBaseline.create({
    data: {
      projectId: nearProject.id,
      version: 1,
      submittedBy: ADVISOR_ID,
      submittedAt: new Date(),
      isConfirmed: true,
      destination: 'IS',
      currentStage: 'final_plan_locked',
      mightRejectWithoutTripnara: 'NO',
      originalPlanSummary: 'Akureyri + Mývatn 5天，已订大部分住宿',
    },
  });

  const readiness = await prisma.gate1ReadinessReport.create({
    data: {
      projectId: nearProject.id,
      version: 1,
      status: 'PUBLISHED',
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 60,
      createdBy: OPS_ID,
      publishedBy: OPS_ID,
      publishedAt: new Date(),
      findings: {
        create: [
          {
            dimension: 'BOOKINGS',
            status: 'YELLOW',
            title: 'Day3 餐厅未预订',
            description: 'Húsavík 海鲜餐厅旺季需提前预订',
            responsibleParty: 'advisor',
            isIncremental: true,
          },
          {
            dimension: 'WEATHER_ROAD',
            status: 'GREEN',
            title: 'F-road 季节性关闭已确认',
            description: 'road.is 显示目标 F-road 仍关闭，方案未依赖',
            isIncremental: false,
          },
        ],
      },
    },
    include: { findings: true },
  });

  const planB = await prisma.gate1PlanB.create({
    data: {
      projectId: nearProject.id,
      version: 1,
      label: '大风改室内方案',
      status: 'PUBLISHED',
      sourceType: 'HUMAN_ASSISTED',
      humanMinutes: 45,
      riskTitle: '北部大风导致户外活动取消',
      triggerCondition: '出发当日 vedur.is 发布该区域风速 >15m/s 且持续6h+',
      alternativeSummary: '改为 Goðafoss + 当地博物馆 + 温泉半日',
      costSummary: '约增加 8000 ISK/人',
      impactSummary: '损失一处户外体验，保留团队节奏',
      advisorPreDecision: 'ACCEPTED',
      createdBy: OPS_ID,
      publishedBy: OPS_ID,
      publishedAt: new Date(),
    },
  });

  await prisma.gate1ManualWorkLog.createMany({
    data: [
      { projectId: nearProject.id, taskType: 'READINESS_REPORT', assigneeId: OPS_ID, minutes: 60 },
      { projectId: nearProject.id, taskType: 'PLAN_B', assigneeId: OPS_ID, minutes: 45 },
    ],
  });

  await prisma.gate1TravelEvent.create({
    data: {
      projectId: nearProject.id,
      title: 'Day2 大风预警',
      eventType: 'PLAN_B_ACTIVATION',
      occurredAt: new Date(),
      handler: 'concierge_ops',
      result: '顾问确认采用室内替代方案',
      planBId: planB.id,
      createdBy: OPS_ID,
    },
  });

  await prisma.gate1PlanB.update({
    where: { id: planB.id },
    data: { triggered: true, triggeredAt: new Date(), adopted: true, adoptedAt: new Date() },
  });

  await prisma.gate1ProjectOutcome.create({
    data: {
      projectId: nearProject.id,
      valueRating: 4,
      valueNotes: 'Readiness 发现餐厅遗漏，Plan B 实际触发且有效',
      secondOrderIntent: 'CONFIRMED',
      secondOrderProvided: true,
      paymentCommitmentCents: 1000000,
      paymentCommitmentType: 'GATE2_DEPOSIT',
      clientRevisionRounds: 1,
      advisorActualHours: 14,
      submittedBy: ADVISOR_ID,
    },
  });

  await prisma.gate1ParticipantFeedback.create({
    data: {
      projectId: project.id,
      participantId: participant.id,
      rating: 5,
      wouldRecommend: true,
      comment: '填写偏好后被认真考虑，行程调整合理',
    },
  });

  await prisma.gate1Project.update({
    where: { id: nearProject.id },
    data: { experimentStatus: 'COMPLETED' },
  });

  console.log('\n✅ Gate 1 mock order seeded\n');
  console.log(`Planning Project ID:  ${project.id}`);
  console.log(`Linked Trip ID:       ${linkedTrip.id}`);
  console.log(`Near-Departure ID:    ${nearProject.id}`);
  console.log(`Advisor ID:     ${ADVISOR_ID}`);
  console.log(`Analyst ID:     ${ANALYST_ID}`);
  console.log(`Invite token:   ${token}`);
  console.log(`Conflict v${report.version} findings: ${report.findings.length}`);
  console.log(`Candidates:     ${candidateA.label}, ${candidateB.label}`);
  console.log(`Readiness:      ${readiness.findings.length} findings (NEAR_DEPARTURE)`);
  console.log(`Plan B:         ${planB.label}`);
  console.log('\nNext steps (with auth token as advisor/ops):');
  console.log(`  GET  /gate1/projects/${project.id}`);
  console.log(`  GET  /advisor/projects/${project.id}/conflicts`);
  console.log(`  GET  /advisor/projects/${project.id}/candidates`);
  console.log(`  GET  /advisor/projects/${nearProject.id}/readiness`);
  console.log(`  GET  /advisor/projects/${nearProject.id}/plan-b`);
  console.log(`  POST /advisor/projects/${project.id}/decision`);
  console.log(`  GET  /gate1/metrics?cohort=PLANNING`);
  console.log(`  GET  /gate1/metrics?cohort=NEAR_DEPARTURE`);
  console.log(`  POST /ops/runtime/projects/${project.id}/backfill`);
  console.log(`  GET  /ops/runtime/projects/${project.id}/reconcile`);
  console.log(`  GET  /gate1/projects/${nearProject.id}/outcome`);
  console.log(`  POST /participant/projects/${token}/feedback  (public)`);
  console.log(`  GET  /participant/invitations/${token}  (public)\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
