#!/usr/bin/env tsx
/**
 * 删除冰岛现有的路线模板
 * 
 * 功能：
 * 1. 查询所有 countryCode = 'IS' 的 RouteDirection 记录
 * 2. 显示将要删除的记录
 * 3. 删除这些记录（RouteTemplate 会级联删除）
 * 
 * 使用方法：
 *   tsx scripts/delete-iceland-routes.ts
 *   tsx scripts/delete-iceland-routes.ts --dry-run
 *   tsx scripts/delete-iceland-routes.ts --confirm
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');

  console.log('='.repeat(60));
  console.log('删除冰岛路线模板');
  console.log('='.repeat(60));
  console.log(`模式: ${dryRun ? '🔍 预览模式（不会实际删除）' : confirm ? '✅ 确认删除模式' : '⚠️  需要 --confirm 参数才能删除'}`);
  console.log('');

  try {
    // 1. 查询所有冰岛的路线
    const routes = await prisma.routeDirection.findMany({
      where: {
        countryCode: 'IS',
      },
      include: {
        RouteTemplate: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (routes.length === 0) {
      console.log('✓ 没有找到冰岛的路线记录');
      return;
    }

    console.log(`找到 ${routes.length} 条路线记录：\n`);

    // 2. 显示将要删除的记录
    for (const route of routes) {
      const templateCount = route.RouteTemplate?.length || 0;
      console.log(`  - ID: ${route.id}`);
      console.log(`    名称: ${route.nameCN} (${route.nameEN || route.name})`);
      console.log(`    路线ID: ${route.name}`);
      console.log(`    关联模板数: ${templateCount}`);
      console.log(`    创建时间: ${route.createdAt}`);
      console.log('');
    }

    // 3. 统计关联的模板数量
    const totalTemplates = routes.reduce((sum, route) => {
      return sum + (route.RouteTemplate?.length || 0);
    }, 0);

    console.log(`总计: ${routes.length} 条路线，${totalTemplates} 个模板\n`);

    // 4. 执行删除
    if (dryRun) {
      console.log('🔍 [DRY RUN] 预览模式，不会实际删除数据');
      return;
    }

    if (!confirm) {
      console.log('⚠️  警告：需要添加 --confirm 参数才能执行删除操作');
      console.log('   使用方法: tsx scripts/delete-iceland-routes.ts --confirm');
      return;
    }

    console.log('🗑️  开始删除...\n');

    let deletedRoutes = 0;
    let deletedTemplates = 0;

    for (const route of routes) {
      const templateCount = route.RouteTemplate?.length || 0;

      // 删除 RouteDirection（RouteTemplate 会级联删除）
      await prisma.routeDirection.delete({
        where: { id: route.id },
      });

      deletedRoutes++;
      deletedTemplates += templateCount;

      console.log(`  ✓ 已删除: ${route.nameCN} (ID: ${route.id}, 模板: ${templateCount})`);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ 删除完成！');
    console.log(`   删除路线: ${deletedRoutes} 条`);
    console.log(`   删除模板: ${deletedTemplates} 个（级联删除）`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
