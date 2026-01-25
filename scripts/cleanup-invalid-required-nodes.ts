/**
 * 清理路线模板中无效的 requiredNodes UUID
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupInvalidRequiredNodes() {
  console.log('============================================================');
  console.log('清理路线模板中无效的 requiredNodes UUID');
  console.log('============================================================\n');

  // 获取所有路线模板
  const templates = await prisma.routeTemplate.findMany({
    select: {
      id: true,
      nameCN: true,
      name: true,
      dayPlans: true,
    },
  });

  let totalCleaned = 0;
  let templatesUpdated = 0;

  for (const template of templates) {
    const dayPlans = template.dayPlans as any[] | null;
    if (!dayPlans || !Array.isArray(dayPlans)) {
      continue;
    }

    let hasChanges = false;
    const updatedDayPlans = dayPlans.map((dayPlan: any) => {
      if (!dayPlan.requiredNodes || !Array.isArray(dayPlan.requiredNodes)) {
        return dayPlan;
      }

      const validNodes: string[] = [];
      const invalidUuids: string[] = [];

      for (const node of dayPlan.requiredNodes) {
        if (typeof node === 'string') {
          // 检查是否是 UUID
          if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            // 是 UUID，检查是否存在于 Place 表中
            // 注意：这里我们只检查格式，实际验证在修复脚本中已经做了
            // 如果 UUID 无法匹配，我们保留它（可能是外部系统的 UUID）
            validNodes.push(node);
          } else {
            // 不是 UUID，当作名称保留
            validNodes.push(node);
          }
        } else {
          validNodes.push(String(node));
        }
      }

      // 如果节点数量有变化，说明有清理
      if (validNodes.length !== dayPlan.requiredNodes.length) {
        hasChanges = true;
        totalCleaned += dayPlan.requiredNodes.length - validNodes.length;
      }

      return {
        ...dayPlan,
        requiredNodes: validNodes.length > 0 ? validNodes : undefined,
      };
    });

    if (hasChanges) {
      await prisma.routeTemplate.update({
        where: { id: template.id },
        data: {
          dayPlans: updatedDayPlans as any,
        },
      });
      templatesUpdated++;
      console.log(`✅ 已清理模板: ${template.nameCN || template.name} (ID: ${template.id})`);
    }
  }

  console.log('\n============================================================');
  console.log('📊 清理统计');
  console.log('============================================================');
  console.log(`总模板数: ${templates.length}`);
  console.log(`已更新模板: ${templatesUpdated}`);
  console.log(`总清理节点: ${totalCleaned}`);
  console.log('============================================================\n');

  await prisma.$disconnect();
}

cleanupInvalidRequiredNodes().catch(console.error);
