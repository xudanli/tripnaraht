/**
 * 路线模板迁移脚本：将旧格式（requiredNodes）转换为新格式（pois）
 * 
 * 使用方法：
 *   npx ts-node scripts/migrate-route-template-to-pois.ts [templateId]
 * 
 * 如果不提供 templateId，将迁移所有使用旧格式的模板
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DayPlan {
  day: number;
  theme?: string;
  requiredNodes?: string[] | number[];
  pois?: any[];
  [key: string]: any;
}

/**
 * 检查模板是否使用旧格式（只有 requiredNodes，没有或空的 pois）
 */
function isOldFormat(dayPlans: any[]): boolean {
  if (!dayPlans || !Array.isArray(dayPlans)) return false;
  
  return dayPlans.some((plan: any) => {
    const hasRequiredNodes = plan.requiredNodes && Array.isArray(plan.requiredNodes) && plan.requiredNodes.length > 0;
    const hasPois = plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0;
    return hasRequiredNodes && !hasPois;
  });
}

/**
 * 将 requiredNodes ID 转换为数字数组
 */
function normalizeNodeIds(requiredNodes: any[]): number[] {
  return requiredNodes
    .map(id => {
      if (typeof id === 'number') return id;
      if (typeof id === 'string') {
        const numId = parseInt(id, 10);
        return isNaN(numId) ? null : numId;
      }
      return null;
    })
    .filter((id): id is number => id !== null);
}

/**
 * 迁移单个模板
 */
async function migrateTemplate(templateId: number, dryRun: boolean = false): Promise<{
  success: boolean;
  templateId: number;
  migratedDays: number;
  migratedPois: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migratedDays = 0;
  let migratedPois = 0;

  try {
    // 1. 查询模板
    const template = await prisma.routeTemplate.findUnique({
      where: { id: templateId },
      include: { routeDirection: true },
    });

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const dayPlans = template.dayPlans as any[];
    if (!dayPlans || !Array.isArray(dayPlans)) {
      throw new Error(`Invalid dayPlans format for template ${templateId}`);
    }

    // 2. 检查是否需要迁移
    if (!isOldFormat(dayPlans)) {
      console.log(`✓ Template ${templateId} already uses new format, skipping`);
      return {
        success: true,
        templateId,
        migratedDays: 0,
        migratedPois: 0,
        errors: [],
      };
    }

    console.log(`\n📋 Migrating template ${templateId}: ${template.nameCN || template.name || 'Unnamed'}`);

    // 3. 处理每个 dayPlan
    const updatedDayPlans = await Promise.all(
      dayPlans.map(async (plan: DayPlan, index: number) => {
        const day = plan.day || index + 1;
        const requiredNodes = plan.requiredNodes || [];
        const existingPois = plan.pois || [];

        // 如果已经有 pois，跳过
        if (existingPois.length > 0) {
          console.log(`  Day ${day}: Already has ${existingPois.length} POIs, skipping`);
          return plan;
        }

        // 如果没有 requiredNodes，跳过
        if (!Array.isArray(requiredNodes) || requiredNodes.length === 0) {
          console.log(`  Day ${day}: No requiredNodes, skipping`);
          return plan;
        }

        console.log(`  Day ${day}: Converting ${requiredNodes.length} requiredNodes to pois...`);

        // 4. 将 requiredNodes ID 转换为数字数组
        const nodeIds = normalizeNodeIds(requiredNodes);
        if (nodeIds.length === 0) {
          errors.push(`Template ${templateId}, Day ${day}: No valid node IDs found`);
          return plan;
        }

        // 5. 查询 Place 信息
        const places = await prisma.place.findMany({
          where: {
            id: { in: nodeIds },
          },
          select: {
            id: true,
            uuid: true,
            nameCN: true,
            nameEN: true,
            category: true,
            address: true,
            rating: true,
            description: true,
          },
        });

        // 6. 创建 POI 映射（按原始顺序）
        const placeMap = new Map(places.map(p => [p.id, p]));
        const pois: any[] = [];

        for (let i = 0; i < nodeIds.length; i++) {
          const nodeId = nodeIds[i];
          const place = placeMap.get(nodeId);

          if (!place) {
            errors.push(`Template ${templateId}, Day ${day}: Place ID ${nodeId} not found in database`);
            continue;
          }

          pois.push({
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category || undefined,
            required: true, // requiredNodes 中的都是必游
            priority: 'MUST_SEE', // 默认最高优先级
            order: i + 1, // 保持原始顺序
            ...(place.address && { address: place.address }),
            ...(place.rating && { rating: place.rating }),
            ...(place.description && { description: place.description }),
          });
        }

        if (pois.length > 0) {
          migratedPois += pois.length;
          migratedDays++;
          console.log(`    ✓ Converted ${pois.length} POIs`);
        }

        // 7. 更新 dayPlan（保留 requiredNodes 以向后兼容，但添加 pois）
        return {
          ...plan,
          day,
          pois,
          // 保留 requiredNodes 以便向后兼容，但标记为已迁移
          requiredNodes: requiredNodes, // 保留原始数据
          _migrated: true, // 标记已迁移
        };
      })
    );

    // 8. 更新数据库
    if (!dryRun && migratedPois > 0) {
      await prisma.routeTemplate.update({
        where: { id: templateId },
        data: {
          dayPlans: updatedDayPlans as any,
          updatedAt: new Date(),
        },
      });
      console.log(`✓ Template ${templateId} updated successfully`);
    } else if (dryRun) {
      console.log(`[DRY RUN] Would update template ${templateId} with ${migratedPois} POIs`);
    }

    return {
      success: errors.length === 0,
      templateId,
      migratedDays,
      migratedPois,
      errors,
    };
  } catch (error: any) {
    errors.push(`Template ${templateId}: ${error.message}`);
    console.error(`✗ Error migrating template ${templateId}:`, error.message);
    return {
      success: false,
      templateId,
      migratedDays,
      migratedPois,
      errors,
    };
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const templateIdArg = args.find(arg => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const templateId = templateIdArg ? parseInt(templateIdArg, 10) : null;

  console.log('🚀 Route Template Migration Script');
  console.log('=====================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
  }

  try {
    if (templateId) {
      // 迁移单个模板
      console.log(`Migrating template ${templateId}...\n`);
      const result = await migrateTemplate(templateId, dryRun);
      
      console.log('\n📊 Migration Summary:');
      console.log(`  Template ID: ${result.templateId}`);
      console.log(`  Migrated Days: ${result.migratedDays}`);
      console.log(`  Migrated POIs: ${result.migratedPois}`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        result.errors.forEach(err => console.log(`    - ${err}`));
      }
    } else {
      // 迁移所有使用旧格式的模板
      console.log('Finding templates with old format...\n');
      
      const templates = await prisma.routeTemplate.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          nameCN: true,
          dayPlans: true,
        },
      });

      const templatesToMigrate = templates.filter(t => isOldFormat(t.dayPlans as any[]));
      
      console.log(`Found ${templatesToMigrate.length} templates to migrate:\n`);
      templatesToMigrate.forEach(t => {
        console.log(`  - Template ${t.id}: ${t.nameCN || t.name || 'Unnamed'}`);
      });

      if (templatesToMigrate.length === 0) {
        console.log('\n✓ No templates need migration');
        return;
      }

      console.log(`\nStarting migration of ${templatesToMigrate.length} templates...\n`);

      const results = await Promise.all(
        templatesToMigrate.map(t => migrateTemplate(t.id, dryRun))
      );

      // 汇总统计
      const totalMigratedDays = results.reduce((sum, r) => sum + r.migratedDays, 0);
      const totalMigratedPois = results.reduce((sum, r) => sum + r.migratedPois, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const successCount = results.filter(r => r.success).length;

      console.log('\n📊 Migration Summary:');
      console.log(`  Total Templates: ${templatesToMigrate.length}`);
      console.log(`  Successfully Migrated: ${successCount}`);
      console.log(`  Total Migrated Days: ${totalMigratedDays}`);
      console.log(`  Total Migrated POIs: ${totalMigratedPois}`);
      console.log(`  Total Errors: ${totalErrors}`);

      if (totalErrors > 0) {
        console.log('\n⚠️  Errors:');
        results.forEach(r => {
          if (r.errors.length > 0) {
            r.errors.forEach(err => console.log(`    - ${err}`));
          }
        });
      }
    }
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
main().catch(console.error);
