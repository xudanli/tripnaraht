/**
 * 删除 nameCN 等于 'Unnamed place' 的 Place 数据
 * 
 * 使用方法：
 *   npx tsx scripts/delete-unnamed-places.ts [--dry-run] [--force]
 * 
 * 参数：
 *   --dry-run: 只检查不删除
 *   --force: 强制删除，即使有依赖关系
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DeleteStats {
  totalPlaces: number;
  itineraryItems: number;
  trails: number;
  trailWaypoints: number;
  deletedPlaces: number;
}

async function checkDependencies(totalPlaces: number): Promise<Omit<DeleteStats, 'deletedPlaces'>> {
  // 使用原始 SQL 查询避免参数限制（不使用 IN 子句，而是使用子查询）
  const [itineraryItemsResult, trailsResult, trailWaypointsResult] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM "ItineraryItem"
      WHERE "placeId" IN (
        SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
      )
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM "Trail"
      WHERE "startPlaceId" IN (
        SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
      )
      OR "endPlaceId" IN (
        SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
      )
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM "TrailWaypoint"
      WHERE "placeId" IN (
        SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
      )
    `,
  ]);

  const itineraryItems = Number(itineraryItemsResult[0]?.count || 0);
  const trails = Number(trailsResult[0]?.count || 0);
  const trailWaypoints = Number(trailWaypointsResult[0]?.count || 0);

  return {
    totalPlaces,
    itineraryItems,
    trails,
    trailWaypoints,
  };
}

async function deleteUnnamedPlaces(dryRun: boolean = false, force: boolean = false): Promise<void> {
  try {
    console.log('🔍 查找 nameCN = "Unnamed place" 的地点...');
    
    // 先统计数量（避免一次性加载所有 ID）
    const totalCount = await prisma.place.count({
      where: { nameCN: 'Unnamed place' },
    });

    console.log(`📊 找到 ${totalCount} 条记录`);

    if (totalCount === 0) {
      console.log('✅ 没有需要删除的数据');
      return;
    }

    // 检查依赖关系（使用原始 SQL 避免参数限制）
    console.log('\n🔗 检查外键依赖关系...');
    const stats = await checkDependencies(totalCount);
    
    console.log(`   地点总数: ${stats.totalPlaces}`);
    console.log(`   ItineraryItem 引用: ${stats.itineraryItems}`);
    console.log(`   Trail 引用: ${stats.trails}`);
    console.log(`   TrailWaypoint 引用: ${stats.trailWaypoints}`);

    if (stats.itineraryItems > 0 || stats.trails > 0 || stats.trailWaypoints > 0) {
      if (!force) {
        console.error('\n❌ 发现外键依赖关系！');
        console.error('   这些地点被其他表引用，无法直接删除。');
        console.error('   请先处理依赖关系，或使用 --force 参数强制删除（会先清理依赖项）。');
        return;
      } else {
        console.log('\n⚠️  发现依赖关系，但使用 --force 参数，将先清理依赖项...');
      }
    }

    if (dryRun) {
      console.log('\n🔍 [DRY RUN] 模拟删除操作...');
      console.log(`   将删除 ${stats.totalPlaces} 条 Place 记录`);
      if (force) {
        console.log(`   将清理 ${stats.itineraryItems} 条 ItineraryItem 引用`);
        console.log(`   将清理 ${stats.trails} 条 Trail 引用`);
        console.log(`   将清理 ${stats.trailWaypoints} 条 TrailWaypoint 引用`);
      }
      console.log('✅ [DRY RUN] 完成（未实际删除）');
      return;
    }

    // 执行删除
    console.log('\n🗑️  开始删除...');
    
    await prisma.$transaction(async (tx) => {
      if (force) {
        // 使用原始 SQL 删除/更新依赖项（避免参数限制）
        if (stats.trailWaypoints > 0) {
          console.log(`   删除 ${stats.trailWaypoints} 条 TrailWaypoint 记录...`);
          await tx.$executeRaw`
            DELETE FROM "TrailWaypoint"
            WHERE "placeId" IN (
              SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
            )
          `;
        }

        if (stats.trails > 0) {
          console.log(`   更新 ${stats.trails} 条 Trail 记录（将 placeId 设为 NULL）...`);
          await tx.$executeRaw`
            UPDATE "Trail"
            SET "startPlaceId" = NULL
            WHERE "startPlaceId" IN (
              SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
            )
          `;
          await tx.$executeRaw`
            UPDATE "Trail"
            SET "endPlaceId" = NULL
            WHERE "endPlaceId" IN (
              SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
            )
          `;
        }

        if (stats.itineraryItems > 0) {
          console.log(`   更新 ${stats.itineraryItems} 条 ItineraryItem 记录（将 placeId 设为 NULL）...`);
          await tx.$executeRaw`
            UPDATE "ItineraryItem"
            SET "placeId" = NULL
            WHERE "placeId" IN (
              SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
            )
          `;
        }
      }

      // 删除 Place 记录（使用原始 SQL 更高效）
      console.log(`   删除 ${stats.totalPlaces} 条 Place 记录...`);
      
      // 使用 RETURNING 获取删除的行数（PostgreSQL 特性）
      const deleteResult = await tx.$queryRaw<Array<{ deleted_count: bigint }>>`
        WITH deleted AS (
          DELETE FROM "Place"
          WHERE "nameCN" = 'Unnamed place'
          RETURNING id
        )
        SELECT COUNT(*)::bigint as deleted_count FROM deleted
      `;
      
      const deleted = Number(deleteResult[0]?.deleted_count || 0);
      console.log(`✅ 成功删除 ${deleted} 条记录`);
    });

    // 验证删除结果
    const remaining = await prisma.place.count({
      where: { nameCN: 'Unnamed place' },
    });
    
    if (remaining === 0) {
      console.log('✅ 所有 "Unnamed place" 记录已删除');
    } else {
      console.log(`⚠️  仍有 ${remaining} 条记录未删除`);
    }

  } catch (error: any) {
    console.error('❌ 删除失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

if (dryRun) {
  console.log('🔍 [DRY RUN 模式] 只检查不删除\n');
}

if (force) {
  console.log('⚠️  [FORCE 模式] 将强制删除，包括清理依赖项\n');
}

deleteUnnamedPlaces(dryRun, force)
  .then(() => {
    console.log('\n✅ 操作完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 操作失败:', error);
    process.exit(1);
  });
