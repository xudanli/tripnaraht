// scripts/run-decision-draft-migration.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 开始执行 Decision Draft 表迁移...\n');

    // 读取 SQL 文件
    const sqlPath = path.join(process.cwd(), 'prisma/migrations/add_decision_draft_tables.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ 错误: 迁移文件不存在: ${sqlPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    console.log(`📝 读取迁移文件: ${sqlPath}\n`);

    // 更好的 SQL 语句分割：处理多行语句和函数定义
    const statements: string[] = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarTag = '';
    
    const lines = sql.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过注释和空行
      if (trimmed.startsWith('--') || trimmed.length === 0) {
        continue;
      }
      
      currentStatement += line + '\n';
      
      // 检测美元引号开始
      if (!inDollarQuote && trimmed.includes('$$')) {
        const match = trimmed.match(/\$(\w*)\$/);
        if (match) {
          inDollarQuote = true;
          dollarTag = match[1];
        }
      }
      
      // 检测美元引号结束
      if (inDollarQuote && trimmed.includes(`$$${dollarTag}$$`)) {
        inDollarQuote = false;
        dollarTag = '';
      }
      
      // 如果不在美元引号内，且行以分号结尾，则完成一条语句
      if (!inDollarQuote && trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        currentStatement = '';
      }
    }
    
    // 添加最后一条语句（如果没有分号结尾）
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
        // 对于函数定义等复杂语句，使用 $executeRaw
        // 移除末尾的分号（如果存在）
        const cleanStatement = statement.replace(/;$/, '');
        
        // 检查是否是函数定义（包含 $$ 美元引号）
        if (cleanStatement.includes('$$')) {
          // 使用 $queryRawUnsafe 执行函数定义
          await prisma.$queryRawUnsafe(cleanStatement);
        } else {
          await prisma.$executeRawUnsafe(cleanStatement);
        }
        console.log(`✅ 语句 ${i + 1} 执行成功\n`);
      } catch (error: any) {
        // 如果是"已存在"的错误，继续执行
        const errorMsg = error.message || '';
        if (
          errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('relation already exists') ||
          errorMsg.includes('already defined')
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
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('decision_drafts', 'decision_steps', 'decision_draft_versions')`
    );

    console.log('📊 验证表结构:');
    if (tables.length === 0) {
      console.log('  ⚠️  未找到任何表');
    } else {
      tables.forEach((t) => {
        console.log(`  ✅ ${t.tablename}`);
      });
    }

    if (tables.length < 3) {
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

// 执行迁移
runMigration()
  .then(() => {
    console.log('\n✅ 迁移脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 迁移脚本执行失败:', error);
    process.exit(1);
  });
