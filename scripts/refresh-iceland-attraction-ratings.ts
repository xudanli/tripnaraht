import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PlaceRow = {
  id: number;
  nameCN: string;
  rating: number | null;
  metadata: any;
};

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function computeAttractionRating(metadata: any): number {
  const rawTags = metadata?.rawTags ?? {};
  let score = 3.9;

  if (hasValue(metadata?.openingHours) || hasValue(rawTags?.opening_hours)) score += 0.2;
  if (hasValue(metadata?.website) || hasValue(rawTags?.website)) score += 0.1;
  if (hasValue(metadata?.phone) || hasValue(rawTags?.phone)) score += 0.1;

  const signalText = JSON.stringify({
    profile: metadata?.profile,
    tourism: rawTags?.tourism,
    attraction: rawTags?.attraction,
    natural: rawTags?.natural,
    historic: rawTags?.historic,
  }).toLowerCase();

  if (/(museum|waterfall|viewpoint|landmark|historic|nature|attraction)/.test(signalText)) {
    score += 0.2;
  }

  return Math.max(3.8, Math.min(4.6, Number(score.toFixed(1))));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const places = await prisma.$queryRaw<PlaceRow[]>`
    SELECT p.id, p."nameCN", p.rating, p.metadata
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'IS'
      AND p.category = 'ATTRACTION'
  `;

  const targets = places.filter((p) => p.rating === null || Number(p.rating) <= 0);
  const previews = targets.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.nameCN,
    oldRating: p.rating,
    newRating: computeAttractionRating(p.metadata ?? {}),
  }));

  console.log(`[refresh-iceland-attraction-ratings] attractions(IS): ${places.length}`);
  console.log(`[refresh-iceland-attraction-ratings] need-refresh(null/0): ${targets.length}`);
  console.log(`[refresh-iceland-attraction-ratings] preview:`);
  previews.forEach((p) =>
    console.log(`- #${p.id} ${p.name}: ${p.oldRating ?? 'null'} -> ${p.newRating}`),
  );

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to persist updates.');
    return;
  }

  let updated = 0;
  for (const place of targets) {
    const nextRating = computeAttractionRating(place.metadata ?? {});
    await prisma.place.update({
      where: { id: place.id },
      data: { rating: nextRating },
    });
    updated += 1;
  }

  console.log(`[refresh-iceland-attraction-ratings] updated: ${updated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

