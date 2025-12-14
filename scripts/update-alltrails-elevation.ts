// scripts/update-alltrails-elevation.ts

/**
 * 更新已导入的 AllTrails 数据，添加海拔因素
 * 
 * 使用方法:
 *   npm run update:alltrails:elevation
 * 
 * 功能:
 *   1. 查找所有 source = 'alltrails' 的 Place 记录
 *   2. 检查是否有 fatigueMetadata.maxElevation 但没有 metadata.elevationMeters
 *   3. 更新 metadata，添加 elevationMeters
 *   4. 可选：重新生成 physicalMetadata
 */

import { PrismaClient } from '@prisma/client';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';
import { PlaceCategory } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 更新单个 Place 的海拔信息和 accessType
 */
async function updatePlaceElevation(place: any): Promise<boolean> {
  try {
    const metadata = place.metadata || {};
    const fatigueMetadata = place.physicalMetadata || {};
    
    let needsUpdate = false;
    const updatedMetadata: any = { ...metadata };
    
    // 1. 检查并添加 accessType: 'HIKING'（AllTrails 数据都是徒步路线）
    if (metadata.source === 'alltrails' && metadata.accessType !== 'HIKING') {
      updatedMetadata.accessType = 'HIKING';
      needsUpdate = true;
    }
    
    // 2. 检查并添加 elevationMeters（从 fatigueMetadata.maxElevation）
    const hasMaxElevation = fatigueMetadata.maxElevation && typeof fatigueMetadata.maxElevation === 'number';
    const hasElevationMeters = metadata.elevationMeters && typeof metadata.elevationMeters === 'number';
    
    if (hasMaxElevation) {
      if (!hasElevationMeters || metadata.elevationMeters !== fatigueMetadata.maxElevation) {
        updatedMetadata.elevationMeters = fatigueMetadata.maxElevation;
        needsUpdate = true;
      }
    }
    
    if (!needsUpdate) {
      return false; // 无需更新
    }
    
    // 可选：重新生成 physicalMetadata（如果还没有或需要更新）
    let updatedPhysicalMetadata = place.physicalMetadata;
    try {
      const newPhysicalMetadata = PhysicalMetadataGenerator.generateByCategory(
        place.category as PlaceCategory,
        updatedMetadata
      );
      updatedPhysicalMetadata = newPhysicalMetadata as any;
    } catch (e: any) {
      console.warn(`  ⚠️  重新生成 physicalMetadata 失败: ${e?.message || String(e)}`);
      // 继续更新 metadata，即使 physicalMetadata 生成失败
    }
    
    // 更新数据库
    await prisma.place.update({
      where: { id: place.id },
      data: {
        metadata: updatedMetadata as any,
        physicalMetadata: updatedPhysicalMetadata as any,
        updatedAt: new Date(),
      } as any,
    });
    
    return true;
  } catch (error: any) {
    console.error(`  ❌ 更新失败: ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 查找所有 AllTrails 数据...\n');
  
  // 查询所有 source = 'alltrails' 的 Place
  const places = await prisma.$queryRaw<Array<{
    id: number;
    uuid: string;
    nameCN: string;
    nameEN: string | null;
    category: string;
    metadata: any;
    physicalMetadata: any;
  }>>`
    SELECT 
      id,
      uuid,
      "nameCN",
      "nameEN",
      category,
      metadata,
      "physicalMetadata"
    FROM "Place"
    WHERE metadata->>'source' = 'alltrails'
    ORDER BY id ASC;
  `;
  
  console.log(`📊 找到 ${places.length} 条 AllTrails 数据\n`);
  
  if (places.length === 0) {
    console.log('✅ 没有找到 AllTrails 数据');
    return;
  }
  
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const name = place.nameCN || place.nameEN || `ID: ${place.id}`;
    console.log(`[${i + 1}/${places.length}] 正在处理: ${name}`);
    
    const result = await updatePlaceElevation(place);
    if (result) {
      updatedCount++;
      const elevation = place.physicalMetadata?.maxElevation || place.metadata?.elevationMeters;
      console.log(`  ✅ 已更新 (海拔: ${elevation}m)`);
    } else {
      skippedCount++;
      console.log(`  ⏭️  跳过（无需更新）`);
    }
    
    // 添加小延时，避免数据库压力
    if (i < places.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  console.log(`\n📊 更新完成:`);
  console.log(`   ✅ 已更新: ${updatedCount}`);
  console.log(`   ⏭️  跳过: ${skippedCount}`);
  console.log(`   ❌ 失败: ${errorCount}`);
}

// 运行
if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

