#!/usr/bin/env ts-node

/**
 * 删除数据库中的打包清单数据
 * 
 * 功能：
 * 1. 删除所有 TripPackingListItem 记录
 * 2. 显示删除统计信息
 * 3. 支持按 tripId 删除特定行程的数据
 */

import { PrismaClient } from '@prisma/client';

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

function logSection(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

// 删除所有打包清单数据
async function deleteAllPackingListData() {
  logSection('删除所有打包清单数据');

  try {
    // 先统计
    const totalCount = await prisma.tripPackingListItem.count();
    logInfo(`当前共有 ${totalCount} 条打包清单记录`);

    if (totalCount === 0) {
      logWarning('数据库中没有打包清单数据，无需删除');
      return { deleted: 0, total: 0 };
    }

    // 按行程分组统计
    const byTrip = await prisma.tripPackingListItem.groupBy({
      by: ['tripId'],
      _count: {
        id: true,
      },
    });

    console.log(`\n📊 按行程分布:`);
    byTrip.forEach((group, index) => {
      console.log(`  ${index + 1}. 行程 ${group.tripId}: ${group._count.id} 项`);
    });

    // 确认删除
    logWarning(`即将删除 ${totalCount} 条打包清单记录！`);
    logWarning('此操作不可恢复！');

    // 执行删除
    const result = await prisma.tripPackingListItem.deleteMany({});

    logSuccess(`成功删除 ${result.count} 条打包清单记录`);

    return { deleted: result.count, total: totalCount };
  } catch (error: any) {
    logError(`删除打包清单数据失败: ${error.message}`);
    console.error(error);
    throw error;
  }
}

// 删除指定行程的打包清单数据
async function deletePackingListByTripId(tripId: string) {
  logSection(`删除行程 ${tripId} 的打包清单数据`);

  try {
    // 先统计
    const count = await prisma.tripPackingListItem.count({
      where: { tripId },
    });

    if (count === 0) {
      logWarning(`行程 ${tripId} 没有打包清单数据`);
      return { deleted: 0, total: 0 };
    }

    logInfo(`行程 ${tripId} 共有 ${count} 条打包清单记录`);

    // 执行删除
    const result = await prisma.tripPackingListItem.deleteMany({
      where: { tripId },
    });

    logSuccess(`成功删除 ${result.count} 条打包清单记录`);

    return { deleted: result.count, total: count };
  } catch (error: any) {
    logError(`删除打包清单数据失败: ${error.message}`);
    console.error(error);
    throw error;
  }
}

// 显示统计信息
async function showStatistics() {
  logSection('打包清单数据统计');

  try {
    const totalCount = await prisma.tripPackingListItem.count();
    const checkedCount = await prisma.tripPackingListItem.count({
      where: { checked: true },
    });
    const uncheckedCount = totalCount - checkedCount;

    // 按类别统计
    const byCategory = await prisma.tripPackingListItem.groupBy({
      by: ['category'],
      _count: {
        id: true,
      },
    });

    // 按优先级统计
    const byPriority = await prisma.tripPackingListItem.groupBy({
      by: ['priority'],
      _count: {
        id: true,
      },
    });

    // 按行程统计
    const byTrip = await prisma.tripPackingListItem.groupBy({
      by: ['tripId'],
      _count: {
        id: true,
      },
    });

    console.log(`\n📊 总体统计:`);
    console.log(`  总记录数: ${totalCount}`);
    console.log(`  已勾选: ${checkedCount}`);
    console.log(`  未勾选: ${uncheckedCount}`);

    console.log(`\n📂 按类别分布:`);
    byCategory
      .sort((a, b) => b._count.id - a._count.id)
      .forEach((group) => {
        console.log(`  ${group.category}: ${group._count.id}`);
      });

    console.log(`\n⚡ 按优先级分布:`);
    byPriority
      .sort((a, b) => b._count.id - a._count.id)
      .forEach((group) => {
        console.log(`  ${group.priority}: ${group._count.id}`);
      });

    console.log(`\n🗺️  按行程分布:`);
    console.log(`  涉及行程数: ${byTrip.length}`);
    byTrip
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 10)
      .forEach((group, index) => {
        console.log(`  ${index + 1}. ${group.tripId}: ${group._count.id} 项`);
      });
    if (byTrip.length > 10) {
      console.log(`  ... 还有 ${byTrip.length - 10} 个行程`);
    }

    return {
      total: totalCount,
      checked: checkedCount,
      unchecked: uncheckedCount,
      trips: byTrip.length,
    };
  } catch (error: any) {
    logError(`获取统计信息失败: ${error.message}`);
    console.error(error);
    return null;
  }
}

// 主函数
async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║           删除打包清单数据工具                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const args = process.argv.slice(2);
  const tripId = args[0] || process.env.TRIP_ID;

  try {
    // 显示统计信息
    await showStatistics();

    if (tripId) {
      // 删除指定行程的数据
      const result = await deletePackingListByTripId(tripId);
      logSection('删除完成');
      console.log(`删除记录数: ${result.deleted}`);
    } else {
      // 确认删除所有数据
      logWarning('未指定 tripId，将删除所有打包清单数据');
      logWarning('如需删除特定行程，请使用: TRIP_ID=xxx npx ts-node scripts/delete-packing-list-data.ts');
      
      // 询问确认（在非交互式环境中，直接执行）
      const result = await deleteAllPackingListData();
      logSection('删除完成');
      console.log(`删除记录数: ${result.deleted} / ${result.total}`);
    }

    // 再次显示统计（确认删除）
    await showStatistics();

    logSuccess('操作完成！');

  } catch (error: any) {
    logError(`操作失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
