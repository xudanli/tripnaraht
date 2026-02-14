#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkPOIDocuments() {
    var _a;
    console.log('='.repeat(80));
    console.log('📊 TripNARA 景点（POI）文档数据库检查报告');
    console.log('='.repeat(80));
    console.log('');
    try {
        const poiFiles = await prisma.knowledgeFile.findMany({
            where: {
                category: 'pois',
            },
            include: {
                chunks: {
                    select: {
                        id: true,
                        type: true,
                        category: true,
                        keywords: true,
                        credibilityScore: true,
                        lastVerifiedAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
            orderBy: {
                lastUpdated: 'desc',
            },
        });
        console.log(`✅ 找到 ${poiFiles.length} 个POI文档文件\n`);
        if (poiFiles.length === 0) {
            console.log('⚠️  数据库中没有任何POI文档！');
            console.log('   建议运行索引脚本导入景点文档。\n');
            return;
        }
        const stats = {
            totalFiles: poiFiles.length,
            totalChunks: 0,
            chunksWithEmbedding: 0,
            chunksWithKeywords: 0,
            avgCredibility: 0,
            credibilityDistribution: {},
            dataSourceTypes: {},
            chunkTypes: {},
            chunkCategories: {},
            regions: {},
            freshness: {
                verified: 0,
                unverified: 0,
                stale: 0,
            },
        };
        const now = new Date();
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        poiFiles.forEach((file) => {
            stats.totalChunks += file.chunks.length;
            const credibilityKey = file.credibilityScore >= 1.0 ? '1.0 (官方)'
                : file.credibilityScore >= 0.9 ? '0.9 (权威第三方)'
                    : file.credibilityScore >= 0.8 ? '0.8 (可靠媒体)'
                        : file.credibilityScore >= 0.7 ? '0.7 (专业平台)'
                            : file.credibilityScore >= 0.6 ? '0.6 (用户生成)'
                                : '<0.6 (低可信度)';
            stats.credibilityDistribution[credibilityKey] =
                (stats.credibilityDistribution[credibilityKey] || 0) + 1;
            file.dataSources.forEach((source) => {
                const sourceType = source.includes('official') || source.includes('官网') ? '官方来源'
                    : source.includes('lonely') || source.includes('national') ? '权威第三方'
                        : source.includes('booking') || source.includes('getyourguide') ? '专业平台'
                            : source.includes('tripadvisor') || source.includes('google') ? '用户生成'
                                : '其他';
                stats.dataSourceTypes[sourceType] =
                    (stats.dataSourceTypes[sourceType] || 0) + 1;
            });
            file.chunks.forEach((chunk) => {
                if (chunk.keywords && chunk.keywords.length > 0) {
                    stats.chunksWithKeywords++;
                }
                stats.chunkTypes[chunk.type] =
                    (stats.chunkTypes[chunk.type] || 0) + 1;
                if (chunk.category) {
                    stats.chunkCategories[chunk.category] =
                        (stats.chunkCategories[chunk.category] || 0) + 1;
                }
                if (chunk.lastVerifiedAt) {
                    stats.freshness.verified++;
                    if (chunk.lastVerifiedAt < threeMonthsAgo) {
                        stats.freshness.stale++;
                    }
                }
                else {
                    stats.freshness.unverified++;
                }
            });
            const region = extractRegion(file.filepath, file.filename);
            if (!stats.regions[region]) {
                stats.regions[region] = {
                    files: 0,
                    chunks: 0,
                    avgCredibility: 0,
                };
            }
            stats.regions[region].files++;
            stats.regions[region].chunks += file.chunks.length;
            stats.regions[region].avgCredibility += file.credibilityScore;
        });
        const chunksWithEmbeddingResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM chunks 
       WHERE file_id IN (
         SELECT id FROM knowledge_files WHERE category = 'pois'
       ) AND embedding IS NOT NULL`);
        stats.chunksWithEmbedding = Number(((_a = chunksWithEmbeddingResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        const totalCredibility = poiFiles.reduce((sum, f) => sum + f.credibilityScore, 0);
        stats.avgCredibility = totalCredibility / poiFiles.length;
        Object.keys(stats.regions).forEach((region) => {
            const regionFiles = poiFiles.filter((f) => extractRegion(f.filepath, f.filename) === region);
            const regionCredibility = regionFiles.reduce((sum, f) => sum + f.credibilityScore, 0);
            stats.regions[region].avgCredibility = regionCredibility / regionFiles.length;
        });
        console.log('='.repeat(80));
        console.log('📈 总体统计');
        console.log('='.repeat(80));
        console.log(`文档文件数: ${stats.totalFiles}`);
        console.log(`文档分块数: ${stats.totalChunks}`);
        console.log(`平均每个文档分块数: ${(stats.totalChunks / stats.totalFiles).toFixed(1)}`);
        console.log(`有向量的分块: ${stats.chunksWithEmbedding} (${((stats.chunksWithEmbedding / stats.totalChunks) * 100).toFixed(1)}%)`);
        console.log(`有关键词的分块: ${stats.chunksWithKeywords} (${((stats.chunksWithKeywords / stats.totalChunks) * 100).toFixed(1)}%)`);
        console.log(`平均可信度: ${stats.avgCredibility.toFixed(2)}`);
        console.log('');
        console.log('='.repeat(80));
        console.log('📊 可信度分布');
        console.log('='.repeat(80));
        Object.entries(stats.credibilityDistribution)
            .sort((a, b) => {
            const order = ['1.0 (官方)', '0.9 (权威第三方)', '0.8 (可靠媒体)', '0.7 (专业平台)', '0.6 (用户生成)', '<0.6 (低可信度)'];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
        })
            .forEach(([key, count]) => {
            const percentage = ((count / stats.totalFiles) * 100).toFixed(1);
            console.log(`  ${key}: ${count} 个文档 (${percentage}%)`);
        });
        console.log('');
        console.log('='.repeat(80));
        console.log('📚 数据源类型分布');
        console.log('='.repeat(80));
        const totalSources = Object.values(stats.dataSourceTypes).reduce((sum, count) => sum + count, 0);
        Object.entries(stats.dataSourceTypes)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
            const percentage = totalSources > 0 ? ((count / totalSources) * 100).toFixed(1) : '0';
            console.log(`  ${type}: ${count} 次引用 (${percentage}%)`);
        });
        console.log('');
        console.log('='.repeat(80));
        console.log('📦 Chunk类型分布');
        console.log('='.repeat(80));
        Object.entries(stats.chunkTypes)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
            const percentage = ((count / stats.totalChunks) * 100).toFixed(1);
            console.log(`  ${type}: ${count} 个 (${percentage}%)`);
        });
        console.log('');
        console.log('='.repeat(80));
        console.log('🔄 Chunk分类分布（数据新鲜度类别）');
        console.log('='.repeat(80));
        Object.entries(stats.chunkCategories)
            .sort((a, b) => b[1] - a[1])
            .forEach(([category, count]) => {
            const percentage = ((count / stats.totalChunks) * 100).toFixed(1);
            const updateFreq = category === 'POI_HOURS' ? '（月度更新）'
                : category === 'POI_INFO' ? '（季度更新）'
                    : category === 'GATE' ? '（按需更新）'
                        : category === 'GENERAL' ? '（按需更新）'
                            : '';
            console.log(`  ${category}: ${count} 个 (${percentage}%) ${updateFreq}`);
        });
        console.log('');
        console.log('='.repeat(80));
        console.log('🌍 按地区分布');
        console.log('='.repeat(80));
        Object.entries(stats.regions)
            .sort((a, b) => b[1].files - a[1].files)
            .forEach(([region, data]) => {
            console.log(`  ${region}:`);
            console.log(`    文档数: ${data.files}`);
            console.log(`    分块数: ${data.chunks}`);
            console.log(`    平均可信度: ${data.avgCredibility.toFixed(2)}`);
            console.log('');
        });
        console.log('='.repeat(80));
        console.log('⏰ 数据新鲜度');
        console.log('='.repeat(80));
        console.log(`已验证的分块: ${stats.freshness.verified} (${((stats.freshness.verified / stats.totalChunks) * 100).toFixed(1)}%)`);
        console.log(`未验证的分块: ${stats.freshness.unverified} (${((stats.freshness.unverified / stats.totalChunks) * 100).toFixed(1)}%)`);
        console.log(`过期分块（>3个月未验证）: ${stats.freshness.stale} (${((stats.freshness.stale / stats.totalChunks) * 100).toFixed(1)}%)`);
        console.log('');
        console.log('='.repeat(80));
        console.log('✅ 质量评估');
        console.log('='.repeat(80));
        const embeddingRate = (stats.chunksWithEmbedding / stats.totalChunks) * 100;
        const keywordsRate = (stats.chunksWithKeywords / stats.totalChunks) * 100;
        const verifiedRate = (stats.freshness.verified / stats.totalChunks) * 100;
        const highCredibilityRate = (stats.credibilityDistribution['1.0 (官方)'] || 0) +
            (stats.credibilityDistribution['0.9 (权威第三方)'] || 0);
        const highCredibilityPercentage = (highCredibilityRate / stats.totalFiles) * 100;
        console.log(`向量覆盖率: ${embeddingRate.toFixed(1)}% ${embeddingRate >= 100 ? '✅' : '⚠️'}`);
        console.log(`关键词覆盖率: ${keywordsRate.toFixed(1)}% ${keywordsRate >= 80 ? '✅' : '⚠️'}`);
        console.log(`验证覆盖率: ${verifiedRate.toFixed(1)}% ${verifiedRate >= 50 ? '✅' : '⚠️'}`);
        console.log(`高可信度文档比例: ${highCredibilityPercentage.toFixed(1)}% ${highCredibilityPercentage >= 50 ? '✅' : '⚠️'}`);
        console.log(`平均可信度: ${stats.avgCredibility.toFixed(2)} ${stats.avgCredibility >= 0.7 ? '✅' : '⚠️'}`);
        console.log('');
        console.log('='.repeat(80));
        console.log('📄 示例文档详情（最新5个）');
        console.log('='.repeat(80));
        poiFiles.slice(0, 5).forEach((file, index) => {
            console.log(`\n${index + 1}. ${file.filename}`);
            console.log(`   路径: ${file.filepath}`);
            console.log(`   可信度: ${file.credibilityScore.toFixed(2)}`);
            console.log(`   数据源: ${file.dataSources.length > 0 ? file.dataSources.join(', ') : '未记录'}`);
            console.log(`   分块数: ${file.chunks.length}`);
            console.log(`   最后更新: ${file.lastUpdated.toISOString().split('T')[0]}`);
            const chunkTypeCounts = {};
            file.chunks.forEach((chunk) => {
                chunkTypeCounts[chunk.type] = (chunkTypeCounts[chunk.type] || 0) + 1;
            });
            const typeSummary = Object.entries(chunkTypeCounts)
                .map(([type, count]) => `${type}:${count}`)
                .join(', ');
            console.log(`   Chunk类型: ${typeSummary}`);
        });
        console.log('');
        console.log('='.repeat(80));
        console.log('💡 改进建议');
        console.log('='.repeat(80));
        const suggestions = [];
        if (embeddingRate < 100) {
            suggestions.push(`⚠️  有 ${stats.totalChunks - stats.chunksWithEmbedding} 个分块缺少向量，需要重新索引`);
        }
        if (keywordsRate < 80) {
            suggestions.push(`⚠️  有 ${stats.totalChunks - stats.chunksWithKeywords} 个分块缺少关键词，影响检索效果`);
        }
        if (verifiedRate < 50) {
            suggestions.push(`⚠️  有 ${stats.freshness.unverified} 个分块未验证，建议运行数据新鲜度检查`);
        }
        if (stats.freshness.stale > 0) {
            suggestions.push(`⚠️  有 ${stats.freshness.stale} 个分块超过3个月未验证，需要更新`);
        }
        if (highCredibilityPercentage < 50) {
            suggestions.push(`⚠️  高可信度文档比例较低，建议优先使用官方和权威来源`);
        }
        if (stats.avgCredibility < 0.7) {
            suggestions.push(`⚠️  平均可信度低于0.7，建议提升数据源质量`);
        }
        if (suggestions.length === 0) {
            console.log('✅ 文档质量良好，无需特别改进！');
        }
        else {
            suggestions.forEach((suggestion, index) => {
                console.log(`${index + 1}. ${suggestion}`);
            });
        }
        console.log('');
        console.log('='.repeat(80));
        console.log('✅ 检查完成');
        console.log('='.repeat(80));
    }
    catch (error) {
        console.error('❌ 检查失败:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
function extractRegion(filepath, filename) {
    const pathLower = filepath.toLowerCase();
    const nameLower = filename.toLowerCase();
    if (pathLower.includes('iceland') || nameLower.includes('iceland'))
        return '冰岛 (Iceland)';
    if (pathLower.includes('svalbard') || nameLower.includes('svalbard'))
        return '斯瓦尔巴 (Svalbard)';
    if (pathLower.includes('greenland') || nameLower.includes('greenland'))
        return '格陵兰 (Greenland)';
    if (pathLower.includes('faroe') || nameLower.includes('faroe'))
        return '法罗群岛 (Faroe Islands)';
    if (pathLower.includes('alps') || nameLower.includes('alps'))
        return '阿尔卑斯 (Alps)';
    if (pathLower.includes('lofoten') || nameLower.includes('lofoten'))
        return '罗弗敦 (Lofoten)';
    if (pathLower.includes('new-zealand') || nameLower.includes('new-zealand'))
        return '新西兰 (New Zealand)';
    if (pathLower.includes('argentina') || nameLower.includes('argentina'))
        return '阿根廷 (Argentina)';
    const countryCodeMatch = filepath.match(/\/([A-Z]{2})\//);
    if (countryCodeMatch) {
        const codes = {
            'IS': '冰岛',
            'NO': '挪威',
            'GL': '格陵兰',
            'FO': '法罗群岛',
            'NZ': '新西兰',
            'AR': '阿根廷',
        };
        return codes[countryCodeMatch[1]] || countryCodeMatch[1];
    }
    return '其他/未知';
}
checkPOIDocuments()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=check-poi-documents.js.map