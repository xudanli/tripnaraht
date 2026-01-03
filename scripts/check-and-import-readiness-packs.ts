#!/usr/bin/env ts-node
/**
 * 检查和导入 Readiness Pack 数据
 * 
 * 功能：
 * 1. 检查数据库中是否已有指定的 pack
 * 2. 如果没有，从 JSON 文件导入
 * 3. 支持批量导入所有 packs 目录下的文件
 * 
 * 使用方法：
 *   ts-node scripts/check-and-import-readiness-packs.ts check pack.is.iceland
 *   ts-node scripts/check-and-import-readiness-packs.ts import src/trips/readiness/data/packs/pack.is.iceland.json
 *   ts-node scripts/check-and-import-readiness-packs.ts import-all
 */

import { PrismaClient } from '@prisma/client';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function checkPack(packId: string) {
  console.log(`\n🔍 检查 Pack: ${packId}\n`);
  
  try {
    const pack = await prisma.readinessPack.findUnique({
      where: { packId },
      select: {
        packId: true,
        destinationId: true,
        displayName: true,
        version: true,
        isActive: true,
        countryCode: true,
        region: true,
        city: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (pack) {
      console.log('✅ Pack 已存在于数据库中:');
      console.log(JSON.stringify(pack, null, 2));
      return true;
    } else {
      console.log('❌ Pack 不存在于数据库中');
      return false;
    }
  } catch (error: any) {
    console.error(`❌ 检查失败: ${error.message}`);
    return false;
  }
}

async function checkByCountry(countryCode: string) {
  console.log(`\n🔍 检查国家代码: ${countryCode}\n`);
  
  try {
    const packs = await prisma.readinessPack.findMany({
      where: {
        countryCode: countryCode.toUpperCase(),
        isActive: true,
      },
      select: {
        packId: true,
        destinationId: true,
        displayName: true,
        version: true,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (packs.length > 0) {
      console.log(`✅ 找到 ${packs.length} 个 Pack:`);
      packs.forEach(pack => {
        console.log(`  - ${pack.packId} (${pack.displayName}) v${pack.version}`);
      });
      return true;
    } else {
      console.log('❌ 没有找到该国家的 Pack');
      return false;
    }
  } catch (error: any) {
    console.error(`❌ 检查失败: ${error.message}`);
    return false;
  }
}

async function savePack(pack: ReadinessPack): Promise<boolean> {
  try {
    const existing = await prisma.readinessPack.findUnique({
      where: { packId: pack.packId },
    });

    const packData = {
      id: existing?.id || randomUUID(),
      packId: pack.packId,
      destinationId: pack.destinationId,
      displayName: pack.displayName,
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

async function importPack(filePath: string) {
  console.log(`\n📦 导入 Pack: ${filePath}\n`);
  
  if (!existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content) as ReadinessPack;

    // 基本验证
    if (!pack.packId || !pack.destinationId || !pack.rules) {
      throw new Error('Invalid pack format: missing required fields');
    }

    const result = await savePack(pack);
    
    if (result) {
      console.log('✅ 导入成功！');
      await checkPack(pack.packId);
      return true;
    } else {
      console.log('❌ 导入失败');
      return false;
    }
  } catch (error: any) {
    console.error(`❌ 导入失败: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

async function importAll() {
  console.log(`\n📦 批量导入所有 Pack 文件\n`);
  
  const packsDirectory = join(__dirname, '../src/trips/readiness/data/packs');
  
  if (!existsSync(packsDirectory)) {
    console.error(`❌ 目录不存在: ${packsDirectory}`);
    return;
  }

  try {
    const files = readdirSync(packsDirectory);
    let success = 0;
    let failed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = join(packsDirectory, file);
      console.log(`\n处理文件: ${file}`);
      
      const result = await importPack(filePath);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }
    
    console.log(`\n✅ 导入完成:`);
    console.log(`  成功: ${success}`);
    console.log(`  失败: ${failed}`);
    
    if (success > 0) {
      console.log(`\n📋 已导入的 Pack:`);
      const allPacks = await prisma.readinessPack.findMany({
        where: { isActive: true },
        select: {
          packId: true,
          destinationId: true,
          displayName: true,
          version: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
      
      allPacks.forEach(pack => {
        console.log(`  - ${pack.packId} (${pack.displayName}) v${pack.version}`);
      });
    }
  } catch (error: any) {
    console.error(`❌ 批量导入失败: ${error.message}`);
    console.error(error.stack);
  }
}

async function listAllPacks() {
  console.log(`\n📋 数据库中的所有 Pack:\n`);
  
  try {
    const packs = await prisma.readinessPack.findMany({
      select: {
        packId: true,
        destinationId: true,
        displayName: true,
        version: true,
        isActive: true,
        countryCode: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (packs.length === 0) {
      console.log('❌ 数据库中没有 Pack');
      return;
    }

    console.log(`总共 ${packs.length} 个 Pack:\n`);
    packs.forEach((pack, index) => {
      const status = pack.isActive ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${pack.packId}`);
      console.log(`   目的地: ${pack.destinationId}`);
      console.log(`   名称: ${pack.displayName}`);
      console.log(`   版本: ${pack.version}`);
      console.log(`   国家: ${pack.countryCode}`);
      console.log(`   创建时间: ${pack.createdAt.toISOString()}`);
      console.log('');
    });
  } catch (error: any) {
    console.error(`❌ 查询失败: ${error.message}`);
  }
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'check':
        if (!arg) {
          console.error('❌ 请提供 packId');
          process.exit(1);
        }
        await checkPack(arg);
        break;

      case 'check-country':
        if (!arg) {
          console.error('❌ 请提供国家代码');
          process.exit(1);
        }
        await checkByCountry(arg);
        break;

      case 'import':
        if (!arg) {
          console.error('❌ 请提供文件路径');
          process.exit(1);
        }
        await importPack(arg);
        break;

      case 'import-all':
        await importAll();
        break;

      case 'list':
        await listAllPacks();
        break;

      default:
        console.log(`
使用方法:
  ts-node scripts/check-and-import-readiness-packs.ts <command> [args]

命令:
  check <packId>              检查指定的 pack 是否存在
  例如: check pack.is.iceland

  check-country <countryCode> 检查指定国家的所有 pack
  例如: check-country IS

  import <filePath>           导入指定的 pack JSON 文件
  例如: import src/trips/readiness/data/packs/pack.is.iceland.json

  import-all                  批量导入所有 packs 目录下的文件

  list                        列出数据库中所有的 pack
        `);
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});

