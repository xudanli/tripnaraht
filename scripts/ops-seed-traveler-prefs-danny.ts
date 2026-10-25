/**
 * One-off: seed long-term prefs for 2293028143@qq.com
 * - L1 UserTravelProfile
 * - L0 UserProfile.preferences.dietaryRestrictions（不吃羊肉）
 */
import { PrismaClient } from '@prisma/client';

const EMAIL = '2293028143@qq.com';
const USER_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true, email: true, displayName: true },
    });
    if (!user || user.id !== USER_ID) {
      throw new Error(`user mismatch: ${JSON.stringify(user)}`);
    }

    await prisma.userTravelProfile.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        pacePreference: 'MODERATE',
        altitudeTolerance: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        travelPhilosophy: 'SCENIC',
        preferredRouteTypes: ['NATURE', 'ROAD_TRIP'],
        confidence: 0.95,
        source: 'explicit',
        extendedProfile: {
          note_zh: '注册/运营种子：不吃羊肉；偏风景向；日驾不宜过长',
          hotelAvoid: ['street_facing'],
          maxDailyDrivingHours: 4,
        },
        updatedAt: new Date(),
      },
      update: {
        pacePreference: 'MODERATE',
        riskTolerance: 'MEDIUM',
        travelPhilosophy: 'SCENIC',
        preferredRouteTypes: ['NATURE', 'ROAD_TRIP'],
        confidence: 0.95,
        source: 'explicit',
        extendedProfile: {
          note_zh: '注册/运营种子：不吃羊肉；偏风景向；日驾不宜过长',
          hotelAvoid: ['street_facing'],
          maxDailyDrivingHours: 4,
        },
        updatedAt: new Date(),
      },
    });

    const existing = await prisma.userProfile.findUnique({
      where: { userId: USER_ID },
      select: { preferences: true },
    });
    const prev =
      existing?.preferences &&
      typeof existing.preferences === 'object' &&
      !Array.isArray(existing.preferences)
        ? { ...(existing.preferences as Record<string, unknown>) }
        : {};

    const dietPrev = Array.isArray(prev.dietaryRestrictions)
      ? (prev.dietaryRestrictions as unknown[]).map(String)
      : [];
    const dietSet = new Set(
      [...dietPrev, 'no_lamb', '不吃羊肉', 'NO_LAMB'].map((s) => s.trim()).filter(Boolean),
    );

    const preferences = {
      ...prev,
      dietaryRestrictions: [...dietSet],
      hotelAvoid: ['street_facing'],
      seedSource: 'ops_manual_registration_seed',
      seededAt: new Date().toISOString(),
    };

    await prisma.userProfile.upsert({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        preferences,
        updatedAt: new Date(),
      },
      update: {
        preferences,
        updatedAt: new Date(),
      },
    });

    const l1 = await prisma.userTravelProfile.findUnique({ where: { userId: USER_ID } });
    const l0 = await prisma.userProfile.findUnique({
      where: { userId: USER_ID },
      select: { preferences: true },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          email: EMAIL,
          displayName: user.displayName,
          userId: USER_ID,
          l1: {
            pacePreference: l1?.pacePreference,
            riskTolerance: l1?.riskTolerance,
            travelPhilosophy: l1?.travelPhilosophy,
            preferredRouteTypes: l1?.preferredRouteTypes,
            source: l1?.source,
            confidence: l1?.confidence,
            extendedProfile: l1?.extendedProfile,
          },
          l0Dietary: (l0?.preferences as any)?.dietaryRestrictions,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
