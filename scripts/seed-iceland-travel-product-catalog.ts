/**
 * 种子：冰岛 P0 ExperienceDefinition + 可选冰川徒步 Demo Offering
 *
 * 用法:
 *   npx tsx scripts/seed-iceland-travel-product-catalog.ts
 *   npx tsx scripts/seed-iceland-travel-product-catalog.ts --dry-run
 *   npx tsx scripts/seed-iceland-travel-product-catalog.ts --with-demo-offering
 */

import {
  PrismaClient,
  TravelProductType,
  ProductOfferingStatus,
  ProductSessionStatus,
  OperatorTrustLevel,
  ProductPlaceSpatialRole,
  Prisma,
} from '@prisma/client';
import { ICELAND_P0_EXPERIENCE_DEFINITION_SEEDS } from '../src/travel-product-catalog/data/iceland-p0-experience-definitions.seed';
import {
  JOKULSARLON_EXPERIENCE_DEFINITION_SEEDS,
  JOKULSARLON_PLACE_EXPERIENCE_LINKS,
  JOKULSARLON_PLACE_NAME_EN,
} from '../src/travel-product-catalog/data/iceland-jokulsarlon-experiences.seed';
import {
  ICELAND_GLACIER_DEMO_IDS,
  ICELAND_GLACIER_DEMO_OFFERING,
  ICELAND_GLACIER_DEMO_OPERATOR,
  ICELAND_GLACIER_DEMO_RATES,
  ICELAND_GLACIER_DEMO_SESSION,
} from '../src/travel-product-catalog/data/iceland-glacier-hiking-demo.seed';

const prisma = new PrismaClient();

const ALL_EXPERIENCE_SEEDS = [
  ...ICELAND_P0_EXPERIENCE_DEFINITION_SEEDS,
  ...JOKULSARLON_EXPERIENCE_DEFINITION_SEEDS,
];

function asTravelProductType(value: string): TravelProductType {
  if (!(value in TravelProductType)) {
    throw new Error(`Unknown TravelProductType: ${value}`);
  }
  return value as TravelProductType;
}

async function seedExperienceDefinitions(dryRun: boolean): Promise<number> {
  let upserted = 0;
  for (const seed of ALL_EXPERIENCE_SEEDS) {
    const data = {
      productType: asTravelProductType(seed.productType),
      categoryCode: seed.categoryCode,
      subtypeCode: String(seed.subtypeCode),
      displayNameZh: seed.displayNameZh,
      displayNameEn: seed.displayNameEn,
      typicalDurationMin: seed.typicalDurationMin ?? null,
      fitnessLevel: seed.fitnessLevel ?? null,
      riskLevel: seed.riskLevel ?? null,
      recommendedMinAge: seed.recommendedMinAge ?? null,
      recommendedMaxAge: seed.recommendedMaxAge ?? null,
      equipmentTypical: seed.equipmentTypical ?? [],
      seasonalityNotes: seed.seasonalityNotes ?? null,
      weatherDependency: seed.weatherDependency ?? null,
      commonCancelReasons: seed.commonCancelReasons ?? [],
      requiresGuide: seed.requiresGuide ?? false,
      requiresLicense: seed.requiresLicense ?? false,
      relatedExperienceAtomCodes: seed.relatedExperienceAtomCodes ?? [],
      countryCodes: seed.countryCodes ?? ['IS'],
      metadata: seed.metadata ?? undefined,
    };

    if (dryRun) {
      console.log(`[dry-run] upsert ExperienceDefinition code=${seed.code}`);
      upserted += 1;
      continue;
    }

    await prisma.experienceDefinition.upsert({
      where: { code: seed.code },
      create: { code: seed.code, ...data },
      update: data,
    });
    upserted += 1;
    console.log(`upserted ${seed.code}`);
  }
  return upserted;
}

async function seedJokulsarlonPlaceExperienceLinks(dryRun: boolean): Promise<void> {
  const place = await prisma.place.findFirst({
    where: { nameEN: JOKULSARLON_PLACE_NAME_EN },
    select: { id: true, nameEN: true },
  });
  if (!place) {
    console.warn(
      `Place "${JOKULSARLON_PLACE_NAME_EN}" not found; skipped PlaceExperienceLink`,
    );
    return;
  }

  if (dryRun) {
    console.log(
      `[dry-run] placeExperienceLinks place=${place.id} count=${JOKULSARLON_PLACE_EXPERIENCE_LINKS.length}`,
    );
    return;
  }

  for (const link of JOKULSARLON_PLACE_EXPERIENCE_LINKS) {
    const exp = await prisma.experienceDefinition.findUnique({
      where: { code: link.experienceCode },
      select: { id: true },
    });
    if (!exp) {
      console.warn(`missing experience ${link.experienceCode}; skip link`);
      continue;
    }
    await prisma.placeExperienceLink.upsert({
      where: {
        placeId_experienceDefinitionId: {
          placeId: place.id,
          experienceDefinitionId: exp.id,
        },
      },
      create: {
        placeId: place.id,
        experienceDefinitionId: exp.id,
        sortOrder: link.sortOrder,
        label: link.label,
        isFeatured: link.isFeatured ?? false,
        isActive: true,
        notes: link.notes,
      },
      update: {
        sortOrder: link.sortOrder,
        label: link.label,
        isFeatured: link.isFeatured ?? false,
        isActive: true,
        notes: link.notes,
      },
    });
    console.log(`upserted placeExperienceLink ${link.experienceCode} → place ${place.id}`);
  }
}

async function seedGlacierDemoOffering(dryRun: boolean): Promise<void> {
  const experience = await prisma.experienceDefinition.findUnique({
    where: { code: ICELAND_GLACIER_DEMO_IDS.experienceCode },
  });
  if (!experience && !dryRun) {
    throw new Error(
      `Missing ExperienceDefinition ${ICELAND_GLACIER_DEMO_IDS.experienceCode}; seed experiences first`,
    );
  }

  const place = await prisma.place.findFirst({
    where: { nameEN: ICELAND_GLACIER_DEMO_IDS.operatingAreaPlaceNameEN },
    select: { id: true, nameEN: true },
  });

  if (dryRun) {
    console.log(
      `[dry-run] demo operator/offering/session/rates` +
        (place ? ` + placeLinks→${place.id}` : ' (place not found, skip links)'),
    );
    return;
  }

  await prisma.operator.upsert({
    where: { id: ICELAND_GLACIER_DEMO_OPERATOR.id },
    create: {
      id: ICELAND_GLACIER_DEMO_OPERATOR.id,
      brandName: ICELAND_GLACIER_DEMO_OPERATOR.brandName,
      legalName: ICELAND_GLACIER_DEMO_OPERATOR.legalName,
      countryCode: ICELAND_GLACIER_DEMO_OPERATOR.countryCode,
      operatingRegions: [...ICELAND_GLACIER_DEMO_OPERATOR.operatingRegions],
      website: ICELAND_GLACIER_DEMO_OPERATOR.website,
      languages: [...ICELAND_GLACIER_DEMO_OPERATOR.languages],
      trustLevel: OperatorTrustLevel.VERIFIED,
      distributionChannels: [...ICELAND_GLACIER_DEMO_OPERATOR.distributionChannels],
      dataSources: [...ICELAND_GLACIER_DEMO_OPERATOR.dataSources],
    },
    update: {
      brandName: ICELAND_GLACIER_DEMO_OPERATOR.brandName,
      legalName: ICELAND_GLACIER_DEMO_OPERATOR.legalName,
      trustLevel: OperatorTrustLevel.VERIFIED,
    },
  });
  console.log(`upserted operator ${ICELAND_GLACIER_DEMO_OPERATOR.id}`);

  const offeringData = {
    experienceDefinitionId: experience!.id,
    operatorId: ICELAND_GLACIER_DEMO_OPERATOR.id,
    nameEN: ICELAND_GLACIER_DEMO_OFFERING.nameEN,
    nameCN: ICELAND_GLACIER_DEMO_OFFERING.nameCN,
    description: ICELAND_GLACIER_DEMO_OFFERING.description,
    productType: TravelProductType.ACTIVITY_EXPERIENCE,
    categoryCode: ICELAND_GLACIER_DEMO_OFFERING.categoryCode,
    subtypeCode: ICELAND_GLACIER_DEMO_OFFERING.subtypeCode,
    defaultDurationMin: ICELAND_GLACIER_DEMO_OFFERING.defaultDurationMin,
    included: [...ICELAND_GLACIER_DEMO_OFFERING.included],
    excluded: [...ICELAND_GLACIER_DEMO_OFFERING.excluded],
    minAge: ICELAND_GLACIER_DEMO_OFFERING.minAge,
    maxWeightKg: ICELAND_GLACIER_DEMO_OFFERING.maxWeightKg,
    fitnessRequirement: ICELAND_GLACIER_DEMO_OFFERING.fitnessRequirement,
    equipmentRequired: [...ICELAND_GLACIER_DEMO_OFFERING.equipmentRequired],
    languages: [...ICELAND_GLACIER_DEMO_OFFERING.languages],
    cancellationPolicy: ICELAND_GLACIER_DEMO_OFFERING.cancellationPolicy,
    safetyRules: [...ICELAND_GLACIER_DEMO_OFFERING.safetyRules],
    bookingChannels: [...ICELAND_GLACIER_DEMO_OFFERING.bookingChannels],
    externalProductId: ICELAND_GLACIER_DEMO_OFFERING.externalProductId,
    status: ProductOfferingStatus.PUBLISHED,
    countryCode: ICELAND_GLACIER_DEMO_OFFERING.countryCode,
  };

  await prisma.productOffering.upsert({
    where: { id: ICELAND_GLACIER_DEMO_OFFERING.id },
    create: { id: ICELAND_GLACIER_DEMO_OFFERING.id, ...offeringData },
    update: offeringData,
  });
  console.log(`upserted offering ${ICELAND_GLACIER_DEMO_OFFERING.id}`);

  const sessionData = {
    offeringId: ICELAND_GLACIER_DEMO_OFFERING.id,
    localDate: new Date(`${ICELAND_GLACIER_DEMO_SESSION.localDate}T00:00:00.000Z`),
    startTimeLocal: ICELAND_GLACIER_DEMO_SESSION.startTimeLocal,
    endTimeLocal: ICELAND_GLACIER_DEMO_SESSION.endTimeLocal,
    meetTimeLocal: ICELAND_GLACIER_DEMO_SESSION.meetTimeLocal,
    latestCheckInLocal: ICELAND_GLACIER_DEMO_SESSION.latestCheckInLocal,
    timezone: ICELAND_GLACIER_DEMO_SESSION.timezone,
    capacityTotal: ICELAND_GLACIER_DEMO_SESSION.capacityTotal,
    capacityRemaining: ICELAND_GLACIER_DEMO_SESSION.capacityRemaining,
    status: ProductSessionStatus.SCHEDULED,
    minParticipants: ICELAND_GLACIER_DEMO_SESSION.minParticipants,
    isGuaranteedDeparture: ICELAND_GLACIER_DEMO_SESSION.isGuaranteedDeparture,
    weatherStatus: ICELAND_GLACIER_DEMO_SESSION.weatherStatus,
    externalSessionId: ICELAND_GLACIER_DEMO_SESSION.externalSessionId,
  };

  await prisma.productSession.upsert({
    where: { id: ICELAND_GLACIER_DEMO_SESSION.id },
    create: { id: ICELAND_GLACIER_DEMO_SESSION.id, ...sessionData },
    update: sessionData,
  });
  console.log(`upserted session ${ICELAND_GLACIER_DEMO_SESSION.id}`);

  for (const rate of ICELAND_GLACIER_DEMO_RATES) {
    const rateData = {
      offeringId: ICELAND_GLACIER_DEMO_OFFERING.id,
      sessionId: ICELAND_GLACIER_DEMO_SESSION.id,
      code: rate.code,
      nameEN: rate.nameEN,
      nameCN: rate.nameCN,
      currency: rate.currency,
      amount: new Prisma.Decimal(rate.amount),
      travelerType: rate.travelerType,
      refundable: rate.refundable,
      includesTransfer: rate.includesTransfer,
    };
    await prisma.ratePlan.upsert({
      where: { id: rate.id },
      create: { id: rate.id, ...rateData },
      update: rateData,
    });
    console.log(`upserted rate ${rate.id}`);
  }

  if (place) {
    const roles: Array<{ role: ProductPlaceSpatialRole; label: string; sortOrder: number }> = [
      { role: ProductPlaceSpatialRole.MEETING_POINT, label: 'Sólheimajökull Base Camp (approx)', sortOrder: 0 },
      { role: ProductPlaceSpatialRole.OPERATING_AREA, label: 'Sólheimajökull Glacier', sortOrder: 0 },
      { role: ProductPlaceSpatialRole.PARKING, label: 'Glacier parking (approx)', sortOrder: 0 },
    ];
    for (const link of roles) {
      const existing = await prisma.productPlaceLink.findFirst({
        where: {
          offeringId: ICELAND_GLACIER_DEMO_OFFERING.id,
          placeId: place.id,
          role: link.role,
          sortOrder: link.sortOrder,
        },
      });
      if (existing) {
        await prisma.productPlaceLink.update({
          where: { id: existing.id },
          data: { label: link.label },
        });
      } else {
        await prisma.productPlaceLink.create({
          data: {
            offeringId: ICELAND_GLACIER_DEMO_OFFERING.id,
            placeId: place.id,
            role: link.role,
            sortOrder: link.sortOrder,
            label: link.label,
          },
        });
      }
      console.log(`upserted placeLink ${link.role} → place ${place.id}`);
    }
  } else {
    console.warn(
      `Place "${ICELAND_GLACIER_DEMO_IDS.operatingAreaPlaceNameEN}" not found; skipped ProductPlaceLink`,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const withDemo = process.argv.includes('--with-demo-offering');
  console.log(
    `Travel Product Catalog seed: experiences=${ALL_EXPERIENCE_SEEDS.length}, withDemo=${withDemo}, dryRun=${dryRun}`,
  );

  const upserted = await seedExperienceDefinitions(dryRun);
  console.log(`done experiences: ${upserted}`);

  await seedJokulsarlonPlaceExperienceLinks(dryRun);
  console.log('done jokulsarlon place↔experience links');

  if (withDemo) {
    await seedGlacierDemoOffering(dryRun);
    console.log('done demo glacier offering stack');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
