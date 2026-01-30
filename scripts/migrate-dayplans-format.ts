#!/usr/bin/env tsx
/**
 * 迁移路线模板 dayPlans 格式
 * 将旧格式（嵌套数组）转换为新格式（对象数组）
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 标准化 dayPlans 格式
 */
function normalizeDayPlans(dayPlans: any): any[] {
  if (!dayPlans || !Array.isArray(dayPlans) || dayPlans.length === 0) {
    return [];
  }

  const firstItem = dayPlans[0];

  // 检查是否是对象数组格式（新格式）
  if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
    // 确保每个对象都有 day 字段
    return dayPlans.map((plan: any, index: number) => ({
      day: plan.day ?? index + 1,
      ...plan,
    }));
  }

  // 检查是否是嵌套数组格式（旧格式）
  if (Array.isArray(firstItem)) {
    // 转换为新格式
    return dayPlans.map((nodes: string[], index: number) => ({
      day: index + 1,
      requiredNodes: nodes || [],
    }));
  }

  // 未知格式，返回空数组
  return [];
}

/**
 * 检查 dayPlans 格式
 */
function checkDayPlansFormat(dayPlans: any): 'object_array' | 'nested_array' | 'empty' | 'unknown' {
  if (!dayPlans || !Array.isArray(dayPlans) || dayPlans.length === 0) {
    return 'empty';
  }

  const firstItem = dayPlans[0];

  if (Array.isArray(firstItem)) {
    return 'nested_array';
  }

  if (typeof firstItem === 'object' && firstItem !== null && 'day' in firstItem) {
    return 'object_array';
  }

  return 'unknown';
}

async function migrateDayPlansFormat() {
  console.log('='.repeat(70));
  console.log('🔄 迁移路线模板 dayPlans 格式');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 查询所有模板
    const templates = await prisma.routeTemplate.findMany({
      select: {
        id: true,
        nameCN: true,
        durationDays: true,
        dayPlans: true,
      },
    });

    console.log(`📊 找到 ${templates.length} 个路线模板\n`);

    // 2. 统计格式类型
    const formatStats: Record<string, number> = {
      object_array: 0,
      nested_array: 0,
      empty: 0,
      unknown: 0,
    };

    templates.forEach(template => {
      const format = checkDayPlansFormat(template.dayPlans);
      formatStats[format]++;
    });

    console.log('📋 格式统计:');
    console.log(`  ✅ 对象数组格式（新格式）: ${formatStats.object_array} 个`);
    console.log(`  ⚠️  嵌套数组格式（旧格式）: ${formatStats.nested_array} 个`);
    console.log(`  📭 空数组: ${formatStats.empty} 个`);
    console.log(`  ❓ 未知格式: ${formatStats.unknown} 个`);
    console.log('');

    // 3. 迁移需要转换的模板
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const template of templates) {
      const format = checkDayPlansFormat(template.dayPlans);

      if (format === 'nested_array' || format === 'unknown') {
        try {
          const normalizedDayPlans = normalizeDayPlans(template.dayPlans);

          await prisma.routeTemplate.update({
            where: { id: template.id },
            data: {
              dayPlans: normalizedDayPlans as any,
              updatedAt: new Date(),
            },
          });

          console.log(`  ✅ 迁移模板 ID ${template.id}: ${template.nameCN || '未命名'}`);
          migrated++;
        } catch (error: any) {
          console.error(`  ❌ 迁移失败模板 ID ${template.id}: ${error.message}`);
          errors++;
        }
      } else {
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('📊 迁移统计:');
    console.log(`  ✅ 已迁移: ${migrated} 个`);
    console.log(`  ⏭️  跳过（已是新格式）: ${skipped} 个`);
    console.log(`  ❌ 失败: ${errors} 个`);
    console.log('='.repeat(70));
    console.log('');

    // 4. 验证迁移结果
    console.log('🔍 验证迁移结果...');
    const afterTemplates = await prisma.routeTemplate.findMany({
      select: {
        id: true,
        dayPlans: true,
      },
    });

    const afterStats: Record<string, number> = {
      object_array: 0,
      nested_array: 0,
      empty: 0,
      unknown: 0,
    };

    afterTemplates.forEach(template => {
      const format = checkDayPlansFormat(template.dayPlans);
      afterStats[format]++;
    });

    console.log('📋 迁移后格式统计:');
    console.log(`  ✅ 对象数组格式: ${afterStats.object_array} 个`);
    console.log(`  ⚠️  嵌套数组格式: ${afterStats.nested_array} 个`);
    console.log(`  📭 空数组: ${afterStats.empty} 个`);
    console.log(`  ❓ 未知格式: ${afterStats.unknown} 个`);
    console.log('');

    if (afterStats.nested_array === 0 && afterStats.unknown === 0) {
      console.log('✅ 所有模板已成功迁移为新格式！');
    } else {
      console.log('⚠️  仍有部分模板使用旧格式，请检查');
    }

  } catch (error: any) {
    console.error('❌ 迁移过程中出错:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateDayPlansFormat().catch(console.error);
