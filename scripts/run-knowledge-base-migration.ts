// scripts/run-knowledge-base-migration.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 开始执行知识库表迁移...\n');

    // 读取 SQL 文件
    const sqlPath = path.join(process.cwd(), 'prisma/migrations/add_knowledge_base_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // 按行分割，过滤注释和空行
    const lines = sql.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('--');
    });

    // 重新组合 SQL 语句（按分号分割）
    let currentStatement = '';
    const statements: string[] = [];

    for (const line of lines) {
      currentStatement += line + '\n';
      if (line.trim().endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }

    console.log(`📝 找到 ${statements.length} 条 SQL 语句\n`);

    // 逐条执行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim().length === 0) continue;

      try {
        console.log(`执行语句 ${i + 1}/${statements.length}...`);
        // 移除末尾的分号（Prisma 会自动添加）
        const cleanStatement = statement.replace(/;$/, '');
        await prisma.$executeRawUnsafe(cleanStatement);
        console.log(`✅ 语句 ${i + 1} 执行成功\n`);
      } catch (error: any) {
        // 如果是"已存在"的错误，继续执行
        const errorMsg = error.message || '';
        if (
          errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('relation already exists')
        ) {
          console.log(`⚠️  语句 ${i + 1} 已存在，跳过\n`);
          continue;
        }
        console.error(`❌ 语句 ${i + 1} 执行失败:`, errorMsg);
        console.error(`SQL 预览: ${statement.substring(0, 150)}...\n`);
        // 不抛出错误，继续执行下一条
      }
    }

    console.log('✅ 迁移完成！\n');

    // 验证表是否存在
    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('knowledge_files', 'chunks', 'keyword_indices', 'query_history')`
    );

    console.log('📊 验证表结构:');
    if (tables.length === 0) {
      console.log('  ⚠️  未找到任何表');
    } else {
      tables.forEach((t) => {
        console.log(`  ✅ ${t.tablename}`);
      });
    }

    if (tables.length < 4) {
      console.log('\n⚠️  警告: 部分表可能未创建成功，请检查错误日志');
    } else {
      console.log('\n🎉 所有表创建成功！');
    }
  } catch (error: any) {
    console.error('❌ 迁移失败:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration()
  .then(() => {
    console.log('\n✅ 迁移脚本执行完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 迁移脚本执行失败:', error);
    process.exit(1);
  });
