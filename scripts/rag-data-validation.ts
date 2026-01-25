#!/usr/bin/env tsx
/**
 * RAG数据质量验证脚本
 * 首席AI科学家视角：全面评估冰岛RAG工程化数据质量
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const API_BASE_URL = 'http://localhost:3000';
const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  proxy: false,
});

interface ValidationReport {
  dataQuality: {
    totalChunks: number;
    chunksWithEmbedding: number;
    embeddingCoverage: number;
    avgChunkLength: number;
    avgKeywords: number;
  };
  embeddingQuality: {
    dimension: number;
    expectedDimension: number;
    dimensionMatch: boolean;
    nullEmbeddings: number;
  };
  contentQuality: {
    icelandRelatedChunks: number;
    keywordCoverage: {
      '冰岛': number;
      '环岛': number;
      '路线': number;
      '租车': number;
      'F路': number;
    };
  };
  retrievalPerformance: {
    denseSearch: {
      testQueries: Array<{
        query: string;
        results: number;
        maxSimilarity: number;
      }>;
    };
    hybridSearch: {
      testQueries: Array<{
        query: string;
        results: number;
        maxScore: number;
      }>;
    };
  };
  recommendations: string[];
}

async function validateRAGData(): Promise<ValidationReport> {
  console.log('🔬 RAG数据质量验证报告');
  console.log('='.repeat(80));
  console.log('角色: 首席AI科学家');
  console.log('目标: 全面评估冰岛RAG工程化数据质量\n');

  const report: ValidationReport = {
    dataQuality: {
      totalChunks: 0,
      chunksWithEmbedding: 0,
      embeddingCoverage: 0,
      avgChunkLength: 0,
      avgKeywords: 0,
    },
    embeddingQuality: {
      dimension: 0,
      expectedDimension: 1536,
      dimensionMatch: false,
      nullEmbeddings: 0,
    },
    contentQuality: {
      icelandRelatedChunks: 0,
      keywordCoverage: {
        '冰岛': 0,
        '环岛': 0,
        '路线': 0,
        '租车': 0,
        'F路': 0,
      },
    },
    retrievalPerformance: {
      denseSearch: { testQueries: [] },
      hybridSearch: { testQueries: [] },
    },
    recommendations: [],
  };

  // 1. 数据质量检查
  console.log('1️⃣ 数据质量检查');
  console.log('-'.repeat(80));

  const stats = await prisma.$queryRawUnsafe<Array<{
    total: bigint;
    with_embedding: bigint;
    avg_length: number;
    avg_keywords: number;
  }>>(
    `SELECT 
      COUNT(*)::bigint as total,
      COUNT(embedding)::bigint as with_embedding,
      AVG(LENGTH(content))::numeric as avg_length,
      AVG(array_length(keywords, 1))::numeric as avg_keywords
    FROM chunks`
  );

  const s = stats[0];
  report.dataQuality.totalChunks = Number(s.total);
  report.dataQuality.chunksWithEmbedding = Number(s.with_embedding);
  report.dataQuality.embeddingCoverage = (Number(s.with_embedding) / Number(s.total)) * 100;
  report.dataQuality.avgChunkLength = parseFloat(String(s.avg_length)) || 0;
  report.dataQuality.avgKeywords = parseFloat(String(s.avg_keywords)) || 0;

  console.log(`   总Chunk数: ${report.dataQuality.totalChunks}`);
  console.log(`   有Embedding: ${report.dataQuality.chunksWithEmbedding}`);
  console.log(`   Embedding覆盖率: ${report.dataQuality.embeddingCoverage.toFixed(1)}%`);
  console.log(`   平均Chunk长度: ${report.dataQuality.avgChunkLength.toFixed(0)} 字符`);
  console.log(`   平均关键词数: ${report.dataQuality.avgKeywords.toFixed(1)}`);

  if (report.dataQuality.embeddingCoverage < 100) {
    report.recommendations.push('⚠️ 部分chunks缺少embedding，需要重新生成');
  }

  // 2. Embedding质量检查
  console.log('\n2️⃣ Embedding质量检查');
  console.log('-'.repeat(80));

  // 使用pgvector的内置函数检查维度
  const embeddingCheck = await prisma.$queryRawUnsafe<Array<{
    dimension: number;
    null_count: bigint;
  }>>(
    `SELECT 
      (SELECT array_length(string_to_array(embedding::text, ','), 1) - 1 
       FROM chunks 
       WHERE embedding IS NOT NULL 
       LIMIT 1) as dimension,
      COUNT(*) FILTER (WHERE embedding IS NULL)::bigint as null_count
    FROM chunks`
  );

  // 简化检查：直接查询一个样本
  const sampleEmbedding = await prisma.$queryRawUnsafe<Array<{
    embedding_text: string;
  }>>(
    `SELECT embedding::text as embedding_text
     FROM chunks 
     WHERE embedding IS NOT NULL 
     LIMIT 1`
  );

  if (sampleEmbedding.length > 0) {
    // 从文本表示中提取维度（格式: [0.1,0.2,...]）
    const embeddingStr = sampleEmbedding[0].embedding_text;
    const dimension = embeddingStr ? embeddingStr.split(',').length : 0;
    report.embeddingQuality.dimension = dimension;
    report.embeddingQuality.dimensionMatch = dimension === report.embeddingQuality.expectedDimension;
  }

  const nullCount = await prisma.$queryRawUnsafe<Array<{
    null_count: bigint;
  }>>(
    `SELECT COUNT(*) FILTER (WHERE embedding IS NULL)::bigint as null_count
     FROM chunks`
  );
  report.embeddingQuality.nullEmbeddings = Number(nullCount[0]?.null_count || 0);

  console.log(`   Embedding维度: ${report.embeddingQuality.dimension}`);
  console.log(`   期望维度: ${report.embeddingQuality.expectedDimension}`);
  console.log(`   维度匹配: ${report.embeddingQuality.dimensionMatch ? '✅' : '❌'}`);
  console.log(`   NULL Embedding数: ${report.embeddingQuality.nullEmbeddings}`);

  if (!report.embeddingQuality.dimensionMatch) {
    report.recommendations.push('❌ Embedding维度不匹配，可能导致检索失败');
  }

  // 3. 内容质量检查
  console.log('\n3️⃣ 内容质量检查');
  console.log('-'.repeat(80));

  const keywordChecks = await Promise.all([
    prisma.chunk.count({ where: { content: { contains: '冰岛', mode: 'insensitive' } } }),
    prisma.chunk.count({ where: { content: { contains: '环岛', mode: 'insensitive' } } }),
    prisma.chunk.count({ where: { content: { contains: '路线', mode: 'insensitive' } } }),
    prisma.chunk.count({ where: { content: { contains: '租车', mode: 'insensitive' } } }),
    prisma.chunk.count({ where: { content: { contains: 'F路', mode: 'insensitive' } } }),
  ]);

  report.contentQuality.keywordCoverage['冰岛'] = keywordChecks[0];
  report.contentQuality.keywordCoverage['环岛'] = keywordChecks[1];
  report.contentQuality.keywordCoverage['路线'] = keywordChecks[2];
  report.contentQuality.keywordCoverage['租车'] = keywordChecks[3];
  report.contentQuality.keywordCoverage['F路'] = keywordChecks[4];
  report.contentQuality.icelandRelatedChunks = keywordChecks[0];

  console.log(`   包含"冰岛": ${report.contentQuality.keywordCoverage['冰岛']} chunks`);
  console.log(`   包含"环岛": ${report.contentQuality.keywordCoverage['环岛']} chunks`);
  console.log(`   包含"路线": ${report.contentQuality.keywordCoverage['路线']} chunks`);
  console.log(`   包含"租车": ${report.contentQuality.keywordCoverage['租车']} chunks`);
  console.log(`   包含"F路": ${report.contentQuality.keywordCoverage['F路']} chunks`);

  if (report.contentQuality.icelandRelatedChunks === 0) {
    report.recommendations.push('⚠️ 未找到包含"冰岛"的chunks，数据可能不完整');
  }

  // 4. 检索性能测试
  console.log('\n4️⃣ 检索性能测试');
  console.log('-'.repeat(80));

  const testQueries = [
    '冰岛环岛路线推荐',
    '冰岛F路开放时间',
    '冰岛租车保险',
    '冰岛天气',
    '西峡湾景点',
  ];

  for (const query of testQueries) {
    // Dense Search
    try {
      const denseResponse = await client.post('/api/rag/chunks/retrieve', {
        query,
        limit: 10,
        useHybridSearch: false,
        credibilityMin: 0.0,
      });

      const denseResults = denseResponse.data.data || [];
      const maxSim = denseResults.length > 0 
        ? Math.max(...denseResults.map((r: any) => r.similarity || 0))
        : 0;

      report.retrievalPerformance.denseSearch.testQueries.push({
        query,
        results: denseResults.length,
        maxSimilarity: maxSim,
      });

      console.log(`   Dense: "${query}" -> ${denseResults.length} 结果, 最高相似度: ${maxSim.toFixed(4)}`);
    } catch (error: any) {
      console.log(`   Dense: "${query}" -> 错误: ${error.message}`);
    }

    // Hybrid Search
    try {
      const hybridResponse = await client.post('/api/rag/chunks/retrieve', {
        query,
        limit: 10,
        useHybridSearch: true,
        credibilityMin: 0.0,
      });

      const hybridResults = hybridResponse.data.data || [];
      const maxScore = hybridResults.length > 0
        ? Math.max(...hybridResults.map((r: any) => r.hybridScore || r.similarity || 0))
        : 0;

      report.retrievalPerformance.hybridSearch.testQueries.push({
        query,
        results: hybridResults.length,
        maxScore,
      });

      console.log(`   Hybrid: "${query}" -> ${hybridResults.length} 结果, 最高分数: ${maxScore.toFixed(4)}`);
    } catch (error: any) {
      console.log(`   Hybrid: "${query}" -> 错误: ${error.message}`);
    }
  }

  // 5. 相似度分数分布分析
  console.log('\n5️⃣ 相似度分数分布分析');
  console.log('-'.repeat(80));

  // 使用一个包含"冰岛"的chunk作为查询向量
  const icelandChunk = await prisma.$queryRawUnsafe<Array<{
    chunk_id: string;
    embedding: string;
  }>>(
    `SELECT chunk_id, embedding::text as embedding
     FROM chunks 
     WHERE content ILIKE '%冰岛%' AND embedding IS NOT NULL 
     LIMIT 1`
  );

  if (icelandChunk.length > 0) {
    const similarityDist = await prisma.$queryRawUnsafe<Array<{
      similarity: number;
      count: bigint;
    }>>(
      `SELECT 
        CASE 
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.8 THEN '0.8-1.0'
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.6 THEN '0.6-0.8'
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.4 THEN '0.4-0.6'
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.2 THEN '0.2-0.4'
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.1 THEN '0.1-0.2'
          WHEN 1 - (c2.embedding <=> c1.embedding) >= 0.01 THEN '0.01-0.1'
          ELSE '<0.01'
        END as similarity,
        COUNT(*)::bigint as count
      FROM chunks c1
      CROSS JOIN chunks c2
      WHERE c1.chunk_id = $1
        AND c2.embedding IS NOT NULL
        AND c2.chunk_id != c1.chunk_id
      GROUP BY similarity
      ORDER BY similarity DESC`,
      icelandChunk[0].chunk_id
    );

    console.log('   相似度分数分布:');
    similarityDist.forEach((dist: any) => {
      console.log(`     ${dist.similarity}: ${Number(dist.count)} chunks`);
    });

    // 检查有多少chunks会被当前阈值(0.01)过滤
    const belowThreshold = similarityDist
      .filter((d: any) => d.similarity === '<0.01')
      .reduce((sum: number, d: any) => sum + Number(d.count), 0);
    
    if (belowThreshold > 0) {
      report.recommendations.push(`⚠️ 有${belowThreshold}个chunks相似度<0.01，可能被过滤`);
    }
  }

  // 6. 生成建议
  console.log('\n' + '='.repeat(80));
  console.log('📊 验证总结');
  console.log('='.repeat(80));

  const allDenseResults = report.retrievalPerformance.denseSearch.testQueries.reduce((sum, q) => sum + q.results, 0);
  const allHybridResults = report.retrievalPerformance.hybridSearch.testQueries.reduce((sum, q) => sum + q.results, 0);

  console.log(`\n✅ 数据质量: ${report.dataQuality.embeddingCoverage === 100 ? '优秀' : '需改进'}`);
  console.log(`✅ Embedding质量: ${report.embeddingQuality.dimensionMatch ? '正常' : '异常'}`);
  console.log(`✅ 内容覆盖: ${report.contentQuality.icelandRelatedChunks > 0 ? '良好' : '不足'}`);
  console.log(`✅ Dense检索: ${allDenseResults > 0 ? `${allDenseResults}个结果` : '0个结果'}`);
  console.log(`✅ Hybrid检索: ${allHybridResults > 0 ? `${allHybridResults}个结果` : '0个结果'}`);

  if (allDenseResults === 0 && allHybridResults === 0) {
    report.recommendations.push('❌ **关键问题**: 所有检索返回0个结果，需要立即检查');
    report.recommendations.push('   1. 检查相似度阈值是否过高');
    report.recommendations.push('   2. 验证embedding生成是否正确');
    report.recommendations.push('   3. 检查服务是否已重启（代码修改需重启生效）');
  }

  if (allHybridResults > allDenseResults) {
    report.recommendations.push('💡 Hybrid Search效果更好，建议默认启用');
  }

  console.log('\n💡 优化建议:');
  report.recommendations.forEach((rec, i) => {
    console.log(`   ${i + 1}. ${rec}`);
  });

  return report;
}

validateRAGData()
  .then(() => {
    console.log('\n✅ 验证完成');
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
