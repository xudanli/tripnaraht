/**
 * 冰岛 POI 准入规则 + 动态状态覆盖种子脚本
 *
 * 用法: npm run seed:iceland-poi-access-capacity [-- --dry-run]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { ICELAND_ALL_ACCESS_RULES } from '../src/poi-access-capacity/fixtures/iceland-poi-registry';
import { ICELAND_POI_SLUG_RESOLVERS } from '../src/poi-access-capacity/fixtures/iceland-poi-registry';
import type { PoiAccessStatusOverride } from '../src/poi-access-capacity/interfaces/poi-access-capacity.interface';

const prisma = new PrismaClient();

async function resolvePlaceIds(): Promise<Map<string, number>> {
  const places = await prisma.place.findMany({
    select: { id: true, nameEN: true, nameCN: true },
  });

  const map = new Map<string, number>();
  for (const place of places) {
    const hay = `${place.nameEN ?? ''} ${place.nameCN ?? ''}`;
    for (const { slug, patterns } of ICELAND_POI_SLUG_RESOLVERS) {
      if (map.has(slug)) continue;
      if (patterns.some((p) => p.test(hay))) {
        map.set(slug, place.id);
      }
    }
  }
  return map;
}

function loadStatusOverrides(): PoiAccessStatusOverride[] {
  const path = join(process.cwd(), 'data/poi-access-capacity/is-status-overrides.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as PoiAccessStatusOverride[];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `冰岛 POI 准入种子: ${ICELAND_ALL_ACCESS_RULES.length} 条规则, dryRun=${dryRun}`,
  );

  const placeIds = await resolvePlaceIds();
  console.log('Place 映射:', Object.fromEntries(placeIds));

  for (const rule of ICELAND_ALL_ACCESS_RULES) {
    const placeId = placeIds.get(rule.poiId);
    const data = {
      id: rule.id,
      poiId: rule.poiId,
      placeId: placeId ?? null,
      ruleType: rule.ruleType,
      targetResource: rule.targetResource,
      validFrom: rule.validFrom ? new Date(`${rule.validFrom}T00:00:00.000Z`) : null,
      validTo: rule.validTo ? new Date(`${rule.validTo}T00:00:00.000Z`) : null,
      dailyStartTime: rule.dailyStartTime ?? null,
      dailyEndTime: rule.dailyEndTime ?? null,
      quota: rule.quota ?? null,
      reservationRequired: rule.reservationRequired ?? null,
      applicableVehicleTypes: rule.applicableVehicleTypes ?? undefined,
      status: rule.status,
      sourceAuthority: rule.sourceAuthority,
      sourceUrl: rule.sourceUrl ?? null,
      sourceUpdatedAt: rule.sourceUpdatedAt ? new Date(rule.sourceUpdatedAt) : null,
      lastVerifiedAt: new Date(rule.lastVerifiedAt),
      confidence: rule.confidence,
      enforcement: rule.enforcement ?? 'HARD',
      notes: rule.notes ?? null,
    };

    if (dryRun) {
      console.log(`[dry-run] rule ${rule.id}`);
      continue;
    }

    await prisma.poiAccessRule.upsert({
      where: { id: rule.id },
      create: data,
      update: data,
    });
    console.log(`✓ rule ${rule.id}`);
  }

  const overrides = loadStatusOverrides();
  for (const override of overrides) {
    const placeId = placeIds.get(override.poiId);
    const data = {
      id: override.id,
      poiId: override.poiId,
      placeId: placeId ?? null,
      ruleType: override.ruleType,
      targetResource: override.targetResource,
      enforcement: override.enforcement ?? 'HARD',
      effectiveFrom: new Date(override.effectiveFrom),
      effectiveTo: override.effectiveTo ? new Date(override.effectiveTo) : null,
      status: override.status,
      sourceAuthority: override.sourceAuthority,
      sourceUrl: override.sourceUrl ?? null,
      lastVerifiedAt: new Date(override.lastVerifiedAt),
      confidence: override.confidence,
      notes: override.notes ?? null,
    };

    if (dryRun) {
      console.log(`[dry-run] override ${override.id}`);
      continue;
    }

    await prisma.poiAccessStatusOverride.upsert({
      where: { id: override.id },
      create: data,
      update: data,
    });
    console.log(`✓ override ${override.id}`);
  }

  console.log('完成');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
