#!/usr/bin/env tsx
/**
 * 检查数据库中 dayPlans 的实际存储内容
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkDayPlansInDatabase() {
  console.log('='.repeat(70));
  console.log('🔍 检查数据库中 dayPlans 的实际存储内容');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 查询模板 ID 36
    const templateId = 36;

    const template = await prisma.routeTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        nameCN: true,
        durationDays: true,
        dayPlans: true,
        updatedAt: true,
      },
    });

    if (!template) {
      console.error(`❌ 模板 ID ${templateId} 不存在`);
      return;
    }

    console.log(`📋 模板信息:`);
    console.log(`  ID: ${template.id}`);
    console.log(`  名称: ${template.nameCN}`);
    console.log(`  天数: ${template.durationDays}`);
    console.log(`  更新时间: ${template.updatedAt}`);
    console.log('');

    // 检查 dayPlans 的原始存储格式
    console.log('📦 数据库原始存储内容 (JSON):');
    console.log(JSON.stringify(template.dayPlans, null, 2));
    console.log('');

    // 检查数据类型
    const dayPlans = template.dayPlans as any;
    console.log('🔍 数据类型分析:');
    console.log(`  类型: ${typeof dayPlans}`);
    console.log(`  是否为数组: ${Array.isArray(dayPlans)}`);
    console.log(`  数组长度: ${Array.isArray(dayPlans) ? dayPlans.length : 'N/A'}`);
    console.log('');

    if (Array.isArray(dayPlans) && dayPlans.length > 0) {
      const firstItem = dayPlans[0];
      console.log('📋 第一个元素分析:');
      console.log(`  类型: ${typeof firstItem}`);
      console.log(`  是否为数组: ${Array.isArray(firstItem)}`);
      console.log(`  是否为对象: ${typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)}`);
      console.log('');

      if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
        console.log('✅ 格式: 对象数组（新格式）');
        console.log('📋 第一个元素的字段:');
        console.log(`  - day: ${firstItem.day}`);
        console.log(`  - theme: ${firstItem.theme || '(空)'}`);
        console.log(`  - requiredNodes: ${JSON.stringify(firstItem.requiredNodes || [])}`);
        console.log(`  - 所有字段: ${Object.keys(firstItem).join(', ')}`);
        console.log('');

        // 检查所有 dayPlans
        console.log('📋 所有 dayPlans 详情:');
        dayPlans.forEach((plan: any, index: number) => {
          console.log(`  第${index + 1}个计划:`);
          console.log(`    day: ${plan.day || '(缺失)'}`);
          console.log(`    theme: ${plan.theme || '(空)'}`);
          console.log(`    requiredNodes: ${JSON.stringify(plan.requiredNodes || [])}`);
          console.log(`    requiredNodes 类型: ${Array.isArray(plan.requiredNodes) ? '数组' : typeof plan.requiredNodes}`);
          console.log(`    requiredNodes 长度: ${Array.isArray(plan.requiredNodes) ? plan.requiredNodes.length : 'N/A'}`);
          if (plan.requiredNodes && Array.isArray(plan.requiredNodes) && plan.requiredNodes.length > 0) {
            console.log(`    requiredNodes 值: ${plan.requiredNodes.join(', ')}`);
          }
          console.log('');
        });
      } else if (Array.isArray(firstItem)) {
        console.log('⚠️  格式: 嵌套数组（旧格式）');
        console.log('📋 第一个元素内容:');
        console.log(`  ${JSON.stringify(firstItem)}`);
      }
    } else {
      console.log('⚠️  dayPlans 为空或不是数组');
    }

    // 使用原始 SQL 查询查看 JSONB 内容
    console.log('');
    console.log('='.repeat(70));
    console.log('🔍 使用原始 SQL 查询 JSONB 内容');
    console.log('='.repeat(70));
    console.log('');

    const rawResult = await prisma.$queryRaw`
      SELECT 
        id,
        "nameCN",
        "durationDays",
        "dayPlans",
        jsonb_typeof("dayPlans") as dayplans_type,
        jsonb_array_length("dayPlans") as dayplans_length,
        jsonb_pretty("dayPlans") as dayplans_pretty
      FROM "RouteTemplate"
      WHERE id = ${templateId}
    ` as any[];

    if (rawResult.length > 0) {
      const row = rawResult[0];
      console.log('📊 SQL 查询结果:');
      console.log(`  dayPlans 类型: ${row.dayplans_type}`);
      console.log(`  dayPlans 长度: ${row.dayplans_length}`);
      console.log('');
      console.log('📦 格式化的 JSON:');
      console.log(row.dayplans_pretty);
    }

  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDayPlansInDatabase().catch(console.error);
