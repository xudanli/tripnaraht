// scripts/run-world-model-moat-migration.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function executeSqlFile(prisma: PrismaClient, sqlPath: string, description: string) {
  console.log(`\n📄 ${description}`);
  console.log(`   文件: ${sqlPath}\n`);

  if (!fs.existsSync(sqlPath)) {
    console.log(`   ⚠️  文件不存在，跳过\n`);
    return;
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // 按行分割，但保留注释用于调试
  const lines = sql.split('\n');
  let currentStatement = '';
  const statements: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过空行和纯注释行
    if (trimmed.length === 0 || (trimmed.startsWith('--') && !trimmed.includes('CREATE'))) {
      continue;
    }

    currentStatement += line + '\n';

    // 如果行以分号结尾，完成一个语句
    if (trimmed.endsWith(';')) {
      const stmt = currentStatement.trim();
      if (stmt.length > 0 && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      currentStatement = '';
    }
  }

  // 添加最后一个语句（如果没有分号结尾）
  if (currentStatement.trim().length > 0) {
    statements.push(currentStatement.trim());
  }

  console.log(`   📝 找到 ${statements.length} 条 SQL 语句\n`);

  // 逐条执行
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement.trim().length === 0) continue;

    try {
      const preview = statement.substring(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ');
      console.log(`   [${i + 1}/${statements.length}] 执行: ${preview}...`);
      
      await prisma.$executeRawUnsafe(statement);
      console.log(`      ✅ 成功\n`);
    } catch (error: any) {
      // 如果是"已存在"的错误，继续执行
      const errorMsg = error.message || '';
      if (
        errorMsg.includes('already exists') ||
        errorMsg.includes('duplicate') ||
        errorMsg.includes('relation already exists') ||
        errorMsg.includes('already defined')
      ) {
        console.log(`      ⚠️  已存在，跳过\n`);
        continue;
      }
      console.error(`      ❌ 执行失败: ${errorMsg}`);
      console.error(`     SQL 预览: ${statement.substring(0, 150)}...\n`);
      // 不抛出错误，继续执行下一条
    }
  }

  console.log(`   ✅ ${description} 完成！\n`);
}

async function runMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 开始执行世界模型护城河扩展表迁移...\n');

    const basePath = path.join(process.cwd(), 'prisma/migrations');

    // 执行第一个迁移文件（基础表）
    await executeSqlFile(
      prisma,
      path.join(basePath, 'add_world_model_moat_tables.sql'),
      '执行基础表迁移（用户反馈、实时状态、预测）'
    );

    // 执行第二个迁移文件（技术债务表）
    await executeSqlFile(
      prisma,
      path.join(basePath, 'add_world_model_moat_debt_tables.sql'),
      '执行技术债务表迁移（协作、版本管理）'
    );

    console.log('✅ 所有迁移完成！\n');

    // 验证表是否存在
    const expectedTables = [
      'user_feedback',
      'user_capability_learning',
      'route_difficulty_correction',
      'realtime_road_status',
      'realtime_weather_alerts',
      'realtime_poi_status',
      'road_status_prediction',
      'weather_prediction',
      'failure_risk_prediction',
      'adaptive_world_model_version',
      'user_contribution',
      'expert_verification',
      'data_quality_score',
      'world_model_versions',
    ];

    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (${expectedTables.map(t => `'${t}'`).join(', ')})`
    );

    console.log('📊 验证表结构:');
    const foundTables = tables.map(t => t.tablename);
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));

    if (foundTables.length === 0) {
      console.log('  ⚠️  未找到任何表');
    } else {
      foundTables.forEach((t) => {
        console.log(`  ✅ ${t}`);
      });
    }

    if (missingTables.length > 0) {
      console.log('\n⚠️  以下表未找到:');
      missingTables.forEach((t) => {
        console.log(`  ❌ ${t}`);
      });
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
