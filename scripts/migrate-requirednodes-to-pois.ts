#!/usr/bin/env tsx
/**
 * 将模板中的 requiredNodes 迁移到 pois 格式
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function migrateRequiredNodesToPois() {
  console.log('='.repeat(70));
  console.log('🔄 将 requiredNodes 迁移到 pois 格式');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 获取所有模板
    const templates = await prisma.routeTemplate.findMany({
      select: {
        id: true,
        nameCN: true,
        name: true,
        dayPlans: true,
      },
    });

    console.log(`📋 找到 ${templates.length} 个模板`);
    console.log('');

    let migratedCount = 0;
    let totalPoisAdded = 0;

    // 2. 处理每个模板
    for (const template of templates) {
      const dayPlans = template.dayPlans as any[] | null;
      
      if (!dayPlans || !Array.isArray(dayPlans)) {
        continue;
      }

      let hasChanges = false;
      const updatedDayPlans = dayPlans.map((plan: any, index: number) => {
        // 如果已经有 pois，跳过
        if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
          return plan;
        }

        // 如果没有 requiredNodes，跳过
        if (!plan.requiredNodes || !Array.isArray(plan.requiredNodes) || plan.requiredNodes.length === 0) {
          return plan;
        }

        // 将 requiredNodes 转换为 pois
        const pois = plan.requiredNodes.map((node: string, poiIndex: number) => {
          // 判断是 UUID 还是 ID
          const isUuid = node.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );

          if (isUuid) {
            return {
              uuid: node,
              required: true, // requiredNodes 中的都是必游
              order: poiIndex + 1,
            };
          } else {
            // 尝试解析为数字ID
            const id = parseInt(node, 10);
            if (!isNaN(id)) {
              return {
                id: id,
                required: true, // requiredNodes 中的都是必游
                order: poiIndex + 1,
              };
            } else {
              // 如果既不是UUID也不是数字，当作名称处理
              return {
                nameCN: node,
                required: true,
                order: poiIndex + 1,
              };
            }
          }
        });

        hasChanges = true;
        totalPoisAdded += pois.length;

        return {
          ...plan,
          pois: pois,
          // 保留 requiredNodes 以便向后兼容（可选）
          // requiredNodes: plan.requiredNodes,
        };
      });

      if (hasChanges) {
        // 更新模板
        await prisma.routeTemplate.update({
          where: { id: template.id },
          data: {
            dayPlans: updatedDayPlans as any,
            updatedAt: new Date(),
          },
        });

        migratedCount++;
        console.log(`✅ 已迁移模板 ${template.id}: ${template.nameCN || template.name}`);
        
        // 显示迁移详情
        updatedDayPlans.forEach((plan: any, index: number) => {
          const pois = plan.pois || [];
          if (pois.length > 0) {
            console.log(`   第${plan.day || index + 1}天: ${pois.length} 个POI`);
            pois.forEach((poi: any, poiIndex: number) => {
              const identifier = poi.id ? `ID: ${poi.id}` : poi.uuid ? `UUID: ${poi.uuid}` : `名称: ${poi.nameCN}`;
              console.log(`     ${poiIndex + 1}. ${identifier} (Required: ${poi.required})`);
            });
          }
        });
        console.log('');
      }
    }

    console.log('='.repeat(70));
    console.log('📊 迁移统计');
    console.log('='.repeat(70));
    console.log(`总模板数: ${templates.length}`);
    console.log(`已迁移模板数: ${migratedCount}`);
    console.log(`总添加POI数: ${totalPoisAdded}`);
    console.log('='.repeat(70));
    console.log('');

    // 3. 验证迁移结果
    console.log('🔍 验证迁移结果...');
    const verifyTemplates = await prisma.routeTemplate.findMany({
      where: {
        id: { in: [36, 38] }, // 验证模板36和38
      },
      select: {
        id: true,
        nameCN: true,
        dayPlans: true,
      },
    });

    for (const template of verifyTemplates) {
      const dayPlans = template.dayPlans as any[] | null;
      if (!dayPlans || !Array.isArray(dayPlans)) {
        continue;
      }

      let totalPois = 0;
      dayPlans.forEach((plan: any) => {
        const pois = plan.pois || [];
        totalPois += pois.length;
      });

      console.log(`模板 ${template.id}: ${totalPois} 个POI`);
    }

  } catch (error: any) {
    console.error('❌ 迁移失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateRequiredNodesToPois().catch(console.error);
