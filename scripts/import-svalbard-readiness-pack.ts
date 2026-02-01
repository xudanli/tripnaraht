#!/usr/bin/env ts-node

/**
 * 导入斯瓦尔巴的准备度 Pack 数据
 * 
 * 使用方法:
 *   npx ts-node scripts/import-svalbard-readiness-pack.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// 颜色输出
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

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

/**
 * 从 LocalizedString 提取中英文字段
 */
function extractLocalizedFields(value: string | { en: string; zh?: string } | undefined): {
  default: string | undefined;
  en: string | undefined;
  cn: string | undefined;
} {
  if (!value) {
    return { default: undefined, en: undefined, cn: undefined };
  }
  if (typeof value === 'string') {
    return { default: value, en: value, cn: undefined };
  }
  return {
    default: value.en, // 默认使用英文
    en: value.en,
    cn: value.zh,
  };
}

/**
 * 保存 Pack 到数据库
 */
async function savePack(pack: ReadinessPack): Promise<boolean> {
  try {
    // 检查是否已存在
    const existing = await prisma.readinessPack.findUnique({
      where: { packId: pack.packId },
    });

    // 提取中英文字段
    const displayNameFields = extractLocalizedFields(pack.displayName);
    const regionFields = extractLocalizedFields(pack.geo.region as any);
    const cityFields = extractLocalizedFields(pack.geo.city as any);

    const packData = {
      packId: pack.packId,
      destinationId: pack.destinationId,
      displayName: displayNameFields.default || '',
      displayNameEN: displayNameFields.en,
      displayNameCN: displayNameFields.cn,
      version: pack.version,
      lastReviewedAt: new Date(pack.lastReviewedAt),
      countryCode: pack.geo.countryCode,
      region: regionFields.default,
      regionEN: regionFields.en,
      regionCN: regionFields.cn,
      city: cityFields.default,
      cityEN: cityFields.en,
      cityCN: cityFields.cn,
      latitude: pack.geo.lat,
      longitude: pack.geo.lng,
      packData: pack as any, // 存储完整 Pack JSON
      isActive: true,
      updatedAt: new Date(),
    };

    if (existing) {
      // 更新现有记录
      await prisma.readinessPack.update({
        where: { packId: pack.packId },
        data: packData,
      });
      logSuccess(`已更新 Pack: ${pack.packId}`);
    } else {
      // 创建新记录
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

/**
 * 从 JSON 文件导入 Pack
 */
async function importPackFromFile(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      logError(`文件不存在: ${filePath}`);
      return false;
    }

    logInfo(`读取文件: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content) as ReadinessPack;

    // 基本验证
    if (!pack.packId || !pack.destinationId || !pack.rules) {
      throw new Error('Invalid pack format: missing required fields');
    }

    return await savePack(pack);
  } catch (error: any) {
    logError(`从文件导入 Pack 失败 ${filePath}: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       斯瓦尔巴准备度 Pack 导入工具                            ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // 斯瓦尔巴 Pack 文件路径
  const packFilePath = join(__dirname, '../src/trips/readiness/data/packs/pack.sj.svalbard.json');

  try {
    logInfo(`开始导入 Pack 文件: ${packFilePath}`);
    
    const result = await importPackFromFile(packFilePath);
    
    if (result) {
      logSuccess('导入完成！');
      
      // 读取 Pack 数据以显示信息
      const packContent = readFileSync(packFilePath, 'utf-8');
      const pack = JSON.parse(packContent) as ReadinessPack;
      
      console.log(`\n${colors.cyan}Pack 信息:${colors.reset}`);
      console.log(`  Pack ID: ${pack.packId}`);
      console.log(`  目的地: ${pack.destinationId}`);
      console.log(`  版本: ${pack.version}`);
      const displayName = typeof pack.displayName === 'string' 
        ? pack.displayName 
        : `${pack.displayName.en} / ${pack.displayName.zh || ''}`;
      console.log(`  显示名称: ${displayName}`);
      console.log(`  规则数: ${pack.rules.length}`);
      console.log(`  清单数: ${pack.checklists.length}`);
      console.log(`  风险数: ${pack.hazards?.length || 0}`);
    } else {
      logError('导入失败！');
      process.exit(1);
    }
  } catch (error: any) {
    logError(`导入过程中发生错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行导入
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
