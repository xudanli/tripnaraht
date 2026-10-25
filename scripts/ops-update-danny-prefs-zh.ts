/**
 * Update Danny prefs: Chinese-only dietary + nationality CN
 */
import { PrismaClient } from '@prisma/client';

const EMAIL = '2293028143@qq.com';
const USER_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';

async function main() {
  const prisma = new PrismaClient();
  try {
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

    const preferences = {
      ...prev,
      dietaryRestrictions: ['不吃羊肉'],
      nationality: 'CN',
      residencyCountry: 'CN',
      hotelAvoid: ['临街房'],
      seedSource: 'ops_manual_registration_seed',
      seededAt: new Date().toISOString(),
      note_zh: '长期偏好：不吃羊肉；国籍中国',
    };

    await prisma.userProfile.upsert({
      where: { userId: USER_ID },
      create: { userId: USER_ID, preferences, updatedAt: new Date() },
      update: { preferences, updatedAt: new Date() },
    });

    const l1 = await prisma.userTravelProfile.findUnique({ where: { userId: USER_ID } });
    if (l1) {
      await prisma.userTravelProfile.update({
        where: { userId: USER_ID },
        data: {
          extendedProfile: {
            note_zh: '不吃羊肉；偏风景向；日驾不宜过长；临街房尽量避开',
            hotelAvoid: ['临街房'],
            maxDailyDrivingHours: 4,
          },
          updatedAt: new Date(),
        },
      });
    }

    const l0 = await prisma.userProfile.findUnique({
      where: { userId: USER_ID },
      select: { preferences: true },
    });
    const l1b = await prisma.userTravelProfile.findUnique({ where: { userId: USER_ID } });

    console.log(
      JSON.stringify(
        {
          email: EMAIL,
          userId: USER_ID,
          l0: l0?.preferences,
          l1: {
            pacePreference: l1b?.pacePreference,
            riskTolerance: l1b?.riskTolerance,
            travelPhilosophy: l1b?.travelPhilosophy,
            preferredRouteTypes: l1b?.preferredRouteTypes,
            extendedProfile: l1b?.extendedProfile,
            source: l1b?.source,
          },
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
