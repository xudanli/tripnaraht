#!/usr/bin/env tsx
/**
 * 导入冰岛POI的开放时间数据（替代方案）
 * 
 * 使用现有的 enrichPlaceFromAmap 方法更新开放时间
 * 这个方法使用高德地图API，可能更适合当前网络环境
 * 
 * 使用方法:
 *   npm run script:import-iceland-opening-hours:amap
 *   或
 *   BATCH_SIZE=10 DELAY_MS=500 npm run script:import-iceland-opening-hours:amap
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '500', 10);
const MAX_PLACES = parseInt(process.env.MAX_PLACES || '0', 10); // 0表示不限制

/**
 * 检查Place是否有开放时间数据
 */
function hasOpeningHours(metadata: any): boolean {
  if (!metadata) return false;
  
  // 检查新格式
  if (metadata.basic?.openingHours || metadata.basic?.openingHoursStructured) {
    return true;
  }
  
  // 检查旧格式
  if (metadata.openingHours) {
    return true;
  }
  
  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛POI开放时间数据');
  console.log('='.repeat(60));
  console.log('');
  console.log('⚠️  注意: 此脚本需要调用 PlacesService.enrichPlaceFromAmap 方法');
  console.log('   由于网络限制，建议使用API接口批量更新');
  console.log('   或直接使用数据库查询和更新\n');

  try {

    // 1. 查询所有冰岛POI，然后过滤出没有开放时间的
    console.log('📋 查询冰岛POI...');
    
    const allPlaces = await prisma.place.findMany({
      where: {
        City: {
          countryCode: 'IS',
        },
        category: 'ATTRACTION',
      },
      include: {
        City: true,
      },
    });

    console.log(`   找到 ${allPlaces.length} 个冰岛POI，检查开放时间...`);

    // 过滤出没有开放时间的POI
    const places = allPlaces
      .filter(place => !hasOpeningHours(place.metadata))
      .slice(0, MAX_PLACES || allPlaces.length);

    console.log(`   找到 ${places.length} 个需要更新开放时间的POI\n`);

    if (places.length === 0) {
      console.log('✅ 所有POI都已包含开放时间数据');
      return;
    }

    // 2. 分批处理
    const results: Array<{
      placeId: number;
      name: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(places.length / BATCH_SIZE);

      console.log(`\n📦 处理批次 ${batchNum}/${totalBatches} (${batch.length} 个POI)`);

      for (const place of batch) {
        const placeName = place.nameEN || place.nameCN || `Place ${place.id}`;
        console.log(`  🔍 处理: ${placeName} (ID: ${place.id})`);

        try {
          // 检查是否已有开放时间（双重检查）
          if (hasOpeningHours(place.metadata)) {
            console.log(`    ⚠️  跳过: 已有开放时间数据`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'skipped',
              error: '已有开放时间数据',
            });
            skippedCount++;
            continue;
          }

          // 注意：由于模块加载问题，这里只输出信息
          // 实际更新需要通过API接口或直接使用PlacesService
          console.log(`    ℹ️  需要调用 API: POST /api/places/${place.id}/enrich-from-amap`);
          console.log(`       或使用 PlacesService.enrichPlaceFromAmap(${place.id})`);
          
          results.push({
            placeId: place.id,
            name: placeName,
            status: 'skipped',
            error: '需要通过API接口更新',
          });
          skippedCount++;

          // 延迟以避免API限流
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } catch (error: any) {
          console.error(`    ❌ 错误: ${error.message}`);
          results.push({
            placeId: place.id,
            name: placeName,
            status: 'failed',
            error: error.message,
          });
          failedCount++;
        }
      }

      // 批次间延迟
      if (i + BATCH_SIZE < places.length) {
        console.log(`    ⏳ 等待 ${DELAY_MS}ms 后处理下一批次...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    // 3. 输出结果汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 导入结果汇总');
    console.log('='.repeat(60));
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failedCount}`);
    console.log(`⚠️  跳过: ${skippedCount}`);
    console.log(`📊 总计: ${results.length}`);

    // 输出失败详情
    const failedResults = results.filter(r => r.status === 'failed');
    if (failedResults.length > 0) {
      console.log('\n❌ 失败详情:');
      failedResults.forEach(r => {
        console.log(`  - ${r.name} (ID: ${r.placeId}): ${r.error}`);
      });
    }

    // 输出跳过详情（前10个）
    const skippedResults = results.filter(r => r.status === 'skipped');
    if (skippedResults.length > 0) {
      console.log(`\n⚠️  跳过详情（前10个）:`);
      skippedResults.slice(0, 10).forEach(r => {
        console.log(`  - ${r.name} (ID: ${r.placeId}): ${r.error}`);
      });
      if (skippedResults.length > 10) {
        console.log(`  ... 还有 ${skippedResults.length - 10} 个被跳过`);
      }
    }

    console.log('\n✅ 脚本执行完成！');
    console.log('\n💡 建议:');
    console.log('   1. 使用 API 接口批量更新: POST /api/places/batch-enrich-from-amap');
    console.log('   2. 或逐个调用: POST /api/places/:id/enrich-from-amap');
    console.log('   3. 或等待网络环境改善后使用 Google Places API 版本');
  } catch (error: any) {
    console.error('\n❌ 程序执行失败:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
