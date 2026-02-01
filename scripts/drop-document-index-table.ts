#!/usr/bin/env tsx
/**
 * 删除document_index表
 * 
 * 注意：
 * - document_index表已废弃，数据已清空
 * - 删除表前需要先处理代码引用（RagService、RagController等）
 * - 此操作不可逆，请确认后再执行
 * 
 * 使用方法:
 *   npx tsx scripts/drop-document-index-table.ts [--confirm]
 */

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm');

const prisma = new PrismaClient();

async function dropDocumentIndexTable() {
  console.log('🗑️  删除document_index表\n');
  console.log('='.repeat(80));

  try {
    // 1. 检查表是否存在
    console.log('📊 步骤1: 检查表状态...\n');
    
    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_index'
      ) as exists
    `;
    
    if (!tableExists[0]?.exists) {
      console.log('✅ document_index表不存在，无需删除');
      return;
    }
    
    console.log('✅ document_index表存在');

    // 2. 检查数据
    const count = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count FROM document_index
    `;
    console.log(`当前记录数: ${count[0].count}`);

    // 3. 检查索引
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'document_index'
    `;
    console.log(`索引数量: ${indexes.length}`);
    if (indexes.length > 0) {
      console.log('  索引列表:');
      indexes.forEach(idx => {
        console.log(`    - ${idx.indexname}`);
      });
    }

    // 4. 检查外键依赖
    const foreignKeys = await prisma.$queryRaw<Array<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>>`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (ccu.table_name = 'document_index' OR tc.table_name = 'document_index')
    `;
    
    if (foreignKeys.length > 0) {
      console.log('\n⚠️  发现外键依赖:');
      foreignKeys.forEach(fk => {
        console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
      console.log('\n❌ 无法删除表，存在外键依赖');
      return;
    } else {
      console.log('\n✅ 无外键依赖');
    }

    // 5. 警告：代码引用
    console.log('\n⚠️  代码引用检查:');
    console.log('  以下代码仍在使用document_index表:');
    console.log('  - src/rag/services/rag.service.ts (RagService)');
    console.log('  - src/rag/rag.controller.ts (RagController API端点)');
    console.log('  - src/rag/services/rag.service.spec.ts (单元测试)');
    console.log('  - prisma/schema.prisma (Prisma模型定义)');
    console.log('\n💡 建议:');
    console.log('  1. 删除或注释掉RagService相关代码');
    console.log('  2. 删除或注释掉RagController中的相关API端点');
    console.log('  3. 从Prisma schema中删除DocumentIndex模型');
    console.log('  4. 更新相关测试');
    console.log('  5. 然后执行此脚本删除表');

    // 6. 确认删除
    if (!isConfirmed) {
      console.log('\n⚠️  警告: 此操作将删除document_index表，不可逆！');
      console.log('💡 如需执行删除，请添加 --confirm 参数:');
      console.log('   npx tsx scripts/drop-document-index-table.ts --confirm');
      return;
    }

    console.log('\n📊 步骤2: 删除表...\n');
    
    // 删除表（CASCADE会自动删除依赖的索引和约束）
    await prisma.$executeRaw`DROP TABLE IF EXISTS document_index CASCADE`;
    console.log('✅ document_index表已删除');

    // 7. 验证删除结果
    console.log('\n📊 步骤3: 验证删除结果...\n');
    const stillExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_index'
      ) as exists
    `;
    
    if (!stillExists[0]?.exists) {
      console.log('✅ 删除成功！document_index表已不存在');
    } else {
      console.log('⚠️  表仍然存在，删除可能失败');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 删除完成！');
    console.log('\n💡 后续步骤:');
    console.log('  1. 从Prisma schema中删除DocumentIndex模型定义');
    console.log('  2. 运行 prisma generate 重新生成Prisma Client');
    console.log('  3. 删除或注释掉RagService相关代码');
    console.log('  4. 删除或注释掉RagController中的相关API端点');
    console.log('  5. 更新相关测试');

  } catch (error) {
    console.error('\n❌ 删除失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

dropDocumentIndexTable().catch(console.error);
