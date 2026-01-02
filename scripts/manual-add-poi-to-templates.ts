// scripts/manual-add-poi-to-templates.ts
// 手动为路线模板添加 requiredNodes（POI 关联）
// 使用方式：修改下面的 TEMPLATE_POI_MAPPING 配置，然后运行脚本

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 模板 POI 映射配置
 * 
 * 格式：
 * templateId: {
 *   day: number,  // 第几天
 *   requiredNodes: string[]  // Place UUID 或名称数组
 * }
 */
const TEMPLATE_POI_MAPPING: Record<number, Array<{
  day: number;
  requiredNodes: string[];
}>> = {
  // 示例：为模板 ID 1 的第 2 天添加 POI
  // 1: [
  //   {
  //     day: 2,
  //     requiredNodes: ['place-uuid-1', '黄金圈', 'Geysir']
  //   }
  // ],
  
  // 在这里添加你的配置
};

/**
 * 为路线模板添加 requiredNodes
 */
async function addPOIToTemplates() {
  try {
    console.log('开始为路线模板添加 POI 关联...\n');
    
    if (Object.keys(TEMPLATE_POI_MAPPING).length === 0) {
      console.log('⚠️  未配置任何模板 POI 映射');
      console.log('请在 TEMPLATE_POI_MAPPING 中添加配置后重新运行脚本');
      return;
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const [templateIdStr, dayMappings] of Object.entries(TEMPLATE_POI_MAPPING)) {
      const templateId = parseInt(templateIdStr, 10);
      
      try {
        // 查询模板
        const template = await prisma.routeTemplate.findUnique({
          where: { id: templateId },
          include: {
            routeDirection: {
              select: {
                countryCode: true,
              },
            },
          },
        });
        
        if (!template) {
          console.log(`❌ 模板 ID ${templateId} 不存在`);
          errorCount++;
          continue;
        }
        
        console.log(`处理模板 ID ${templateId}: ${template.nameCN || template.nameEN}`);
        
        const dayPlans = template.dayPlans as any[];
        const updatedDayPlans = dayPlans.map(dayPlan => {
          // 查找是否有对应的配置
          const mapping = dayMappings.find(m => m.day === dayPlan.day);
          
          if (mapping) {
            // 合并 requiredNodes（如果已有，则合并；否则新建）
            const existingNodes = dayPlan.requiredNodes || [];
            const newNodes = [...new Set([...existingNodes, ...mapping.requiredNodes])];
            
            console.log(`  第${dayPlan.day}天: 添加 ${mapping.requiredNodes.length} 个 requiredNodes`);
            mapping.requiredNodes.forEach(node => {
              console.log(`    - ${node}`);
            });
            
            return {
              ...dayPlan,
              requiredNodes: newNodes,
            };
          }
          
          return dayPlan;
        });
        
        // 更新模板
        await prisma.routeTemplate.update({
          where: { id: templateId },
          data: {
            dayPlans: updatedDayPlans as any,
            updatedAt: new Date(),
          },
        });
        
        updatedCount++;
        console.log(`✅ 模板 ID ${templateId} 已更新\n`);
        
      } catch (error: any) {
        console.error(`❌ 处理模板 ID ${templateId} 失败:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== 完成 ===');
    console.log(`更新: ${updatedCount} 个模板`);
    console.log(`失败: ${errorCount} 个模板`);
    console.log(`总计: ${Object.keys(TEMPLATE_POI_MAPPING).length} 个模板配置`);
    
  } catch (error: any) {
    console.error('处理失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
addPOIToTemplates();

