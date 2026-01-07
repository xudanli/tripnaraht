#!/usr/bin/env ts-node
/**
 * 添加冰岛 Pack 中文数据脚本
 * 
 * 功能：
 * 1. 读取冰岛 pack JSON 文件
 * 2. 验证中文数据完整性
 * 3. 导入到数据库（包含中文翻译）
 * 
 * 使用方法：
 *   ts-node scripts/add-iceland-chinese-pack.ts
 */

import { PrismaClient } from '@prisma/client';
import { ReadinessPack, LocalizedString } from '../src/trips/readiness/types/readiness-pack.types';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 检查 LocalizedString 是否包含中文
 */
function hasChinese(text: LocalizedString | undefined | null): boolean {
  if (!text) return false;
  if (typeof text === 'string') return false;
  if (typeof text === 'object') {
    return !!text.zh && text.zh.length > 0;
  }
  return false;
}

/**
 * 验证 Pack 的中文数据完整性
 */
function validateChineseData(pack: ReadinessPack): {
  complete: boolean;
  missing: string[];
  stats: {
    total: number;
    withChinese: number;
    missingChinese: number;
  };
} {
  const missing: string[] = [];
  let total = 0;
  let withChinese = 0;
  let missingChinese = 0;

  // 检查 displayName
  total++;
  if (hasChinese(pack.displayName)) {
    withChinese++;
  } else {
    missingChinese++;
    missing.push('displayName');
  }

  // 检查 sources
  if (pack.sources) {
    for (const source of pack.sources) {
      if (source.title) {
        total++;
        if (hasChinese(source.title)) {
          withChinese++;
        } else {
          missingChinese++;
          missing.push(`source[${source.sourceId}].title`);
        }
      }
    }
  }

  // 检查 hazards
  if (pack.hazards) {
    for (const hazard of pack.hazards) {
      total++;
      if (hasChinese(hazard.summary)) {
        withChinese++;
      } else {
        missingChinese++;
        missing.push(`hazard[${hazard.type}].summary`);
      }

      for (let i = 0; i < hazard.mitigations.length; i++) {
        total++;
        if (hasChinese(hazard.mitigations[i])) {
          withChinese++;
        } else {
          missingChinese++;
          missing.push(`hazard[${hazard.type}].mitigations[${i}]`);
        }
      }
    }
  }

  // 检查 checklists
  for (const checklist of pack.checklists) {
    for (let i = 0; i < checklist.items.length; i++) {
      total++;
      if (hasChinese(checklist.items[i])) {
        withChinese++;
      } else {
        missingChinese++;
        missing.push(`checklist[${checklist.id}].items[${i}]`);
      }
    }
  }

  // 检查 rules
  for (const rule of pack.rules) {
    // message
    total++;
    if (hasChinese(rule.then.message)) {
      withChinese++;
    } else {
      missingChinese++;
      missing.push(`rule[${rule.id}].then.message`);
    }

    // tasks
    if (rule.then.tasks) {
      for (let i = 0; i < rule.then.tasks.length; i++) {
        total++;
        if (hasChinese(rule.then.tasks[i].title)) {
          withChinese++;
        } else {
          missingChinese++;
          missing.push(`rule[${rule.id}].then.tasks[${i}].title`);
        }
      }
    }

    // askUser
    if (rule.then.askUser) {
      for (let i = 0; i < rule.then.askUser.length; i++) {
        total++;
        if (hasChinese(rule.then.askUser[i])) {
          withChinese++;
        } else {
          missingChinese++;
          missing.push(`rule[${rule.id}].then.askUser[${i}]`);
        }
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    stats: {
      total,
      withChinese,
      missingChinese,
    },
  };
}

/**
 * 保存 Pack 到数据库
 */
async function savePack(pack: ReadinessPack): Promise<boolean> {
  try {
    const existing = await prisma.readinessPack.findUnique({
      where: { packId: pack.packId },
    });

    const packData = {
      id: existing?.id || randomUUID(),
      packId: pack.packId,
      destinationId: pack.destinationId,
      displayName: typeof pack.displayName === 'string' 
        ? pack.displayName 
        : pack.displayName.en,
      version: pack.version,
      lastReviewedAt: new Date(pack.lastReviewedAt),
      countryCode: pack.geo.countryCode,
      region: pack.geo.region || null,
      city: pack.geo.city || null,
      latitude: pack.geo.lat || null,
      longitude: pack.geo.lng || null,
      packData: pack as any,
      isActive: true,
      updatedAt: new Date(),
    };

    if (existing) {
      await prisma.readinessPack.update({
        where: { packId: pack.packId },
        data: packData,
      });
      console.log(`  ✅ 更新已存在的 Pack: ${pack.packId}`);
    } else {
      await prisma.readinessPack.create({
        data: {
          ...packData,
          createdAt: new Date(),
        },
      });
      console.log(`  ✅ 创建新的 Pack: ${pack.packId}`);
    }

    return true;
  } catch (error: any) {
    console.error(`  ❌ 保存失败: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n📦 冰岛 Pack 中文数据验证和导入\n');

  const packFilePath = join(__dirname, '../src/trips/readiness/data/packs/pack.is.iceland.json');

  if (!existsSync(packFilePath)) {
    console.error(`❌ 文件不存在: ${packFilePath}`);
    process.exit(1);
  }

  try {
    // 读取 pack 文件
    console.log('📖 读取 Pack 文件...');
    const content = readFileSync(packFilePath, 'utf-8');
    const pack = JSON.parse(content) as ReadinessPack;

    console.log(`✅ Pack ID: ${pack.packId}`);
    console.log(`✅ 目的地: ${pack.destinationId}`);
    console.log(`✅ 版本: ${pack.version}\n`);

    // 验证中文数据
    console.log('🔍 验证中文数据完整性...\n');
    const validation = validateChineseData(pack);

    console.log('📊 统计信息:');
    console.log(`  总字段数: ${validation.stats.total}`);
    console.log(`  有中文: ${validation.stats.withChinese} (${((validation.stats.withChinese / validation.stats.total) * 100).toFixed(1)}%)`);
    console.log(`  缺失中文: ${validation.stats.missingChinese} (${((validation.stats.missingChinese / validation.stats.total) * 100).toFixed(1)}%)\n`);

    if (validation.complete) {
      console.log('✅ 所有字段都包含中文翻译！\n');
    } else {
      console.log('⚠️  以下字段缺失中文翻译:');
      validation.missing.forEach(m => console.log(`  - ${m}`));
      console.log('');
    }

    // 导入到数据库
    console.log('💾 导入到数据库...\n');
    const result = await savePack(pack);

    if (result) {
      console.log('✅ 导入成功！\n');

      // 验证数据库中的数据
      const dbPack = await prisma.readinessPack.findUnique({
        where: { packId: pack.packId },
        select: {
          packId: true,
          destinationId: true,
          displayName: true,
          version: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (dbPack) {
        console.log('📋 数据库中的 Pack 信息:');
        console.log(JSON.stringify(dbPack, null, 2));
      }
    } else {
      console.log('❌ 导入失败');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ 处理失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});

