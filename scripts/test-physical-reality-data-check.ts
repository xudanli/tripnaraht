#!/usr/bin/env tsx
/**
 * Physical Reality 数据检查脚本
 * 
 * 检查Physical Reality数据是否正确索引到数据库
 */

import { PrismaClient } from '@prisma/client';

async function checkPhysicalRealityData() {
  console.log('🧪 检查 Physical Reality 数据...\n');

  const prisma = new PrismaClient();

  try {
    // 检查KnowledgeFile
    console.log('📋 检查 KnowledgeFile 记录');
    console.log('─────────────────────────────────────────');
    
    const knowledgeFiles = await prisma.knowledgeFile.findMany({
      where: {
        OR: [
          { category: 'road_status' },
          { category: 'ferry_schedules' },
          { category: 'weather_windows' },
        ],
      },
      include: {
        chunks: {
          select: {
            id: true,
            type: true,
            category: true,
          },
        },
      },
    });

    console.log(`✅ 找到 ${knowledgeFiles.length} 个Physical Reality知识文件\n`);

    knowledgeFiles.forEach((file) => {
      console.log(`📄 ${file.filename}`);
      console.log(`   类别: ${file.category}`);
      console.log(`   路径: ${file.filepath}`);
      console.log(`   Chunks: ${file.chunks.length} 条`);
      console.log('');
    });

    // 检查Chunk统计
    console.log('\n📋 检查 Chunk 统计');
    console.log('─────────────────────────────────────────');
    
    const roadChunks = await prisma.chunk.count({
      where: { type: 'road_status' },
    });
    
    const ferryChunks = await prisma.chunk.count({
      where: { type: 'ferry_schedules' },
    });
    
    const weatherChunks = await prisma.chunk.count({
      where: { type: 'weather_windows' },
    });

    console.log(`✅ Chunk统计:`);
    console.log(`   - 道路状态 (road_status): ${roadChunks} 条`);
    console.log(`   - 渡轮时刻表 (ferry_schedules): ${ferryChunks} 条`);
    console.log(`   - 天气窗口 (weather_windows): ${weatherChunks} 条`);
    console.log(`   - 总计: ${roadChunks + ferryChunks + weatherChunks} 条`);

    // 检查示例数据
    console.log('\n📋 检查示例数据');
    console.log('─────────────────────────────────────────');
    
    const sampleRoad = await prisma.chunk.findFirst({
      where: { type: 'road_status' },
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
    });

    if (sampleRoad) {
      console.log(`✅ 道路状态示例:`);
      console.log(`   Chunk ID: ${sampleRoad.chunkId}`);
      console.log(`   内容预览: ${sampleRoad.content.substring(0, 150)}...`);
      console.log(`   关键词: ${sampleRoad.keywords.slice(0, 5).join(', ')}`);
      if (sampleRoad.metadata) {
        console.log(`   元数据: ${JSON.stringify(sampleRoad.metadata).substring(0, 100)}...`);
      }
    }

    const sampleFerry = await prisma.chunk.findFirst({
      where: { type: 'ferry_schedules' },
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
    });

    if (sampleFerry) {
      console.log(`\n✅ 渡轮时刻表示例:`);
      console.log(`   Chunk ID: ${sampleFerry.chunkId}`);
      console.log(`   内容预览: ${sampleFerry.content.substring(0, 150)}...`);
      console.log(`   关键词: ${sampleFerry.keywords.slice(0, 5).join(', ')}`);
      if (sampleFerry.metadata) {
        console.log(`   元数据: ${JSON.stringify(sampleFerry.metadata).substring(0, 100)}...`);
      }
    }

    const sampleWeather = await prisma.chunk.findFirst({
      where: { type: 'weather_windows' },
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
    });

    if (sampleWeather) {
      console.log(`\n✅ 天气窗口示例:`);
      console.log(`   Chunk ID: ${sampleWeather.chunkId}`);
      console.log(`   内容预览: ${sampleWeather.content.substring(0, 150)}...`);
      console.log(`   关键词: ${sampleWeather.keywords.slice(0, 5).join(', ')}`);
      if (sampleWeather.metadata) {
        console.log(`   元数据: ${JSON.stringify(sampleWeather.metadata).substring(0, 100)}...`);
      }
    }

    // 检查embedding
    console.log('\n📋 检查 Embedding');
    console.log('─────────────────────────────────────────');
    
    const chunksWithEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE type IN ('road_status', 'ferry_schedules', 'weather_windows')
        AND embedding IS NOT NULL
    `;

    const totalChunks = roadChunks + ferryChunks + weatherChunks;
    const embeddingCount = Number(chunksWithEmbedding[0]?.count || 0);

    console.log(`✅ Embedding统计:`);
    console.log(`   - 总Chunks: ${totalChunks}`);
    console.log(`   - 有Embedding: ${embeddingCount}`);
    console.log(`   - 覆盖率: ${totalChunks > 0 ? ((embeddingCount / totalChunks) * 100).toFixed(1) : 0}%`);

    console.log('\n\n✅ 检查完成！');
    
    if (totalChunks === 0) {
      console.log('\n⚠️  警告: 未找到Physical Reality数据，请先运行索引脚本:');
      console.log('   npx tsx scripts/index-physical-reality-data.ts');
    }
  } catch (error) {
    console.error('❌ 检查失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkPhysicalRealityData().catch(console.error);
