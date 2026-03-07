#!/usr/bin/env npx tsx
/**
 * 软删除图中 6 条冰岛路线方向（golden-circle, highlands, ring-road-full, ring-road-south, snaefellsnes, westfjords）
 * 将 isActive 设为 false，使列表不再展示。其余冰岛路线不删除。
 *
 * 用法: npx tsx scripts/delete-iceland-route-directions.ts
 *
 * 可选环境变量:
 *   DRY_RUN=1 仅预览，不实际修改
 *   RESTORE=1 恢复被误删的 8 条（IS_ 前缀的路线），不执行删除
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 图中 6 条要删除的路线 ID */
const IDs_TO_DELETE = [88, 89, 90, 91, 92, 93]; // golden-circle, highlands, ring-road-full, ring-road-south, snaefellsnes, westfjords

async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const restore = process.env.RESTORE === '1';

  if (restore) {
    // 恢复被误删的 8 条（IS_ 前缀）
    const toRestore = await prisma.routeDirection.findMany({
      where: { id: { in: [35, 36, 37, 38, 39, 40, 41, 42] } },
      select: { id: true, name: true, isActive: true },
    });
    if (toRestore.length === 0) {
      console.log('无需恢复');
      return;
    }
    if (!dryRun) {
      await prisma.routeDirection.updateMany({
        where: { id: { in: toRestore.map((r) => r.id) } },
        data: { isActive: true },
      });
    }
    console.log(`恢复 ${toRestore.length} 条: ${toRestore.map((r) => r.name).join(', ')}`);
    return;
  }

  if (dryRun) {
    console.log('=== 预览模式（DRY_RUN=1），不会实际修改 ===\n');
  }

  const list = await prisma.routeDirection.findMany({
    where: { id: { in: IDs_TO_DELETE } },
    select: { id: true, name: true, isActive: true },
  });

  if (list.length === 0) {
    console.log('未找到要删除的 6 条路线');
    return;
  }

  console.log(`找到 ${list.length} 条待删除路线:\n`);
  list.forEach((r) => {
    console.log(`  ID ${r.id}: ${r.name} (isActive: ${r.isActive})`);
  });

  if (dryRun) {
    console.log('\n[预览] 将软删除以上记录（isActive=false）');
    return;
  }

  const result = await prisma.routeDirection.updateMany({
    where: { id: { in: IDs_TO_DELETE } },
    data: { isActive: false },
  });

  console.log(`\n已软删除 ${result.count} 条路线方向`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
