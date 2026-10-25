const { PrismaClient } = require('@prisma/client');

const USER_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';

async function main() {
  const prisma = new PrismaClient();
  const row = await prisma.userProfile.findUnique({
    where: { userId: USER_ID },
    select: { preferences: true },
  });
  const prev =
    row && row.preferences && typeof row.preferences === 'object' && !Array.isArray(row.preferences)
      ? row.preferences
      : {};
  const p = Object.assign({}, prev);
  p.dietaryRestrictions = ['不吃羊肉', '不吃三文鱼'];
  p.nationality = 'CN';
  p.residencyCountry = 'CN';
  await prisma.userProfile.update({
    where: { userId: USER_ID },
    data: { preferences: p, updatedAt: new Date() },
  });
  const out = await prisma.userProfile.findUnique({
    where: { userId: USER_ID },
    select: { preferences: true },
  });
  const prefs = out && out.preferences ? out.preferences : {};
  console.log(
    JSON.stringify(
      {
        dietaryRestrictions: prefs.dietaryRestrictions,
        nationality: prefs.nationality,
        residencyCountry: prefs.residencyCountry,
        hotelAvoid: prefs.hotelAvoid,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
