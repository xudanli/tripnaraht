#!/usr/bin/env tsx
/**
 * 填充 Chunk 表的 category 字段
 * 
 * 根据 chief-ai-scientist.md 中定义的 RAG 架构，category 字段用于分类检索：
 * - RULES: 规则类（法律规则、安全规则）
 * - POI_HOURS: POI营业时间（暂无数据，预留）
 * - POI_INFO: POI信息（景点、住宿等）
 * - GATE: 闸门判断（节奏模式、可行性矩阵）
 * - WEATHER: 天气相关（气候、季节特征）
 * - GENERAL: 通用信息（指南、服务等）
 * 
 * 映射规则基于 chunk.type 和 KnowledgeFile.category 组合
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Category 类型定义
type ChunkCategory = 'RULES' | 'POI_HOURS' | 'POI_INFO' | 'GATE' | 'WEATHER' | 'GENERAL';

// 映射规则：(file_category, chunk_type) => chunk_category
const CATEGORY_MAPPING: Record<string, Record<string, ChunkCategory>> = {
  // 文化规则 → RULES
  'culture_rules': {
    'legal_rule': 'RULES',
    'default': 'RULES',
  },
  
  // POI相关 → POI_INFO
  'pois': {
    'poi': 'POI_INFO',
    'full': 'POI_INFO',
    'section': 'POI_INFO',
    'default': 'POI_INFO',
  },
  
  // 路线 → GENERAL（路线规划信息）
  'routes': {
    'route': 'GENERAL',
    'default': 'GENERAL',
  },
  
  // 安全 → RULES（安全规则）
  'safety': {
    'section': 'RULES',
    'default': 'RULES',
  },
  
  // 地理/季节 → WEATHER
  'geography_seasonal': {
    'full': 'WEATHER',
    'section': 'WEATHER',
    'default': 'WEATHER',
  },
  
  // 决策支持 → GATE（用于闸门判断）
  'decision_support': {
    'rhythm_pattern': 'GATE',
    'section': 'GATE',  // feasibility-matrix, user-personas
    'full': 'GATE',
    'default': 'GATE',
  },
  
  // 实用指南 → GENERAL
  'practical_guides': {
    'cost': 'GENERAL',
    'full': 'GENERAL',
    'insurance': 'GENERAL',
    'process': 'GENERAL',
    'rental_companies': 'GENERAL',
    'rental_overview': 'GENERAL',
    'rules': 'RULES',  // 租车规则
    'vehicle_types': 'GENERAL',
    'default': 'GENERAL',
  },
  
  // 通用 → GENERAL
  'general': {
    'full': 'GENERAL',
    'section': 'GENERAL',
    'default': 'GENERAL',
  },
};

// 获取 category 的映射
function getChunkCategory(fileCategory: string | null, chunkType: string): ChunkCategory {
  const fileCat = fileCategory || 'general';
  const mapping = CATEGORY_MAPPING[fileCat];
  
  if (!mapping) {
    console.warn(`  ⚠️ 未知 file_category: ${fileCat}, 使用 GENERAL`);
    return 'GENERAL';
  }
  
  const category = mapping[chunkType] || mapping['default'];
  if (!category) {
    console.warn(`  ⚠️ 未知 chunk_type: ${chunkType} in ${fileCat}, 使用 GENERAL`);
    return 'GENERAL';
  }
  
  return category;
}

async function populateChunkCategory(dryRun: boolean = false) {
  console.log('📦 填充 Chunk 表的 category 字段');
  console.log('='.repeat(80));
  console.log(`模式: ${dryRun ? '🔍 DRY RUN (仅预览，不修改)' : '✏️ 实际执行'}\n`);
  
  // 1. 获取所有需要更新的 chunks
  const chunks = await prisma.$queryRawUnsafe<Array<{
    id: string;
    chunk_id: string;
    type: string;
    file_category: string | null;
    current_category: string | null;
  }>>(`
    SELECT 
      c.id,
      c.chunk_id,
      c.type,
      kf.category as file_category,
      c.category as current_category
    FROM chunks c
    JOIN knowledge_files kf ON c.file_id = kf.id
    ORDER BY kf.category, c.type
  `);
  
  console.log(`📊 统计信息:`);
  console.log(`   总 chunks 数: ${chunks.length}`);
  console.log(`   当前有 category: ${chunks.filter(c => c.current_category).length}`);
  console.log(`   需要填充: ${chunks.filter(c => !c.current_category).length}\n`);
  
  // 2. 计算每个 chunk 的新 category
  const updates: Array<{ id: string; chunkId: string; newCategory: ChunkCategory }> = [];
  const categoryStats: Record<ChunkCategory, number> = {
    'RULES': 0,
    'POI_HOURS': 0,
    'POI_INFO': 0,
    'GATE': 0,
    'WEATHER': 0,
    'GENERAL': 0,
  };
  
  for (const chunk of chunks) {
    const newCategory = getChunkCategory(chunk.file_category, chunk.type);
    categoryStats[newCategory]++;
    
    // 只更新 category 为 NULL 的
    if (!chunk.current_category) {
      updates.push({
        id: chunk.id,
        chunkId: chunk.chunk_id,
        newCategory,
      });
    }
  }
  
  // 3. 显示预览
  console.log('📈 Category 分布预览:');
  console.log('-'.repeat(40));
  Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const bar = '█'.repeat(Math.round(count / 3));
      console.log(`   ${cat.padEnd(12)} ${String(count).padStart(3)} ${bar}`);
    });
  
  console.log('\n📝 更新详情预览 (前10条):');
  console.log('-'.repeat(60));
  updates.slice(0, 10).forEach(u => {
    console.log(`   ${u.chunkId.substring(0, 40).padEnd(42)} → ${u.newCategory}`);
  });
  if (updates.length > 10) {
    console.log(`   ... 还有 ${updates.length - 10} 条`);
  }
  
  // 4. 执行更新
  if (!dryRun && updates.length > 0) {
    console.log('\n⏳ 执行更新...');
    
    let successCount = 0;
    let errorCount = 0;
    
    // 批量更新（每批100条）
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      try {
        // 使用事务批量更新
        await prisma.$transaction(
          batch.map(u => 
            prisma.chunk.update({
              where: { id: u.id },
              data: { category: u.newCategory },
            })
          )
        );
        successCount += batch.length;
        process.stdout.write(`\r   进度: ${successCount}/${updates.length}`);
      } catch (error: any) {
        errorCount += batch.length;
        console.error(`\n   ❌ 批次 ${Math.floor(i / batchSize) + 1} 失败: ${error.message}`);
      }
    }
    
    console.log('\n');
    console.log('✅ 更新完成!');
    console.log(`   成功: ${successCount}`);
    console.log(`   失败: ${errorCount}`);
  } else if (dryRun) {
    console.log('\n💡 这是 DRY RUN 模式，未执行实际更新。');
    console.log('   运行 `npx tsx scripts/populate-chunk-category.ts --execute` 执行实际更新。');
  } else {
    console.log('\n✅ 所有 chunks 已有 category，无需更新。');
  }
  
  // 5. 验证结果
  if (!dryRun && updates.length > 0) {
    console.log('\n📊 更新后验证:');
    const verification = await prisma.$queryRawUnsafe<Array<{
      category: string | null;
      count: number;
    }>>(`
      SELECT category, COUNT(*)::int as count
      FROM chunks
      GROUP BY category
      ORDER BY count DESC
    `);
    
    verification.forEach(v => {
      console.log(`   ${(v.category || 'NULL').padEnd(12)} ${v.count}`);
    });
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  try {
    await populateChunkCategory(dryRun);
  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
