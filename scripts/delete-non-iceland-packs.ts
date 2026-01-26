#!/usr/bin/env ts-node

/**
 * 删除数据库中除冰岛之外的所有准备度 Pack
 * 
 * 使用方法:
 *   npx ts-node scripts/delete-non-iceland-packs.ts
 * 
 * 危险操作！会软删除（设置 isActive=false）所有非冰岛的 Pack
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 冰岛的 Pack ID 列表（保留这些）
const ICELAND_PACK_IDS = [
  'pack.is.iceland',
  'pack.is.is',
];

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

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       删除非冰岛准备度 Pack 工具                              ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  try {
    // 获取所有 Pack
    const allPacks = await prisma.readinessPack.findMany({
      select: {
        id: true,
        packId: true,
        destinationId: true,
        displayName: true,
        countryCode: true,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`数据库中共有 ${allPacks.length} 个 Pack\n`);

    // 分离冰岛和非冰岛的 Pack
    const icelandPacks = allPacks.filter(p => ICELAND_PACK_IDS.includes(p.packId));
    const nonIcelandPacks = allPacks.filter(p => !ICELAND_PACK_IDS.includes(p.packId));

    console.log(`${colors.cyan}冰岛 Pack（保留）:${colors.reset}`);
    icelandPacks.forEach((pack, index) => {
      console.log(`  ${index + 1}. ${pack.packId} - ${pack.displayName} (${pack.countryCode})`);
    });
    console.log('');

    console.log(`${colors.yellow}非冰岛 Pack（将删除）:${colors.reset}`);
    nonIcelandPacks.forEach((pack, index) => {
      const status = pack.isActive ? '激活' : '已禁用';
      console.log(`  ${index + 1}. ${pack.packId} - ${pack.displayName} (${pack.countryCode}) [${status}]`);
    });
    console.log('');

    if (nonIcelandPacks.length === 0) {
      logInfo('没有需要删除的 Pack');
      return;
    }

    // 确认删除
    console.log(`${colors.red}警告: 将软删除（设置 isActive=false）${nonIcelandPacks.length} 个非冰岛 Pack${colors.reset}\n`);

    // 执行删除（软删除）
    let deletedCount = 0;
    let errorCount = 0;

    for (const pack of nonIcelandPacks) {
      try {
        await prisma.readinessPack.update({
          where: { packId: pack.packId },
          data: { isActive: false },
        });
        logSuccess(`已删除: ${pack.packId}`);
        deletedCount++;
      } catch (error: any) {
        logError(`删除失败: ${pack.packId} - ${error.message}`);
        errorCount++;
      }
    }

    // 总结
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}删除总结${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    console.log(`成功删除: ${colors.green}${deletedCount}${colors.reset} 个`);
    console.log(`删除失败: ${colors.red}${errorCount}${colors.reset} 个`);
    console.log(`保留（冰岛）: ${colors.blue}${icelandPacks.length}${colors.reset} 个`);
    console.log(`总计: ${allPacks.length} 个\n`);

    // 验证结果
    const remainingActive = await prisma.readinessPack.findMany({
      where: { isActive: true },
      select: { packId: true, countryCode: true },
    });

    console.log(`${colors.cyan}当前激活的 Pack:${colors.reset}`);
    remainingActive.forEach((pack, index) => {
      console.log(`  ${index + 1}. ${pack.packId} (${pack.countryCode})`);
    });
    console.log('');

    if (remainingActive.length === icelandPacks.length) {
      logSuccess('删除完成！现在只有冰岛的 Pack 处于激活状态');
    } else {
      logWarning(`还有 ${remainingActive.length - icelandPacks.length} 个非冰岛 Pack 处于激活状态`);
    }

  } catch (error: any) {
    logError(`操作失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行删除
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
