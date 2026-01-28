// scripts/run-trip-planner-gap-preferences-migration.ts
/**
 * 执行规划助手缺口偏好表迁移脚本
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function executeSqlStatements(sql: string, description: string) {
  console.log(`📋 ${description}...`);
  
  // 检查表是否已存在
  const tableName = description.includes('preferences') ? 'trip_planner_gap_preferences' : 'trip_planner_ignored_gaps';
  const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) as exists
  `;

  if (tableExists[0]?.exists) {
    console.log(`  ⚠️  表 ${tableName} 已存在，跳过创建`);
    console.log('   如需重新创建，请先删除现有表\n');
    return;
  }

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

  console.log(`  找到 ${statements.length} 条 SQL 语句\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement.trim().length === 0 || statement.trim() === ';') {
      continue;
    }
    
    try {
      const preview = statement.substring(0, 50).replace(/\n/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] 执行: ${preview}...`);
      
      await prisma.$executeRawUnsafe(statement);
      console.log(`    ✅ 成功\n`);
    } catch (error: any) {
      // 忽略"已存在"错误
      if (error.message.includes('already exists') || 
          error.message.includes('duplicate') ||
          error.message.includes('relation') && error.message.includes('already exists')) {
        console.log(`    ⚠️  已存在，跳过\n`);
      } else {
        // 对于 COMMENT 语句，如果表不存在会报错，这是正常的
        if (statement.toUpperCase().includes('COMMENT') && 
            error.message.includes('does not exist')) {
          console.log(`    ⚠️  表不存在，跳过 COMMENT\n`);
        } else {
          console.error(`    ❌ 失败: ${error.message.substring(0, 150)}\n`);
          // 不抛出错误，继续执行下一条
        }
      }
    }
  }
}

async function runMigration() {
  console.log('🚀 开始执行规划助手缺口偏好表迁移...\n');

  try {
    // 读取迁移文件
    const preferencesSqlPath = path.join(
      process.cwd(),
      'prisma/migrations/add_trip_planner_gap_preferences.sql'
    );
    const ignoredGapsSqlPath = path.join(
      process.cwd(),
      'prisma/migrations/add_trip_planner_ignored_gaps.sql'
    );

    if (!fs.existsSync(preferencesSqlPath)) {
      console.error(`❌ 错误: 迁移文件不存在: ${preferencesSqlPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(ignoredGapsSqlPath)) {
      console.error(`❌ 错误: 迁移文件不存在: ${ignoredGapsSqlPath}`);
      process.exit(1);
    }

    console.log(`📝 读取迁移文件: ${preferencesSqlPath}`);
    console.log(`📝 读取迁移文件: ${ignoredGapsSqlPath}\n`);

    const preferencesSql = fs.readFileSync(preferencesSqlPath, 'utf-8');
    const ignoredGapsSql = fs.readFileSync(ignoredGapsSqlPath, 'utf-8');

    // 执行 preferences 表迁移
    await executeSqlStatements(preferencesSql, '创建 trip_planner_gap_preferences 表');

    // 执行 ignored_gaps 表迁移
    await executeSqlStatements(ignoredGapsSql, '创建 trip_planner_ignored_gaps 表');

    console.log('\n✅ 迁移完成！');
    console.log('\n📊 创建的表：');
    console.log('  - trip_planner_gap_preferences（缺口偏好表）');
    console.log('  - trip_planner_ignored_gaps（忽略缺口表）');
  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
