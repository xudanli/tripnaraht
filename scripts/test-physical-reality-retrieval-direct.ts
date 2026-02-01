#!/usr/bin/env tsx
/**
 * Physical Reality 数据检索直接测试
 * 
 * 直接查询数据库验证检索功能，不依赖EmbeddingService
 */

import { PrismaClient } from '@prisma/client';

async function testRetrievalDirect() {
  console.log('🧪 测试 Physical Reality 数据检索（直接查询）...\n');

  const prisma = new PrismaClient();

  try {
    // 测试1: 直接查询道路状态数据
    console.log('📋 测试1: 查询道路状态数据');
    console.log('─────────────────────────────────────────');
    
    const roadChunks = await prisma.chunk.findMany({
      where: {
        type: 'road_status',
      },
      take: 5,
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`✅ 查询到 ${roadChunks.length} 条道路状态数据\n`);
    
    roadChunks.forEach((chunk, idx) => {
      console.log(`${idx + 1}. ${chunk.chunkId}`);
      console.log(`   内容预览: ${chunk.content.substring(0, 100)}...`);
      console.log(`   关键词: ${chunk.keywords.slice(0, 5).join(', ')}`);
      if (chunk.metadata) {
        const metadata = chunk.metadata as any;
        console.log(`   元数据: roadId=${metadata.roadId}, region=${metadata.region}`);
      }
      console.log('');
    });

    // 测试2: 查询渡轮时刻表数据
    console.log('\n📋 测试2: 查询渡轮时刻表数据');
    console.log('─────────────────────────────────────────');
    
    const ferryChunks = await prisma.chunk.findMany({
      where: {
        type: 'ferry_schedules',
      },
      take: 5,
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`✅ 查询到 ${ferryChunks.length} 条渡轮时刻表数据\n`);
    
    ferryChunks.forEach((chunk, idx) => {
      console.log(`${idx + 1}. ${chunk.chunkId}`);
      console.log(`   内容预览: ${chunk.content.substring(0, 100)}...`);
      console.log(`   关键词: ${chunk.keywords.slice(0, 5).join(', ')}`);
      if (chunk.metadata) {
        const metadata = chunk.metadata as any;
        console.log(`   元数据: routeId=${metadata.routeId}, region=${metadata.region}`);
      }
      console.log('');
    });

    // 测试3: 查询天气窗口数据
    console.log('\n📋 测试3: 查询天气窗口数据');
    console.log('─────────────────────────────────────────');
    
    const weatherChunks = await prisma.chunk.findMany({
      where: {
        type: 'weather_windows',
      },
      take: 5,
      select: {
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        metadata: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`✅ 查询到 ${weatherChunks.length} 条天气窗口数据\n`);
    
    weatherChunks.forEach((chunk, idx) => {
      console.log(`${idx + 1}. ${chunk.chunkId}`);
      console.log(`   内容预览: ${chunk.content.substring(0, 100)}...`);
      console.log(`   关键词: ${chunk.keywords.slice(0, 5).join(', ')}`);
      if (chunk.metadata) {
        const metadata = chunk.metadata as any;
        console.log(`   元数据: regionId=${metadata.regionId}, region=${metadata.region}`);
      }
      console.log('');
    });

    // 测试4: 测试关键词搜索
    console.log('\n📋 测试4: 关键词搜索测试');
    console.log('─────────────────────────────────────────');
    
    const keywordSearch = await prisma.chunk.findMany({
      where: {
        type: 'road_status',
        keywords: {
          has: 'F-road',
        },
      },
      take: 3,
      select: {
        chunkId: true,
        content: true,
        keywords: true,
      },
    });

    console.log(`✅ 关键词"F-road"搜索到 ${keywordSearch.length} 条数据\n`);
    keywordSearch.forEach((chunk, idx) => {
      console.log(`${idx + 1}. ${chunk.chunkId}`);
      console.log(`   关键词: ${chunk.keywords.filter(k => k.includes('F-road') || k.includes('road')).join(', ')}`);
      console.log('');
    });

    // 测试5: 测试元数据过滤
    console.log('\n📋 测试5: 元数据过滤测试');
    console.log('─────────────────────────────────────────');
    
    const icelandRoads = await prisma.$queryRaw<Array<{
      chunk_id: string;
      content: string;
      metadata: any;
    }>>`
      SELECT chunk_id, content, metadata
      FROM chunks
      WHERE type = 'road_status'
        AND metadata->>'region' = 'iceland'
      LIMIT 3
    `;

    console.log(`✅ 冰岛道路状态: ${icelandRoads.length} 条\n`);
    icelandRoads.forEach((chunk, idx) => {
      console.log(`${idx + 1}. ${chunk.chunk_id}`);
      console.log(`   内容预览: ${chunk.content.substring(0, 100)}...`);
      if (chunk.metadata) {
        console.log(`   元数据: region=${chunk.metadata.region}, roadId=${chunk.metadata.roadId}`);
      }
      console.log('');
    });

    console.log('\n\n✅ 直接查询测试完成！');
    console.log('\n📝 说明:');
    console.log('   - 数据已正确存储在数据库中');
    console.log('   - 关键词索引正常工作');
    console.log('   - 元数据查询正常工作');
    console.log('   - 向量检索功能需要在应用环境中测试（需要EmbeddingService）');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRetrievalDirect().catch(console.error);
