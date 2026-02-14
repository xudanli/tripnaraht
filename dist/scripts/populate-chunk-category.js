#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const CATEGORY_MAPPING = {
    'culture_rules': {
        'legal_rule': 'RULES',
        'default': 'RULES',
    },
    'pois': {
        'poi': 'POI_INFO',
        'full': 'POI_INFO',
        'section': 'POI_INFO',
        'default': 'POI_INFO',
    },
    'routes': {
        'route': 'GENERAL',
        'default': 'GENERAL',
    },
    'safety': {
        'section': 'RULES',
        'default': 'RULES',
    },
    'geography_seasonal': {
        'full': 'WEATHER',
        'section': 'WEATHER',
        'default': 'WEATHER',
    },
    'decision_support': {
        'rhythm_pattern': 'GATE',
        'section': 'GATE',
        'full': 'GATE',
        'default': 'GATE',
    },
    'practical_guides': {
        'cost': 'GENERAL',
        'full': 'GENERAL',
        'insurance': 'GENERAL',
        'process': 'GENERAL',
        'rental_companies': 'GENERAL',
        'rental_overview': 'GENERAL',
        'rules': 'RULES',
        'vehicle_types': 'GENERAL',
        'default': 'GENERAL',
    },
    'general': {
        'full': 'GENERAL',
        'section': 'GENERAL',
        'default': 'GENERAL',
    },
};
function getChunkCategory(fileCategory, chunkType) {
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
async function populateChunkCategory(dryRun = false) {
    console.log('📦 填充 Chunk 表的 category 字段');
    console.log('='.repeat(80));
    console.log(`模式: ${dryRun ? '🔍 DRY RUN (仅预览，不修改)' : '✏️ 实际执行'}\n`);
    const chunks = await prisma.$queryRawUnsafe(`
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
    const updates = [];
    const categoryStats = {
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
        if (!chunk.current_category) {
            updates.push({
                id: chunk.id,
                chunkId: chunk.chunk_id,
                newCategory,
            });
        }
    }
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
    if (!dryRun && updates.length > 0) {
        console.log('\n⏳ 执行更新...');
        let successCount = 0;
        let errorCount = 0;
        const batchSize = 100;
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            try {
                await prisma.$transaction(batch.map(u => prisma.chunk.update({
                    where: { id: u.id },
                    data: { category: u.newCategory },
                })));
                successCount += batch.length;
                process.stdout.write(`\r   进度: ${successCount}/${updates.length}`);
            }
            catch (error) {
                errorCount += batch.length;
                console.error(`\n   ❌ 批次 ${Math.floor(i / batchSize) + 1} 失败: ${error.message}`);
            }
        }
        console.log('\n');
        console.log('✅ 更新完成!');
        console.log(`   成功: ${successCount}`);
        console.log(`   失败: ${errorCount}`);
    }
    else if (dryRun) {
        console.log('\n💡 这是 DRY RUN 模式，未执行实际更新。');
        console.log('   运行 `npx tsx scripts/populate-chunk-category.ts --execute` 执行实际更新。');
    }
    else {
        console.log('\n✅ 所有 chunks 已有 category，无需更新。');
    }
    if (!dryRun && updates.length > 0) {
        console.log('\n📊 更新后验证:');
        const verification = await prisma.$queryRawUnsafe(`
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
async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--execute');
    try {
        await populateChunkCategory(dryRun);
    }
    catch (error) {
        console.error('❌ 执行失败:', error.message);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=populate-chunk-category.js.map