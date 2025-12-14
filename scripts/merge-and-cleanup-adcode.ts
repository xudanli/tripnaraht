/**
 * 合并并清理 adcode 数据
 * 1. 将 adcode 值更新到对应的城市记录（通过 name + countryCode 匹配）
 * 2. 删除所有有 adcode 的重复记录
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const skipConfirm = process.argv.includes('--yes');
  
  console.log('🔄 合并并清理 City 表的 adcode 数据...\n');

  try {
    // 步骤1: 查看当前数据情况
    console.log('📋 查看当前数据情况...');
    const stats = await prisma.$queryRaw<Array<{
      total_cities: bigint;
      cities_with_adcode: bigint;
      cities_without_adcode: bigint;
    }>>`
      SELECT 
        COUNT(*) as total_cities,
        COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
        COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
      FROM "City"
    `;
    
    const stat = stats[0];
    console.log(`  总城市数: ${stat.total_cities}`);
    console.log(`  有 adcode 的城市: ${stat.cities_with_adcode}`);
    console.log(`  无 adcode 的城市: ${stat.cities_without_adcode}`);
    console.log('');

    // 查看需要合并的重复组
    console.log('🔍 查找需要合并的重复城市（有 adcode 和无 adcode 的重复）...');
    const duplicates = await prisma.$queryRaw<Array<{
      name: string;
      countryCode: string;
      count: bigint;
      with_adcode: bigint;
      without_adcode: bigint;
    }>>`
      SELECT 
        name,
        "countryCode",
        COUNT(*) as count,
        COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as with_adcode,
        COUNT(CASE WHEN adcode IS NULL THEN 1 END) as without_adcode
      FROM "City"
      GROUP BY name, "countryCode"
      HAVING COUNT(*) > 1
        AND COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) > 0
        AND COUNT(CASE WHEN adcode IS NULL THEN 1 END) > 0
      ORDER BY name, "countryCode"
      LIMIT 20
    `;
    
    if (duplicates.length > 0) {
      console.log(`  找到 ${duplicates.length} 组重复城市（显示前20组）:`);
      for (const dup of duplicates) {
        console.log(`    - ${dup.name} (${dup.countryCode}): 总数=${dup.count}, 有adcode=${dup.with_adcode}, 无adcode=${dup.without_adcode}`);
      }
    } else {
      console.log('  未找到需要合并的重复城市');
    }
    console.log('');

    // 询问用户确认
    if (!skipConfirm) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await new Promise<string>((resolve) => {
        readline.question('⚠️  确认要继续执行合并和删除操作吗？(yes/no): ', resolve);
      });
      readline.close();
      
      if (answer !== 'yes') {
        console.log('❌ 操作已取消');
        return;
      }
    } else {
      console.log('⚠️  使用 --yes 参数，跳过确认，直接执行...');
    }

    // 步骤2: 将有 adcode 的记录的 adcode 值更新到对应的城市记录
    console.log('');
    console.log('🚀 执行合并和清理操作...');
    console.log('  步骤1: 合并 adcode 值...');
    
    const updateResult = await prisma.$executeRaw`
      UPDATE "City" AS target
      SET adcode = source.adcode
      FROM (
        SELECT 
          name,
          "countryCode",
          adcode
        FROM "City"
        WHERE adcode IS NOT NULL
      ) AS source
      WHERE target.name = source.name
        AND target."countryCode" = source."countryCode"
        AND target.adcode IS NULL
        AND source.adcode IS NOT NULL
    `;
    
    console.log(`  ✅ 已更新 ${updateResult} 条记录的 adcode 字段`);

    // 步骤3: 删除所有有 adcode 的记录
    console.log('  步骤2: 删除所有有 adcode 的记录...');
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM "City"
      WHERE adcode IS NOT NULL
    `;
    
    console.log(`  ✅ 已删除 ${deleteResult} 条有 adcode 的记录`);

    // 步骤4: 显示最终统计
    console.log('');
    console.log('✅ 操作成功完成！');
    console.log('');
    console.log('📊 最终数据统计:');
    
    const finalStats = await prisma.$queryRaw<Array<{
      total_cities: bigint;
      cities_with_adcode: bigint;
      cities_without_adcode: bigint;
    }>>`
      SELECT 
        COUNT(*) as total_cities,
        COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
        COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
      FROM "City"
    `;
    
    const finalStat = finalStats[0];
    console.log(`  总城市数: ${finalStat.total_cities}`);
    console.log(`  有 adcode 的城市: ${finalStat.cities_with_adcode}`);
    console.log(`  无 adcode 的城市: ${finalStat.cities_without_adcode}`);

  } catch (error: any) {
    console.error(`❌ 错误: ${error?.message || String(error)}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

