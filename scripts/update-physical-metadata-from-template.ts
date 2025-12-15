// scripts/update-physical-metadata-from-template.ts

/**
 * 使用指定 Place (ID: 28497) 的 physicalMetadata 作为模板更新其他 Place
 * 
 * 使用方法:
 *   npx ts-node scripts/update-physical-metadata-from-template.ts
 * 
 * 功能:
 *   1. 查询 ID 28497 的 Place 数据，获取其 physicalMetadata
 *   2. 可以选择性地更新其他 Place 的 physicalMetadata
 *   3. 支持按条件筛选（category、名称匹配等）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE_PLACE_ID = 28497;

/**
 * 查询模板 Place 数据
 */
async function getTemplatePlace() {
  const place = await prisma.place.findUnique({
    where: { id: TEMPLATE_PLACE_ID },
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
      category: true,
      physicalMetadata: true,
      metadata: true,
    },
  });

  if (!place) {
    throw new Error(`未找到 ID 为 ${TEMPLATE_PLACE_ID} 的 Place 记录`);
  }

  return place;
}

/**
 * 更新单个 Place 的 physicalMetadata
 */
async function updatePlacePhysicalMetadata(
  placeId: number,
  physicalMetadata: any,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        physicalMetadata: true,
      },
    });

    if (!place) {
      console.error(`  ❌ Place ID ${placeId} 不存在`);
      return false;
    }

    const name = place.nameCN || place.nameEN || `ID: ${place.id}`;
    console.log(`\n📝 处理: ${name} (ID: ${place.id}, Category: ${place.category})`);

    if (dryRun) {
      console.log(`  🔍 [DRY RUN] 将更新 physicalMetadata:`);
      console.log(`     ${JSON.stringify(physicalMetadata, null, 2)}`);
      return true;
    }

    await prisma.place.update({
      where: { id: placeId },
      data: {
        physicalMetadata: physicalMetadata as any,
        updatedAt: new Date(),
      } as any,
    });

    console.log(`  ✅ 已更新 physicalMetadata`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ 更新失败: ${error?.message || String(error)}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const placeIdsArg = args.find(arg => arg.startsWith('--ids='));
  const categoryArg = args.find(arg => arg.startsWith('--category='));
  const nameArg = args.find(arg => arg.startsWith('--name='));

  console.log('🔍 查询模板 Place (ID: 28497)...\n');

  // 1. 获取模板数据
  const templatePlace = await getTemplatePlace();
  const templateName = templatePlace.nameCN || templatePlace.nameEN || `ID: ${templatePlace.id}`;
  const templatePhysicalMetadata = templatePlace.physicalMetadata as any;

  console.log(`📋 模板 Place:`);
  console.log(`   ID: ${templatePlace.id}`);
  console.log(`   名称: ${templateName}`);
  console.log(`   类别: ${templatePlace.category}`);
  console.log(`   physicalMetadata:`);
  console.log(`     ${JSON.stringify(templatePhysicalMetadata, null, 2)}`);

  if (!templatePhysicalMetadata) {
    console.error('\n❌ 模板 Place 的 physicalMetadata 为空，无法使用');
    return;
  }

  // 2. 确定要更新的 Place 列表
  let placesToUpdate: Array<{ id: number; nameCN: string; nameEN: string | null; category: string }> = [];

  if (placeIdsArg) {
    // 按 ID 列表更新
    const ids = placeIdsArg.split('=')[1].split(',').map(id => parseInt(id.trim()));
    console.log(`\n🔍 查询指定 ID 的 Place: ${ids.join(', ')}...`);
    
    const places = await prisma.place.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
      },
    });

    placesToUpdate = places as any;
  } else if (categoryArg) {
    // 按类别更新
    const category = categoryArg.split('=')[1].trim();
    console.log(`\n🔍 查询类别为 "${category}" 的 Place...`);
    
    const places = await prisma.place.findMany({
      where: { category: category as any },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
      },
      take: 100, // 限制数量，避免更新太多
    });

    placesToUpdate = places as any;
  } else if (nameArg) {
    // 按名称匹配更新
    const namePattern = nameArg.split('=')[1].trim();
    console.log(`\n🔍 查询名称包含 "${namePattern}" 的 Place...`);
    
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
    }>>`
      SELECT id, "nameCN", "nameEN", category
      FROM "Place"
      WHERE "nameCN" ILIKE ${`%${namePattern}%`}
         OR "nameEN" ILIKE ${`%${namePattern}%`}
      LIMIT 100
    `;

    placesToUpdate = places;
  } else {
    // 如果没有指定条件，只显示模板数据，不更新
    console.log('\n💡 提示：未指定更新条件，仅显示模板数据');
    console.log('\n使用方法:');
    console.log('  --ids=1,2,3          # 更新指定 ID 的 Place');
    console.log('  --category=ATTRACTION # 更新指定类别的 Place');
    console.log('  --name=布达拉        # 更新名称包含关键词的 Place');
    console.log('  --dry-run            # 仅预览，不实际更新');
    return;
  }

  if (placesToUpdate.length === 0) {
    console.log('❌ 未找到要更新的 Place 记录');
    return;
  }

  console.log(`\n📊 找到 ${placesToUpdate.length} 条记录，准备更新...`);

  if (dryRun) {
    console.log('\n🔍 [DRY RUN 模式] 仅预览，不会实际更新数据库\n');
  }

  // 3. 更新每个 Place
  let successCount = 0;
  let failCount = 0;

  for (const place of placesToUpdate) {
    const success = await updatePlacePhysicalMetadata(
      place.id,
      templatePhysicalMetadata,
      dryRun
    );
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // 4. 输出统计
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 更新统计:`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log(`   总计: ${placesToUpdate.length}`);
  
  if (dryRun) {
    console.log(`\n💡 这是 DRY RUN 模式，未实际更新数据库`);
    console.log(`   如需实际更新，请移除 --dry-run 参数`);
  } else {
    console.log(`\n✅ 更新完成！`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

