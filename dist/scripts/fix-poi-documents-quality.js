#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function containsOpeningHours(content) {
    const contentLower = content.toLowerCase();
    const timeKeywords = [
        '开放时间', '营业时间', 'opening hours', 'opening time',
        'hours:', 'hours：', '营业：', '营业:',
    ];
    const dayKeywords = [
        '周一', '周二', '周三', '周四', '周五', '周六', '周日',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ];
    const timePatterns = [
        /\d{1,2}:\d{2}\s*(am|pm|AM|PM)/,
        /\d{1,2}:\d{2}-\d{1,2}:\d{2}/,
        /\d{1,2}:\d{2}:\d{2}/,
        /(全天|24小时|24\/7|always open)/i,
    ];
    const hasTimeKeyword = timeKeywords.some(keyword => contentLower.includes(keyword.toLowerCase()));
    const hasDayKeyword = dayKeywords.some(keyword => contentLower.includes(keyword.toLowerCase()));
    const hasTimePattern = timePatterns.some(pattern => pattern.test(content));
    return hasTimeKeyword && (hasDayKeyword || hasTimePattern);
}
function determineCategory(fileCategory, chunkType, chunkContent) {
    if (fileCategory === 'pois') {
        if (containsOpeningHours(chunkContent)) {
            return 'POI_HOURS';
        }
        return 'POI_INFO';
    }
    return 'GENERAL';
}
async function fixPOIDocuments(dryRun = false) {
    var _a;
    console.log('='.repeat(80));
    console.log('🔧 POI文档质量修复工具');
    console.log('='.repeat(80));
    console.log(`模式: ${dryRun ? '🔍 DRY RUN (仅预览，不修改)' : '✏️ 实际执行'}\n`);
    try {
        const poiChunks = await prisma.$queryRawUnsafe(`
      SELECT 
        c.id,
        c.chunk_id,
        c.type,
        c.content,
        c.category,
        c.last_verified_at,
        c.created_at,
        kf.category as file_category,
        kf.filename
      FROM chunks c
      JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE kf.category = 'pois'
      ORDER BY kf.filename, c.created_at
    `);
        console.log(`📊 找到 ${poiChunks.length} 个POI文档的chunks\n`);
        if (poiChunks.length === 0) {
            console.log('⚠️  没有找到POI文档的chunks');
            return;
        }
        const updates = [];
        const categoryStats = {
            'RULES': 0,
            'POI_HOURS': 0,
            'POI_INFO': 0,
            'GATE': 0,
            'WEATHER': 0,
            'GENERAL': 0,
        };
        poiChunks.forEach((chunk) => {
            const newCategory = determineCategory(chunk.file_category, chunk.type, chunk.content);
            categoryStats[newCategory]++;
            const needsCategory = !chunk.category || chunk.category !== newCategory;
            const needsLastVerified = !chunk.last_verified_at;
            if (needsCategory || needsLastVerified) {
                updates.push({
                    id: chunk.id,
                    chunkId: chunk.chunk_id,
                    newCategory,
                    needsLastVerified,
                });
            }
        });
        console.log('📈 Category分布统计:');
        console.log('-'.repeat(40));
        Object.entries(categoryStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, count]) => {
            const percentage = ((count / poiChunks.length) * 100).toFixed(1);
            const bar = '█'.repeat(Math.round(count / 5));
            console.log(`   ${cat.padEnd(12)} ${String(count).padStart(3)} (${percentage}%) ${bar}`);
        });
        console.log('');
        console.log(`📝 需要更新的chunks: ${updates.length}`);
        console.log(`   - 需要设置category: ${updates.filter(u => { var _a, _b; return !((_a = poiChunks.find(c => c.id === u.id)) === null || _a === void 0 ? void 0 : _a.category) || ((_b = poiChunks.find(c => c.id === u.id)) === null || _b === void 0 ? void 0 : _b.category) !== u.newCategory; }).length}`);
        console.log(`   - 需要设置lastVerifiedAt: ${updates.filter(u => u.needsLastVerified).length}`);
        console.log('');
        if (updates.length > 0) {
            console.log('📋 更新预览 (前10个):');
            console.log('-'.repeat(80));
            updates.slice(0, 10).forEach((update, index) => {
                const chunk = poiChunks.find(c => c.id === update.id);
                if (chunk) {
                    const currentCategory = chunk.category || 'NULL';
                    const categoryChange = currentCategory !== update.newCategory ? ` → ${update.newCategory}` : '';
                    const verifiedChange = update.needsLastVerified ? ' [设置lastVerifiedAt]' : '';
                    console.log(`${index + 1}. ${chunk.chunk_id.substring(0, 50)}`);
                    console.log(`   类型: ${chunk.type} | Category: ${currentCategory}${categoryChange}${verifiedChange}`);
                    console.log(`   文件: ${chunk.filename}`);
                    console.log(`   内容预览: ${chunk.content.substring(0, 100).replace(/\n/g, ' ')}...`);
                    console.log('');
                }
            });
            if (updates.length > 10) {
                console.log(`   ... 还有 ${updates.length - 10} 个chunks需要更新\n`);
            }
        }
        if (!dryRun && updates.length > 0) {
            console.log('⏳ 执行更新...\n');
            let categoryUpdated = 0;
            let verifiedUpdated = 0;
            let errors = 0;
            const batchSize = 50;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                try {
                    await prisma.$transaction(batch
                        .map(update => {
                        const chunk = poiChunks.find(c => c.id === update.id);
                        if (!chunk)
                            return null;
                        const updateData = {};
                        const currentCategory = chunk.category;
                        if (!currentCategory || currentCategory !== update.newCategory) {
                            updateData.category = update.newCategory;
                            categoryUpdated++;
                        }
                        if (update.needsLastVerified) {
                            updateData.lastVerifiedAt = chunk.created_at;
                            verifiedUpdated++;
                        }
                        if (Object.keys(updateData).length > 0) {
                            return prisma.chunk.update({
                                where: { id: update.id },
                                data: updateData,
                            });
                        }
                        return null;
                    })
                        .filter((op) => op !== null));
                    process.stdout.write(`\r   进度: ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
                }
                catch (error) {
                    errors += batch.length;
                    console.error(`\n   ❌ 批次 ${Math.floor(i / batchSize) + 1} 失败: ${error.message}`);
                }
            }
            console.log('\n');
            console.log('✅ 更新完成!');
            console.log(`   Category更新: ${categoryUpdated}`);
            console.log(`   lastVerifiedAt更新: ${verifiedUpdated}`);
            console.log(`   错误: ${errors}`);
            console.log('');
            console.log('📊 更新后验证:');
            const verification = await prisma.$queryRawUnsafe(`
        SELECT c.category, COUNT(*)::int as count
        FROM chunks c
        JOIN knowledge_files kf ON c.file_id = kf.id
        WHERE kf.category = 'pois'
        GROUP BY c.category
        ORDER BY count DESC
      `);
            verification.forEach(v => {
                console.log(`   ${(v.category || 'NULL').padEnd(12)} ${v.count}`);
            });
            const verifiedCount = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM chunks c
        JOIN knowledge_files kf ON c.file_id = kf.id
        WHERE kf.category = 'pois' AND c.last_verified_at IS NOT NULL
      `);
            console.log(`\n   已设置lastVerifiedAt: ${Number(((_a = verifiedCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0)}/${poiChunks.length}`);
        }
        else if (dryRun) {
            console.log('\n💡 这是 DRY RUN 模式，未执行实际更新。');
            console.log('   运行 `npx tsx scripts/fix-poi-documents-quality.ts --execute` 执行实际更新。');
        }
        else {
            console.log('\n✅ 所有chunks都已正确设置，无需更新。');
        }
    }
    catch (error) {
        console.error('❌ 执行失败:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--execute');
    try {
        await fixPOIDocuments(dryRun);
    }
    catch (error) {
        console.error('❌ 执行失败:', error.message);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=fix-poi-documents-quality.js.map