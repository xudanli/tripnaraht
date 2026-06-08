/**
 * Match Square 联调 seed：
 * 1. 清理 orphan Iceland Trip（引用已删招募帖）
 * 2. 确认 Danny / 阿音 体能基线（PRD 3.14 Layer 0）
 * 3. 为 Danny 发布冰岛兰格维格 Level 4 招募帖
 *
 * 用法：npx tsx scripts/seed-match-square-laugavegur-demo.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { deriveInteractionMode } from '../src/match-square/config/interaction-modes.config';
import { resolveMbtiQuadrant } from '../src/match-square/util/mbti-quadrant.util';
import {
  parseVibeFreeTextWithRules,
  buildVibeLlmParseViewFromPayload,
  attachVibeParseSnapshot,
} from '../src/match-square/engine/vibe-llm-parse.engine';
import {
  attachTrekkingOrchestrationSnapshot,
  buildTrekkingVibeOrchestrationPlan,
} from '../src/match-square/engine/trekking-vibe-orchestration.engine';
import type { OdysseyIntakeProfile } from '../src/odyssey-intake/types/odyssey-intake.types';
import type { TrekkingFitnessBaseline } from '../src/match-square/types/physical-fitness-gate.types';

const ORPHAN_TRIP_ID = '2fd66e1f-2bc3-4e68-8482-2f049f0f1983';

const DANNY_EMAIL = '2293028143@qq.com';
const AYIN_EMAIL = '17855811793@163.com';

const LAUGAVEGUR_VIBE_TEXT =
  '2026年盛夏冰岛兰格维格 Laugavegur 55公里重装，Landmannalaugar 到 Þórsmörk，12.5米 DEM 离线 3D 路线，冰川强涉水，LNT Plan B。找 2 名有重装高海拔经验的硬核搭子，一起策划，预算人均 2.5-3.5 万全包。';

const TREK_BASELINES: Record<
  string,
  { email: string; baseline: TrekkingFitnessBaseline; note: string }
> = {
  danny: {
    email: DANNY_EMAIL,
    note: '重装老手 — 应通过兰格维格 Layer 0',
    baseline: {
      maxDailyAscentM: 1600,
      maxAltitudeM: 4800,
      maxPackWeightKg: 22,
      heavyPackCampingVerified: true,
      recentAerobicSessions30d: 10,
      source: 'trip_history',
      evidenceLabel: '2026-04 川西长毕穿',
      updatedAt: new Date().toISOString(),
    },
  },
  ayin: {
    email: AYIN_EMAIL,
    note: '城市休闲 — 应被兰格维格 Layer 0 拦截',
    baseline: {
      maxDailyAscentM: 350,
      maxAltitudeM: 600,
      maxPackWeightKg: 6,
      heavyPackCampingVerified: false,
      recentAerobicSessions30d: 2,
      source: 'default',
      evidenceLabel: '城市休闲基线',
      updatedAt: new Date().toISOString(),
    },
  },
};

async function deleteTripCascade(prisma: PrismaClient, tripId: string): Promise<boolean> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { TripDay: { select: { id: true } } },
  });
  if (!trip) return false;

  for (const day of trip.TripDay) {
    await prisma.itineraryItem.deleteMany({ where: { tripDayId: day.id } });
  }
  await prisma.tripDay.deleteMany({ where: { tripId } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId } });
  await prisma.tripCollection.deleteMany({ where: { tripId } });
  await prisma.tripLike.deleteMany({ where: { tripId } });
  await prisma.tripShare.deleteMany({ where: { tripId } });
  await prisma.tripChecklistStatus.deleteMany({ where: { tripId } });
  await prisma.tripPackingListItem.deleteMany({ where: { tripId } });
  await prisma.tripFindingMark.deleteMany({ where: { tripId } });
  await prisma.tripSuggestionState.deleteMany({ where: { tripId } });
  await prisma.tripCapabilityPackItem.deleteMany({ where: { tripId } });
  await prisma.planningPlan.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  return true;
}

async function upsertTrekkingBaseline(
  prisma: PrismaClient,
  userId: string,
  baseline: TrekkingFitnessBaseline,
): Promise<void> {
  const row = await prisma.userTravelProfile.findUnique({
    where: { userId },
    select: { extendedProfile: true },
  });
  const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? {};
  const extendedProfile = {
    ...ext,
    trekking_fitness_baseline: baseline,
  } as unknown as Prisma.InputJsonValue;

  await prisma.userTravelProfile.upsert({
    where: { userId },
    update: { extendedProfile },
    create: {
      userId,
      preferredRouteTypes: [],
      extendedProfile,
      source: 'explicit',
      confidence: 0.85,
    },
  });
}

function buildCaptainSnapshot(profile: OdysseyIntakeProfile, reputationStars: number | null) {
  const interaction = deriveInteractionMode(profile.rawScores, profile.dimensionPercents);
  return {
    mbtiType: profile.mbtiType,
    cardTitle: profile.card.title,
    interactionMode: interaction.id,
    interactionModeLabel: interaction.label,
    quadrant: resolveMbtiQuadrant(profile.mbtiType),
    rawScores: profile.rawScores,
    dimensionPercents: profile.dimensionPercents,
    reputationStars,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient();

  try {
    console.log('=== Match Square Laugavegur Demo Seed ===\n');

    // 1. Orphan trip cleanup
    const deleted = await deleteTripCascade(prisma, ORPHAN_TRIP_ID);
    console.log(deleted ? `✓ 已删除 orphan Trip ${ORPHAN_TRIP_ID}` : `· orphan Trip 不存在，跳过`);

    // 2. Trekking baselines
    for (const entry of Object.values(TREK_BASELINES)) {
      const user = await prisma.user.findUnique({ where: { email: entry.email } });
      if (!user) {
        console.warn(`⚠ 用户不存在: ${entry.email}`);
        continue;
      }
      await upsertTrekkingBaseline(prisma, user.id, entry.baseline);
      console.log(`✓ 体能基线 ${entry.email}: ${entry.note}`);
    }

    // 3. Danny Laugavegur post — 清理同队长旧冰岛帖，保留最新一条
    const danny = await prisma.user.findUnique({ where: { email: DANNY_EMAIL } });
    if (!danny) throw new Error(`Danny not found: ${DANNY_EMAIL}`);

    const stalePosts = await prisma.matchSquareRecruitmentPost.findMany({
      where: { captainUserId: danny.id, destination: { contains: '冰岛' } },
      select: { id: true },
    });
    if (stalePosts.length > 0) {
      await prisma.matchSquareRecruitmentPost.deleteMany({
        where: { id: { in: stalePosts.map((p) => p.id) } },
      });
      console.log(`✓ 已清理 Danny 旧冰岛招募帖 ${stalePosts.length} 条`);
    }

    const travel = await prisma.userTravelProfile.findUnique({ where: { userId: danny.id } });
    const ext = (travel?.extendedProfile as Record<string, unknown> | null) ?? {};
    const intake = ext.odyssey_intake as OdysseyIntakeProfile | undefined;
    if (!intake?.completedAt) {
      throw new Error(`Danny 未完成 Odyssey Intake，无法发帖`);
    }

    const rep = await prisma.userReputationProfile.findUnique({ where: { userId: danny.id } });
    const reputationStars = rep?.averageStars ?? null;

    const payload = parseVibeFreeTextWithRules(LAUGAVEGUR_VIBE_TEXT);
    const vibeView = buildVibeLlmParseViewFromPayload({
      ...payload,
      source_text: LAUGAVEGUR_VIBE_TEXT,
    });

    let personaSnapshot = buildCaptainSnapshot(intake, reputationStars);
    personaSnapshot = attachVibeParseSnapshot(personaSnapshot, vibeView.payload, vibeView);
    const trekPlan = vibeView.trekkingOrchestration ?? buildTrekkingVibeOrchestrationPlan(vibeView.payload);
    personaSnapshot = attachTrekkingOrchestrationSnapshot(personaSnapshot, trekPlan);

    const scriptId = vibeView.payload.recruitment_script_id;
    if (scriptId !== 'iceland_laugavegur_heavy_trek') {
      throw new Error(`剧本解析异常: ${scriptId ?? 'null'}，期望 iceland_laugavegur_heavy_trek`);
    }

    const startDate = new Date('2026-07-15T00:00:00.000Z');
    const endDate = new Date('2026-07-22T00:00:00.000Z');
    const now = new Date();

    const post = await prisma.matchSquareRecruitmentPost.create({
      data: {
        id: randomUUID(),
        captainUserId: danny.id,
        status: 'active',
        destination: vibeView.suggestedFields.destination ?? '冰岛 · 兰格维格',
        departureLabel: vibeView.suggestedFields.departureLabel ?? '国内出发 · 雷克雅未克集结',
        startDate,
        endDate,
        itinerarySummary:
          vibeView.suggestedItinerarySummary ??
          'Landmannalaugar → Þórsmörk 55km 重装，DEM 盲导，冰川涉水，LNT Plan B。',
        budgetMinCents: vibeView.suggestedFields.budgetMinCents ?? 250_0000,
        budgetMaxCents: vibeView.suggestedFields.budgetMaxCents ?? 350_0000,
        slotsNeeded: 2,
        slotsFilled: 0,
        preferenceNotes: vibeView.suggestedFields.preferenceNotes ?? '需重装露营与高海拔经验，Layer 0 自动拦截',
        tripMoodTag: vibeView.suggestedFields.tripMoodTag ?? 'adventure',
        planningStyle: vibeView.suggestedPlanningStyle ?? 'co_planning',
        travelMode: vibeView.suggestedFields.travelMode ?? 'mixed',
        captainMessage:
          vibeView.suggestedCaptainMessage ??
          '找 2 名体能达标、能扛重装、服从 LNT 的硬核搭子；行前 DEM 离线包与装备清单对齐。',
        captainMbtiType: intake.mbtiType,
        captainCardTitle: intake.card.title,
        captainInteractionMode: deriveInteractionMode(intake.rawScores, intake.dimensionPercents).id,
        captainReputationStars: reputationStars,
        captainPersonaSnapshot: personaSnapshot as unknown as Prisma.InputJsonValue,
        publishedAt: now,
        updatedAt: now,
      },
    });

    const postCount = await prisma.matchSquareRecruitmentPost.count();
    console.log(`\n✓ 招募帖已创建`);
    console.log(`  postId:     ${post.id}`);
    console.log(`  captain:    Danny (${danny.id})`);
    console.log(`  script:     ${scriptId}`);
    console.log(`  destination: ${post.destination}`);
    console.log(`  slots:      缺 ${post.slotsNeeded} 人`);
    console.log(`\n广场活跃帖总数: ${postCount}`);
    console.log('\n联调验证:');
    console.log(`  · 阿音 apply-preview → physicalFitnessGate.blocked = true`);
    console.log(`  · Danny 自测 apply（换账号）→ 含 physicalSurvivalQuiz`);
    console.log(`  · GET /api/match-square/posts/${post.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
