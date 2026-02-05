// scripts/run-trip-name-migration.ts
// 执行行程名称字段迁移

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('🚀 开始执行行程名称字段迁移...\n');

    // 读取迁移 SQL 文件
    const migrationFile = path.join(
      __dirname,
      '../prisma/migrations/20260204100007_add_trip_name_field/migration.sql'
    );

    if (!fs.existsSync(migrationFile)) {
      throw new Error(`迁移文件不存在: ${migrationFile}`);
    }

    const sql = fs.readFileSync(migrationFile, 'utf-8');

    // 检查当前状态
    console.log('🔍 检查当前状态...\n');

    const columnExists = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'Trip' AND column_name = 'name'
    `;

    const hasColumn = Number(columnExists[0].count) > 0;

    if (hasColumn) {
      console.log('⚠️  name 字段已存在');
    } else {
      console.log('✓ name 字段不存在，将添加');
    }

    const totalTrips = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Trip"
    `;

    console.log(`📊 总行程数: ${Number(totalTrips[0].count)}`);

    let tripsWithoutName = 0;
    if (hasColumn) {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NULL
      `;
      tripsWithoutName = Number(result[0].count);
      console.log(`📊 没有名称的行程数: ${tripsWithoutName}`);
    } else {
      console.log(`📊 没有名称的行程数: ${Number(totalTrips[0].count)} (字段不存在)`);
    }
    console.log('');

    // 执行迁移
    console.log('🔧 执行迁移 SQL...\n');

    // 分割 SQL 语句（按分号分割，过滤注释和空行）
    const lines = sql.split('\n');
    const statements: string[] = [];
    let currentStatement = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过注释行
      if (trimmed.startsWith('--') || trimmed.length === 0) {
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

    console.log(`找到 ${statements.length} 条 SQL 语句\n`);

    // 逐个执行语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim().length === 0) continue;

      try {
        const preview = statement.substring(0, 100).replace(/\n/g, ' ').replace(/\s+/g, ' ');
        console.log(`执行语句 ${i + 1}/${statements.length}: ${preview}...`);

        await prisma.$executeRawUnsafe(statement);
        console.log(`  ✅ 完成\n`);
      } catch (error: any) {
        // 如果是"已存在"的错误，跳过
        if (
          error.message?.includes('already exists') ||
          error.message?.includes('duplicate') ||
          error.message?.includes('column "name" of relation "Trip" already exists') ||
          error.message?.includes('column "name" already exists')
        ) {
          console.log(`  ⚠️  已存在，跳过: ${error.message.substring(0, 100)}\n`);
          continue;
        }
        console.error(`  ❌ 执行失败: ${error.message}`);
        throw error;
      }
    }

    // 验证结果
    console.log('🔍 验证迁移结果...\n');

    // 重新检查字段是否存在
    const columnCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'Trip' AND column_name = 'name'
    `;

    const fieldExists = Number(columnCheck[0].count) > 0;

    if (!fieldExists) {
      console.log('❌ 错误: name 字段未成功添加');
      throw new Error('迁移失败: name 字段未添加');
    }

    console.log('✅ name 字段已成功添加');

    // 检查行程数据
    const totalTripsAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Trip"
    `;

    const totalCount = Number(totalTripsAfter[0].count);

    if (totalCount === 0) {
      console.log('📊 数据库中没有行程数据（这是正常的，如果是新数据库）');
    } else {
      // 检查名称数据
      const finalTripsWithoutName = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NULL
      `;

      const tripsWithName = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NOT NULL
      `;

      console.log(`📊 总行程数: ${totalCount}`);
      console.log(`📊 有名称的行程数: ${Number(tripsWithName[0].count)}`);
      console.log(`📊 没有名称的行程数: ${Number(finalTripsWithoutName[0].count)}`);

      if (Number(finalTripsWithoutName[0].count) === 0) {
        console.log('\n✅ 所有行程都有名称！');
      } else {
        console.log(`\n⚠️  仍有 ${Number(finalTripsWithoutName[0].count)} 个行程没有名称`);
      }

      // 显示示例数据
      if (Number(tripsWithName[0].count) > 0) {
        console.log('\n📋 示例数据:');
        const samples = await prisma.$queryRaw<Array<{ id: string; name: string; destination: string; startDate: Date }>>`
          SELECT "id", "name", "destination", "startDate"
          FROM "Trip"
          WHERE "name" IS NOT NULL
          LIMIT 5
        `;

        samples.forEach((trip) => {
          console.log(`  - ${trip.name} (${trip.destination}, ${trip.startDate.toISOString().split('T')[0]})`);
        });
      }
    }

    console.log('\n🎉 迁移完成！');

    // 提示标记迁移为已应用
    console.log('\n💡 提示: 如果需要标记迁移为已应用，可以执行:');
    console.log('   npx prisma migrate resolve --applied 20260204100007_add_trip_name_field');
  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
