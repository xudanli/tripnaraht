// scripts/create-route-direction-tables.ts
/**
 * 创建 RouteDirection 和 RouteTemplate 表
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('开始创建 RouteDirection 表...');

  try {
    const migrationFile = path.join(__dirname, '../prisma/migrations/20251225191251_add_route_directions/migration.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    
    // 分割 SQL 语句（按分号和换行）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // 逐个执行 SQL 语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      try {
        await prisma.$executeRawUnsafe(statement);
        console.log(`✓ 执行语句 ${i + 1}/${statements.length}`);
      } catch (error: any) {
        // 如果表已存在或索引已存在，忽略错误
        if (error.message?.includes('already exists') || 
            error.message?.includes('duplicate key') ||
            error.message?.includes('IF NOT EXISTS')) {
          console.log(`⚠️  语句 ${i + 1} 已存在，跳过`);
        } else {
          console.error(`❌ 执行语句 ${i + 1} 时出错:`, error.message);
          // 继续执行其他语句
        }
      }
    }

    console.log('\n✅ RouteDirection 表创建完成！');
  } catch (error: any) {
    console.error('❌ 创建表时出错:', error.message);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

