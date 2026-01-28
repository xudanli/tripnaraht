#!/usr/bin/env ts-node
/**
 * 运行规划助手反馈表迁移
 * 
 * 用法:
 *   npm run script:run-trip-planner-feedback-migration
 *   或
 *   npx tsx scripts/run-trip-planner-feedback-migration.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 开始执行规划助手反馈表迁移...\n');

    // 读取 SQL 文件
    const sqlPath = path.join(process.cwd(), 'prisma/migrations/add_trip_planner_feedback.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ 错误: 迁移文件不存在: ${sqlPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    console.log(`📝 读取迁移文件: ${sqlPath}\n`);

    // 检查表是否已存在
    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'trip_planner_feedback'
      ) as exists
    `;

    if (tableExists[0]?.exists) {
      console.log('⚠️  表 trip_planner_feedback 已存在，跳过创建');
      console.log('   如需重新创建，请先删除现有表\n');
      return;
    }

    // 执行 SQL（分割多条语句）
    console.log('🔧 执行 SQL 迁移...\n');
    
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

    console.log(`找到 ${statements.length} 条 SQL 语句\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim().length === 0 || statement.trim() === ';') {
        continue;
      }
      
      try {
        const preview = statement.substring(0, 50).replace(/\n/g, ' ');
        console.log(`执行语句 ${i + 1}/${statements.length}: ${preview}...`);
        await prisma.$executeRawUnsafe(statement);
        console.log(`  ✅ 完成\n`);
      } catch (error: any) {
        // 如果是"已存在"错误，跳过
        if (error.message?.includes('already exists') || 
            error.message?.includes('duplicate') ||
            error.message?.includes('relation') && error.message?.includes('does not exist') && statement.includes('COMMENT')) {
          console.log(`  ⚠️  跳过: ${error.message}\n`);
          continue;
        }
        // 如果是表不存在的错误且是 COMMENT 语句，跳过
        if (error.message?.includes('does not exist') && statement.includes('COMMENT')) {
          console.log(`  ⚠️  表不存在，跳过 COMMENT: ${error.message}\n`);
          continue;
        }
        throw error;
      }
    }

    console.log('✅ 迁移执行成功！\n');

    // 验证表结构
    console.log('🔍 验证表结构...\n');
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trip_planner_feedback'
      ORDER BY ordinal_position
    `;

    console.log('表结构:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
    });

    console.log('\n✅ 迁移完成！');

  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration().catch(console.error);
