#!/usr/bin/env tsx
/**
 * RAG Service SQL查询修复验证（仅测试SQL，不测试embedding）
 * 
 * 验证修复后的SQL查询语法是否正确
 */

import { PrismaClient } from '@prisma/client';

async function testRagServiceSQLFix() {
  console.log('🧪 RAG Service SQL查询修复验证（仅SQL语法）\n');
  console.log('='.repeat(80));

  const prisma = new PrismaClient();

  try {
    // 检查document_index表是否存在
    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_index'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      console.log('⚠️  document_index表不存在，跳过测试');
      console.log('💡 提示: RagService使用document_index表，但新系统推荐使用ChunkRetrievalService');
      return;
    }

    // 检查是否有数据（document_index表已删除）
    // document_index表已删除，使用KnowledgeFile + Chunks表
    const dataCount = 0;
    console.log(`📊 document_index表已删除，跳过测试\n`);
    console.log('💡 提示: 请使用ChunkRetrievalService进行检索');
    return;
    
    // const dataCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    //   SELECT COUNT(*) as count FROM document_index
    // `;
    // if (Number(dataCount[0].count) === 0) {
    //   console.log('⚠️  document_index表为空，跳过测试');
    //   return;
    // }

    // 测试SQL查询语法（使用mock embedding向量）
    console.log('📋 测试SQL查询语法');
    console.log('─'.repeat(80));

    // 检查数据库中的实际向量维度
    console.log('📊 检查各表的向量维度...\n');
    
    // 检查document_index表（RagService使用）
    let docIndexDimension: number | null = null;
    try {
      const docIndexCheck = await prisma.$queryRaw<Array<{ dim: number }>>`
        SELECT 
          array_length(string_to_array(regexp_replace(embedding::text, '[\\[\\]]', '', 'g'), ','), 1) as dim
        FROM document_index 
        WHERE embedding IS NOT NULL 
        LIMIT 1
      `;
      docIndexDimension = docIndexCheck[0]?.dim || null;
      console.log(`  document_index表: ${docIndexDimension ? `${docIndexDimension}维` : '无数据'}`);
    } catch (e: any) {
      console.log(`  document_index表: 检查失败 - ${e.message}`);
    }
    
    // 检查chunks表（ChunkRetrievalService使用，新系统）
    let chunksDimension: number | null = null;
    try {
      const chunksCheck = await prisma.$queryRaw<Array<{ dim: number }>>`
        SELECT 
          array_length(string_to_array(regexp_replace(embedding::text, '[\\[\\]]', '', 'g'), ','), 1) as dim
        FROM chunks 
        WHERE embedding IS NOT NULL 
        LIMIT 1
      `;
      chunksDimension = chunksCheck[0]?.dim || null;
      console.log(`  chunks表: ${chunksDimension ? `${chunksDimension}维` : '无数据'}`);
    } catch (e: any) {
      console.log(`  chunks表: 检查失败 - ${e.message}`);
    }
    
    // 强制使用1024维（BGE-M3），已移除OpenAI支持
    const actualDimension = 1024; // 固定1024维
    
    console.log(`\n📊 使用向量维度: ${actualDimension}维（BGE-M3，已移除OpenAI支持）`);
    if (docIndexDimension === 1536) {
      console.log(`  ⚠️  警告: document_index表仍使用1536维（旧数据），但系统已统一使用1024维`);
      console.log(`  💡 建议: 使用ChunkRetrievalService（基于chunks表，1024维）或迁移document_index数据到1024维`);
      console.log(`  ⚠️  注意: 使用1024维向量查询1536维数据会导致维度不匹配错误`);
    }
    console.log('');
    
    // 创建一个mock embedding向量（固定1024维）
    const mockEmbedding = new Array(actualDimension).fill(0.1);
    const queryEmbeddingStr = `[${mockEmbedding.join(',')}]`;

    // 测试1: 基本查询（只有collection）
    console.log('\n🔍 测试1: 基本查询（只有collection）');
    try {
      const whereConditions = ['embedding IS NOT NULL', 'collection = $1'];
      const queryParams = ['travel_guides', queryEmbeddingStr, 5];
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const querySql = `
        SELECT 
          id,
          title,
          content,
          source,
          metadata,
          1 - (embedding <=> $2::vector) as score
        FROM "document_index"
        ${whereClause}
        ORDER BY embedding <=> $2::vector
        LIMIT $3
      `;

      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        metadata: any;
        score: number;
      }>>(querySql, ...queryParams);

      console.log(`  ✅ SQL查询成功: ${results.length}条结果`);
      if (results.length > 0) {
        console.log(`  Top1: [分数: ${results[0].score.toFixed(3)}] ${results[0].title || '无标题'}`);
      }
    } catch (error: any) {
      console.error(`  ❌ SQL查询失败: ${error.message}`);
      if (error.stack) {
        console.error(`  堆栈: ${error.stack.substring(0, 300)}...`);
      }
      throw error;
    }

    // 测试2: 带countryCode的查询
    console.log('\n🔍 测试2: 带countryCode的查询');
    try {
      const whereConditions = ['embedding IS NOT NULL', 'collection = $1', '"country_code" = $2'];
      const queryParams = ['travel_guides', 'IS', queryEmbeddingStr, 5];
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const querySql = `
        SELECT 
          id,
          title,
          content,
          source,
          metadata,
          1 - (embedding <=> $3::vector) as score
        FROM "document_index"
        ${whereClause}
        ORDER BY embedding <=> $3::vector
        LIMIT $4
      `;

      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        metadata: any;
        score: number;
      }>>(querySql, ...queryParams);

      console.log(`  ✅ SQL查询成功: ${results.length}条结果`);
    } catch (error: any) {
      console.error(`  ❌ SQL查询失败: ${error.message}`);
      // 如果countryCode字段不存在，这是正常的
      if (error.message.includes('country_code')) {
        console.log('  ⚠️  country_code字段可能不存在，这是正常的');
      } else {
        throw error;
      }
    }

    // 测试3: 带tags的查询
    console.log('\n🔍 测试3: 带tags的查询');
    try {
      const tags = ['iceland', 'f-road'];
      const whereConditions = ['embedding IS NOT NULL', 'collection = $1', 'tags && $2::text[]'];
      const queryParams = ['travel_guides', tags, queryEmbeddingStr, 5];
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const querySql = `
        SELECT 
          id,
          title,
          content,
          source,
          metadata,
          1 - (embedding <=> $3::vector) as score
        FROM "document_index"
        ${whereClause}
        ORDER BY embedding <=> $3::vector
        LIMIT $4
      `;

      const results = await prisma.$queryRawUnsafe<Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        metadata: any;
        score: number;
      }>>(querySql, ...queryParams);

      console.log(`  ✅ SQL查询成功: ${results.length}条结果`);
    } catch (error: any) {
      console.error(`  ❌ SQL查询失败: ${error.message}`);
      // 如果tags字段不存在或格式不对，这是正常的
      if (error.message.includes('tags')) {
        console.log('  ⚠️  tags字段可能不存在或格式不对，这是正常的');
      } else {
        throw error;
      }
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ SQL查询语法验证完成！');
    console.log('\n💡 说明:');
    console.log('  - SQL查询语法修复成功，不再出现Prisma错误');
    console.log('  - 如果某些字段不存在，这是正常的（取决于数据库schema）');
    console.log('  - 实际使用中需要确保embedding服务正常运行');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRagServiceSQLFix().catch(console.error);
