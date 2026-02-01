#!/usr/bin/env tsx
/**
 * RAG数据质量检查脚本
 * 检查索引数据的完整性、一致性和质量指标
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDataQuality() {
  try {
    console.log('🔍 RAG数据质量检查...\n');
    console.log('='.repeat(70));

    // 1. 基本统计
    console.log('\n📊 基本统计');
    console.log('-'.repeat(70));
    
    const totalFiles = await prisma.knowledgeFile.count();
    const totalChunks = await prisma.chunk.count();
    
    // 使用原始SQL查询embedding（因为embedding是Unsupported类型）
    const embeddingStats = await prisma.$queryRawUnsafe<Array<{
      total: bigint;
      with_embedding: bigint;
      without_embedding: bigint;
    }>>(
      `SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM chunks`
    );
    
    const stats = embeddingStats[0];
    const chunksWithEmbedding = Number(stats.with_embedding);
    const chunksWithoutEmbedding = Number(stats.without_embedding);
    
    console.log(`总文件数: ${totalFiles}`);
    console.log(`总分块数: ${totalChunks}`);
    console.log(`有向量的分块: ${chunksWithEmbedding} (${((chunksWithEmbedding / totalChunks) * 100).toFixed(1)}%)`);
    console.log(`无向量的分块: ${chunksWithoutEmbedding} (${((chunksWithoutEmbedding / totalChunks) * 100).toFixed(1)}%)`);

    // 2. 文件完整性检查
    console.log('\n📁 文件完整性检查');
    console.log('-'.repeat(70));
    
    const filesWithoutChunks = await prisma.knowledgeFile.findMany({
      where: {
        chunks: {
          none: {},
        },
      },
      select: {
        filename: true,
        filepath: true,
      },
    });
    
    console.log(`无chunks的文件: ${filesWithoutChunks.length} 个`);
    if (filesWithoutChunks.length > 0) {
      console.log('  文件列表:');
      filesWithoutChunks.slice(0, 10).forEach(f => {
        console.log(`    ❌ ${f.filepath}`);
      });
      if (filesWithoutChunks.length > 10) {
        console.log(`    ... 还有 ${filesWithoutChunks.length - 10} 个文件`);
      }
    } else {
      console.log('  ✅ 所有文件都有chunks');
    }

    // 3. Chunks质量检查
    console.log('\n📦 Chunks质量检查');
    console.log('-'.repeat(70));
    
    // 检查空内容（使用原始SQL）
    const emptyChunksResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE content = '' OR content IS NULL`
    );
    const emptyChunks = Number(emptyChunksResult[0]?.count || 0);
    
    // 检查内容长度
    const shortChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE LENGTH(content) < 50`
    );
    
    // 检查长内容
    const longChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE LENGTH(content) > 50000`
    );
    
    // 平均内容长度
    const avgLength = await prisma.$queryRawUnsafe<Array<{ avg: number }>>(
      `SELECT AVG(LENGTH(content)) as avg FROM chunks`
    );
    
    console.log(`空内容chunks: ${emptyChunks} 个`);
    console.log(`短内容chunks (<50字符): ${Number(shortChunks[0]?.count || 0)} 个`);
    console.log(`超长内容chunks (>50000字符): ${Number(longChunks[0]?.count || 0)} 个`);
    console.log(`平均内容长度: ${Math.round(avgLength[0]?.avg || 0)} 字符`);

    // 4. 关键词检查
    console.log('\n🔑 关键词质量检查');
    console.log('-'.repeat(70));
    
    const chunksWithoutKeywords = await prisma.chunk.count({
      where: {
        keywords: {
          equals: [],
        },
      },
    });
    
    const avgKeywords = await prisma.$queryRawUnsafe<Array<{ avg: number }>>(
      `SELECT AVG(array_length(keywords, 1)) as avg FROM chunks WHERE keywords IS NOT NULL`
    );
    
    console.log(`无关键词chunks: ${chunksWithoutKeywords} 个 (${((chunksWithoutKeywords / totalChunks) * 100).toFixed(1)}%)`);
    console.log(`平均关键词数: ${Math.round(avgKeywords[0]?.avg || 0)} 个`);

    // 5. 可信度评分检查
    console.log('\n⭐ 可信度评分检查');
    console.log('-'.repeat(70));
    
    const credibilityStats = await prisma.$queryRawUnsafe<Array<{
      min: number;
      max: number;
      avg: number;
      count: bigint;
    }>>(
      `SELECT 
        MIN(credibility_score) as min,
        MAX(credibility_score) as max,
        AVG(credibility_score) as avg,
        COUNT(*) as count
      FROM chunks`
    );
    
    const credStats = credibilityStats[0];
    if (credStats) {
      console.log(`最低可信度: ${credStats.min}`);
      console.log(`最高可信度: ${credStats.max}`);
      console.log(`平均可信度: ${credStats.avg ? credStats.avg.toFixed(2) : 'N/A'}`);
    }
    
    // 按可信度范围统计
    const highCredibility = await prisma.chunk.count({
      where: {
        credibilityScore: { gte: 0.9 },
      },
    });
    const mediumCredibility = await prisma.chunk.count({
      where: {
        credibilityScore: { gte: 0.7, lt: 0.9 },
      },
    });
    const lowCredibility = await prisma.chunk.count({
      where: {
        credibilityScore: { lt: 0.7 },
      },
    });
    
    console.log(`高可信度 (>=0.9): ${highCredibility} 个 (${((highCredibility / totalChunks) * 100).toFixed(1)}%)`);
    console.log(`中可信度 (0.7-0.9): ${mediumCredibility} 个 (${((mediumCredibility / totalChunks) * 100).toFixed(1)}%)`);
    console.log(`低可信度 (<0.7): ${lowCredibility} 个 (${((lowCredibility / totalChunks) * 100).toFixed(1)}%)`);

    // 6. 按类别统计
    console.log('\n📂 按类别统计');
    console.log('-'.repeat(70));
    
    const byCategory = await prisma.$queryRawUnsafe<Array<{
      category: string;
      file_count: bigint;
      chunk_count: bigint;
      avg_credibility: number;
    }>>(
      `SELECT 
        kf.category,
        COUNT(DISTINCT kf.id) as file_count,
        COUNT(c.id) as chunk_count,
        AVG(c.credibility_score) as avg_credibility
      FROM knowledge_files kf
      LEFT JOIN chunks c ON kf.id = c.file_id
      GROUP BY kf.category
      ORDER BY chunk_count DESC
      LIMIT 15`
    );
    
    byCategory.forEach(item => {
      console.log(`${item.category}:`);
      console.log(`  文件数: ${Number(item.file_count)}`);
      console.log(`  Chunks数: ${Number(item.chunk_count)}`);
      console.log(`  平均可信度: ${Number(item.avg_credibility).toFixed(2)}`);
      console.log('');
    });

    // 7. 按区域统计
    console.log('\n🌍 按区域统计');
    console.log('-'.repeat(70));
    
    const byRegion = await prisma.$queryRawUnsafe<Array<{
      region: string;
      file_count: bigint;
      chunk_count: bigint;
    }>>(
      `SELECT 
        CASE 
          WHEN kf.filepath LIKE '%iceland%' THEN 'iceland'
          WHEN kf.filepath LIKE '%svalbard%' THEN 'svalbard'
          WHEN kf.filepath LIKE '%greenland%' THEN 'greenland'
          WHEN kf.filepath LIKE '%faroe%' THEN 'faroe-islands'
          WHEN kf.filepath LIKE '%alps%' THEN 'alps'
          WHEN kf.filepath LIKE '%argentina%' THEN 'argentina'
          WHEN kf.filepath LIKE '%mountaineering%' THEN 'mountaineering'
          ELSE 'other'
        END as region,
        COUNT(DISTINCT kf.id) as file_count,
        COUNT(c.id) as chunk_count
      FROM knowledge_files kf
      LEFT JOIN chunks c ON kf.id = c.file_id
      WHERE kf.filepath NOT LIKE '%official-sources%'
      GROUP BY region
      ORDER BY chunk_count DESC`
    );
    
    byRegion.forEach(item => {
      console.log(`${item.region}: ${Number(item.file_count)} 文件, ${Number(item.chunk_count)} chunks`);
    });

    // 8. 数据一致性检查
    console.log('\n🔗 数据一致性检查');
    console.log('-'.repeat(70));
    
    // 检查孤立chunks（file_id不存在）
    const orphanChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count 
       FROM chunks c
       WHERE NOT EXISTS (
         SELECT 1 FROM knowledge_files kf WHERE kf.id = c.file_id
       )`
    );
    
    // 检查重复chunk_id
    const duplicateChunkIds = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) - COUNT(DISTINCT chunk_id) as count FROM chunks`
    );
    
    console.log(`孤立chunks (file_id不存在): ${Number(orphanChunks[0]?.count || 0)} 个`);
    console.log(`重复chunk_id: ${Number(duplicateChunkIds[0]?.count || 0)} 个`);

    // 9. 元数据检查
    console.log('\n📋 元数据检查');
    console.log('-'.repeat(70));
    
    const chunksWithMetadata = await prisma.chunk.count({
      where: {
        metadata: { not: null },
      },
    });
    
    const chunksWithoutType = await prisma.chunk.count({
      where: {
        type: '',
      },
    });
    
    console.log(`有元数据的chunks: ${chunksWithMetadata} 个 (${((chunksWithMetadata / totalChunks) * 100).toFixed(1)}%)`);
    console.log(`无type的chunks: ${chunksWithoutType} 个`);

    // 10. 质量评分
    console.log('\n📈 数据质量评分');
    console.log('-'.repeat(70));
    
    let qualityScore = 100;
    const issues: string[] = [];
    
    if (filesWithoutChunks.length > 0) {
      qualityScore -= 10;
      issues.push(`有 ${filesWithoutChunks.length} 个文件无chunks`);
    }
    
    if (chunksWithoutEmbedding > 0) {
      qualityScore -= 20;
      issues.push(`有 ${chunksWithoutEmbedding} 个chunks无向量`);
    }
    
    if (emptyChunks > 0) {
      qualityScore -= 5;
      issues.push(`有 ${emptyChunks} 个chunks内容为空`);
    }
    
    if (chunksWithoutKeywords > totalChunks * 0.1) {
      qualityScore -= 5;
      issues.push(`超过10%的chunks无关键词`);
    }
    
    if (Number(orphanChunks[0]?.count || 0) > 0) {
      qualityScore -= 10;
      issues.push(`有孤立chunks`);
    }
    
    console.log(`总体质量评分: ${qualityScore}/100`);
    if (issues.length > 0) {
      console.log('\n发现的问题:');
      issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    } else {
      console.log('\n✅ 未发现明显问题');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ 数据质量检查完成！');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ 检查失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkDataQuality().catch(console.error);
