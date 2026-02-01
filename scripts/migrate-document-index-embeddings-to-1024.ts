#!/usr/bin/env tsx
/**
 * 迁移document_index表的embedding从1536维到1024维
 * 
 * 步骤：
 * 1. 检查当前维度
 * 2. 删除旧索引
 * 3. 删除旧列
 * 4. 创建新列（1024维）
 * 5. 重新生成所有embedding（使用BGE-M3）
 * 6. 创建新索引
 * 7. 验证结果
 * 
 * 使用方法:
 *   npx tsx scripts/migrate-document-index-embeddings-to-1024.ts [--dry-run] [--limit=N]
 */

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../src/places/services/embedding.service';
import { PythonAIService } from '../src/llm/services/python-ai.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();

async function migrateDocumentIndexEmbeddings() {
  console.log('🔄 迁移document_index表的embedding从1536维到1024维\n');
  if (isDryRun) {
    console.log('⚠️  DRY RUN 模式：只预览，不实际更新数据库\n');
  }
  if (limit) {
    console.log(`📌 限制迁移数量: ${limit} 条\n`);
  }
  console.log('='.repeat(80));

  try {
    // 1. 检查当前状态
    console.log('📊 步骤1: 检查当前状态...\n');
    
    // document_index表已删除，此脚本已废弃
    console.log('⚠️  document_index表已删除，此脚本已废弃');
    console.log('💡 提示: 请使用KnowledgeFile + Chunks表系统');
    return;
    
    // const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
    //   SELECT COUNT(*) as count FROM document_index
    // `;
    // console.log(`document_index记录数: ${Number(count[0].count)}`);

    const withEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM document_index
      WHERE embedding IS NOT NULL
    `;
    console.log(`有embedding的记录数: ${Number(withEmbedding[0].count)}`);

    // 检查当前维度
    const dimensionCheck = await prisma.$queryRaw<Array<{ dim: number }>>`
      SELECT 
        array_length(string_to_array(regexp_replace(embedding::text, '[\\[\\]]', '', 'g'), ','), 1) as dim
      FROM document_index 
      WHERE embedding IS NOT NULL 
      LIMIT 1
    `;
    
    const currentDimension = dimensionCheck[0]?.dim;
    console.log(`当前embedding维度: ${currentDimension || '无数据'}\n`);

    if (!currentDimension) {
      console.log('⚠️  当前没有embedding数据（可能已被清空）');
      console.log('💡 将检查列定义，如果是1536维将修改为1024维，然后重新生成所有embedding\n');
      
      // 检查列定义
      const columnDef = await prisma.$queryRaw<Array<{ column_type: string }>>`
        SELECT format_type(atttypid, atttypmod) as column_type
        FROM pg_attribute
        WHERE attrelid = 'document_index'::regclass
        AND attname = 'embedding'
      `;
      
      const columnType = columnDef[0]?.column_type || '';
      console.log(`当前embedding列定义: ${columnType}`);
      
      if (columnType.includes('1536')) {
        console.log('⚠️  列定义是1536维，需要修改为1024维\n');
        // 继续执行迁移
      } else if (columnType.includes('1024')) {
        console.log('✅ 列定义已经是1024维，只需重新生成embedding\n');
        // 继续执行迁移
      } else {
        console.log('⚠️  无法确定列定义，将尝试修改为1024维\n');
        // 继续执行迁移
      }
    }

    if (currentDimension === 1024) {
      console.log('✅ 已经是1024维，无需迁移');
      return;
    }

    if (currentDimension && currentDimension !== 1536 && currentDimension !== 1024) {
      console.log(`⚠️  当前维度是${currentDimension}维，不是1536或1024维，请确认是否需要迁移`);
      return;
    }
    
    // 如果列定义是1024维但数据是NULL，也需要重新生成
    if (!currentDimension) {
      // 检查列定义
      const columnDef = await prisma.$queryRaw<Array<{ column_type: string }>>`
        SELECT format_type(atttypid, atttypmod) as column_type
        FROM pg_attribute
        WHERE attrelid = 'document_index'::regclass
        AND attname = 'embedding'
      `;
      const columnType = columnDef[0]?.column_type || '';
      console.log(`当前embedding列定义: ${columnType}`);
      
      if (columnType.includes('1024')) {
        console.log('✅ 列定义已经是1024维，将重新生成所有embedding\n');
        // 继续执行，重新生成embedding
      } else if (columnType.includes('1536')) {
        console.log('⚠️  列定义是1536维，需要修改为1024维\n');
        // 继续执行迁移
      }
    }

    // 2. 初始化EmbeddingService
    console.log('📊 步骤2: 初始化EmbeddingService...\n');
    
    const configService = new ConfigService();
    const prismaService = new PrismaService();
    const pythonAIService = new PythonAIService(configService);
    const embeddingService = new EmbeddingService(configService, undefined, pythonAIService);

    // 验证Python AI服务可用
    const isPythonAIAvailable = pythonAIService.isAvailable();
    console.log(`Python AI服务状态: ${isPythonAIAvailable ? '可用' : '不可用'}`);
    
    if (!isPythonAIAvailable) {
      console.log('⚠️  Python AI服务不可用，尝试测试连接...');
      try {
        // 尝试生成一个测试embedding
        const testEmbedding = await embeddingService.generateEmbedding('test');
        console.log(`✅ 测试成功，可以生成embedding（维度: ${testEmbedding.length}）\n`);
      } catch (error: any) {
        console.error(`❌ 测试失败: ${error.message}`);
        throw new Error(`Python AI服务不可用: ${error.message}`);
      }
    } else {
      console.log('✅ EmbeddingService已初始化（BGE-M3，1024维）\n');
    }

    // 3. 获取所有需要迁移的文档（包括embedding为NULL的记录）
    console.log('📊 步骤3: 获取所有需要迁移的文档...\n');
    
    // 使用原始SQL查询（因为Prisma schema可能没有embedding字段）
    // 获取所有文档（包括embedding为NULL的，需要重新生成）
    const documents = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      content: string;
      collection: string;
    }>>`
      SELECT 
        id,
        title,
        content,
        collection
      FROM document_index
      ORDER BY created_at
    `;

    console.log(`找到 ${documents.length} 个文档（将重新生成embedding）\n`);

    if (documents.length === 0) {
      console.log('⚠️  没有需要迁移的文档');
      return;
    }

    // 4. 删除旧索引
    console.log('📊 步骤4: 删除旧索引...\n');
    try {
      await prisma.$executeRaw`DROP INDEX IF EXISTS document_index_embedding_idx`;
      await prisma.$executeRaw`DROP INDEX IF EXISTS document_index_embedding_hnsw_idx`;
      console.log('✅ 旧索引已删除\n');
    } catch (error: any) {
      console.log(`⚠️  删除索引时出错（可能不存在）: ${error.message}\n`);
    }

    // 5. 检查并修改embedding列为1024维（如果需要）
    console.log('📊 步骤5: 检查并修改embedding列为1024维...\n');
    
    // 检查列定义
    const columnDef = await prisma.$queryRaw<Array<{ column_type: string }>>`
      SELECT format_type(atttypid, atttypmod) as column_type
      FROM pg_attribute
      WHERE attrelid = 'document_index'::regclass
      AND attname = 'embedding'
    `;
    const columnType = columnDef[0]?.column_type || '';
    console.log(`当前embedding列定义: ${columnType}`);
    
    if (columnType.includes('1536')) {
      console.log('⚠️  列定义是1536维，需要修改为1024维\n');
      if (isDryRun) {
        console.log('  [DRY RUN] 将删除旧列并创建新列（1024维）\n');
      } else {
        await prisma.$executeRaw`ALTER TABLE document_index DROP COLUMN IF EXISTS embedding`;
        await prisma.$executeRaw`ALTER TABLE document_index ADD COLUMN embedding vector(1024)`;
        console.log('✅ embedding列已修改为vector(1024)\n');
      }
    } else if (columnType.includes('1024')) {
      console.log('✅ 列定义已经是1024维，无需修改\n');
    } else {
      console.log('⚠️  无法确定列定义，将尝试创建1024维列\n');
      if (!isDryRun) {
        await prisma.$executeRaw`ALTER TABLE document_index DROP COLUMN IF EXISTS embedding`;
        await prisma.$executeRaw`ALTER TABLE document_index ADD COLUMN embedding vector(1024)`;
        console.log('✅ embedding列已创建为vector(1024)\n');
      }
    }

    // 6. 重新生成所有embedding
    console.log('📊 步骤6: 重新生成所有embedding（BGE-M3，1024维）...\n');
    console.log(`将处理 ${documents.length} 个文档\n`);

    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ id: string; title: string; error: string }> = [];

    const documentsToProcess = limit ? documents.slice(0, limit) : documents;
    for (let i = 0; i < documentsToProcess.length; i++) {
      const doc = documentsToProcess[i];
      const progress = `[${i + 1}/${documents.length}]`;
      
      try {
        // 生成embedding文本（title + content）
        const textToEmbed = `${doc.title || ''}\n\n${doc.content}`.trim();
        
        if (!textToEmbed) {
          console.log(`${progress} ⚠️  跳过空文档: ${doc.id}`);
          failCount++;
          continue;
        }

        // 生成embedding
        const embedding = await embeddingService.generateEmbedding(textToEmbed);
        
        // 验证维度
        if (embedding.length !== 1024) {
          throw new Error(`Embedding维度错误: 期望1024维，实际${embedding.length}维`);
        }

        // 转换为PostgreSQL vector格式
        const embeddingStr = `[${embedding.join(',')}]`;

        // 更新数据库
        if (isDryRun) {
          console.log(`  [DRY RUN] 将更新文档 ${doc.id}: ${doc.title?.substring(0, 50)}...`);
        } else {
          await prisma.$executeRaw`
            UPDATE document_index
            SET embedding = ${embeddingStr}::vector
            WHERE id = ${doc.id}
          `;
        }

        successCount++;
        
        if ((i + 1) % 10 === 0 || i === documents.length - 1) {
          console.log(`${progress} ✅ 已处理 ${successCount} 个，失败 ${failCount} 个`);
        }

        // 添加延迟，避免API速率限制
        if (i < documents.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 0.1秒延迟
        }
      } catch (error: any) {
        failCount++;
        errors.push({
          id: doc.id,
          title: doc.title || '无标题',
          error: error.message,
        });
        console.error(`${progress} ❌ 失败: ${doc.title?.substring(0, 50) || doc.id} - ${error.message}`);
      }
    }

    console.log(`\n✅ Embedding生成完成:`);
    console.log(`   成功: ${successCount} 个`);
    console.log(`   失败: ${failCount} 个`);

    if (errors.length > 0) {
      console.log(`\n❌ 失败的文档:`);
      errors.forEach((e, idx) => {
        console.log(`   ${idx + 1}. ${e.title} (${e.id}): ${e.error}`);
      });
    }

    // 7. 创建新索引
    console.log('\n📊 步骤7: 创建新索引（1024维）...\n');
    
    if (isDryRun) {
      console.log('  [DRY RUN] 将创建新索引\n');
    } else {
      try {
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS document_index_embedding_idx 
          ON document_index 
          USING ivfflat (embedding vector_cosine_ops) 
          WITH (lists = 10)
        `;
        console.log('✅ 新索引已创建\n');
      } catch (error: any) {
        console.error(`❌ 创建索引失败: ${error.message}`);
        console.log('💡 提示: 如果数据量少于100条，可能需要手动创建索引\n');
      }
    }

    // 8. 验证结果
    console.log('📊 步骤8: 验证迁移结果...\n');
    
    const finalCheck = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
      SELECT 
        array_length(string_to_array(regexp_replace(embedding::text, '[\\[\\]]', '', 'g'), ','), 1) as dim,
        COUNT(*) as count
      FROM document_index
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;

    console.log('最终维度分布:');
    if (finalCheck.length === 0) {
      console.log('  （无embedding数据）');
    } else {
      finalCheck.forEach(stat => {
        console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
      });
    }

    const finalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM document_index
      WHERE embedding IS NOT NULL
    `;
    console.log(`\n总计: ${Number(finalCount[0].count)} 条记录有embedding`);

    if (finalCheck.length === 1 && finalCheck[0].dim === 1024) {
      console.log('\n✅ 迁移成功！所有embedding都是1024维');
    } else {
      console.log('\n⚠️  迁移完成，但部分数据可能未成功迁移');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 迁移完成！');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateDocumentIndexEmbeddings().catch(console.error);
