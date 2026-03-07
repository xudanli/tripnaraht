#!/usr/bin/env ts-node

/**
 * 导入冰岛准备度 Pack 数据
 *
 * 导入 pack.is.iceland.json 和 pack.is.is.json，供 CountryPackGetBlocksSkill
 * 通过 countryCode 'IS' 查找时使用（VISA、SAFETY、ROAD_RULES、WEATHER 等块）
 *
 * 使用方法:
 *   npx ts-node scripts/import-iceland-readiness-pack.ts
 *   npm run import:iceland-pack
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}
function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}
function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function extractLocalizedFields(value: string | { en: string; zh?: string } | undefined): {
  default: string | undefined;
  en: string | undefined;
  cn: string | undefined;
} {
  if (!value) return { default: undefined, en: undefined, cn: undefined };
  if (typeof value === 'string') return { default: value, en: value, cn: undefined };
  return {
    default: value.en,
    en: value.en,
    cn: value.zh,
  };
}

async function savePack(pack: ReadinessPack): Promise<boolean> {
  try {
    const existing = await prisma.readinessPack.findUnique({
      where: { packId: pack.packId },
    });

    const displayNameFields = extractLocalizedFields(pack.displayName);
    const regionFields = extractLocalizedFields(pack.geo.region as any);
    const cityFields = extractLocalizedFields(pack.geo.city as any);

    const lastReviewedAt = new Date(pack.lastReviewedAt);
    const packData = {
      packId: pack.packId,
      destinationId: pack.destinationId,
      displayName: displayNameFields.default || '',
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
      packData: pack as any,
      isActive: true,
      updatedAt: new Date(),
    };

    if (existing) {
      await prisma.readinessPack.update({
        where: { packId: pack.packId },
        data: packData,
      });
      logSuccess(`已更新 Pack: ${pack.packId}`);
    } else {
      await prisma.readinessPack.create({
        data: {
          ...packData,
          id: packData.packId || randomUUID(),
        } as any,
      });
      logSuccess(`已创建 Pack: ${pack.packId}`);
    }
    return true;
  } catch (error: any) {
    logError(`保存 Pack 失败 ${pack.packId}: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function importPackFromFile(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      logError(`文件不存在: ${filePath}`);
      return false;
    }
    logInfo(`读取: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content) as ReadinessPack;

    if (!pack.packId || !pack.destinationId || !pack.rules) {
      throw new Error('Invalid pack format: missing required fields');
    }
    return await savePack(pack);
  } catch (error: any) {
    logError(`导入失败 ${filePath}: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       冰岛准备度 Pack 导入工具                                 ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const packsDir = join(__dirname, '../src/trips/readiness/data/packs');
  const files = [
    'pack.is.iceland.json',
    'pack.is.is.json',
  ];

  try {
    let success = 0;
    for (const file of files) {
      const path = join(packsDir, file);
      const ok = await importPackFromFile(path);
      if (ok) success++;
    }

    if (success > 0) {
      logSuccess(`导入完成：${success}/${files.length} 个 Pack`);
      logInfo('CountryPackGetBlocksSkill 在 packId="IS" 时将通过 findPacksByCountry 找到这些 Pack');
    } else {
      logError('未成功导入任何 Pack');
      process.exit(1);
    }
  } catch (error: any) {
    logError(`导入错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { main };
