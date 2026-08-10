#!/usr/bin/env npx tsx
/**
 * 导入中国准备度 Packs：
 *   pack.cn.china / pack.cn.xizang / pack.cn.sichuan
 *
 *   npx tsx scripts/import-china-readiness-pack.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';

const prisma = new PrismaClient();

const PACK_FILES = [
  'pack.cn.china.json',
  'pack.cn.xizang.json',
  'pack.cn.sichuan.json',
];

function extractLocalizedFields(value: string | { en: string; zh?: string } | undefined): {
  default: string | undefined;
  en: string | undefined;
  cn: string | undefined;
} {
  if (!value) return { default: undefined, en: undefined, cn: undefined };
  if (typeof value === 'string') return { default: value, en: value, cn: undefined };
  return { default: value.en, en: value.en, cn: value.zh };
}

async function savePack(pack: ReadinessPack): Promise<void> {
  const existing = await prisma.readinessPack.findUnique({ where: { packId: pack.packId } });
  const displayNameFields = extractLocalizedFields(pack.displayName as any);
  const regionFields = extractLocalizedFields(pack.geo.region as any);
  const cityFields = extractLocalizedFields(pack.geo.city as any);
  const lastReviewedAt = new Date(pack.lastReviewedAt);

  const packData = {
    packId: pack.packId,
    destinationId: pack.destinationId,
    displayName: displayNameFields.default || pack.packId,
    displayNameEN: displayNameFields.en,
    displayNameCN: displayNameFields.cn,
    version: pack.version,
    lastReviewedAt,
    countryCode: pack.geo.countryCode,
    region: regionFields.default,
    regionEN: regionFields.en,
    regionCN: regionFields.cn,
    city: cityFields.default,
    cityEN: cityFields.en,
    cityCN: cityFields.cn,
    latitude: pack.geo.lat,
    longitude: pack.geo.lng,
    packData: pack as object,
    isActive: true,
    updatedAt: new Date(),
  };

  if (existing) {
    await prisma.readinessPack.update({ where: { packId: pack.packId }, data: packData });
    console.log(`✅ Updated ${pack.packId}`);
  } else {
    await prisma.readinessPack.create({
      data: { ...packData, id: pack.packId || randomUUID() } as any,
    });
    console.log(`✅ Created ${pack.packId}`);
  }
}

async function main(): Promise<void> {
  const packsDir = join(__dirname, '../src/trips/readiness/data/packs');
  let ok = 0;
  for (const file of PACK_FILES) {
    const filePath = join(packsDir, file);
    if (!existsSync(filePath)) {
      console.error(`Missing: ${filePath}`);
      continue;
    }
    const pack = JSON.parse(readFileSync(filePath, 'utf-8')) as ReadinessPack;
    if (!pack.packId || !pack.destinationId || !pack.rules?.length) {
      console.error(`Invalid pack: ${file}`);
      continue;
    }
    await savePack(pack);
    ok++;
  }
  console.log(`Done: ${ok}/${PACK_FILES.length}`);
  if (ok === 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
