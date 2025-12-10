
// scripts/clear-flight-price-data.ts
// 清理航班价格相关数据表

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 开始清理航班价格相关数据...\n');

  try {
    // 0. 列出所有相关的表（帮助用户确认表名）
    console.log('🔍 查找所有相关表...');
    try {
      const allTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (table_name ILIKE '%flight%' OR table_name ILIKE '%raw%')
        ORDER BY table_name
      `;
      
      if (allTables.length > 0) {
        console.log('   找到以下相关表:');
        allTables.forEach(t => console.log(`     - ${t.table_name}`));
        console.log('');
      } else {
        console.log('   ℹ️  未找到包含 "flight" 或 "raw" 的表\n');
      }
    } catch (error: any) {
      console.log('   ⚠️  无法查询表列表:', error.message, '\n');
    }
    // 1. 清理 RawFlightData 表（如果存在，尝试多种可能的表名）
    console.log('📊 清理 RawFlightData 表...');
    const possibleTableNames = ['RawFlightData', 'rawflightdata', 'raw_flight_data', 'Raw_Flight_Data'];
    let rawFlightDataCleared = false;
    
    for (const tableName of possibleTableNames) {
      try {
        // 检查表是否存在
        const tableExistsResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
          ) as exists
        `;
        
        if (tableExistsResult[0]?.exists) {
          // 获取记录数
          const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count FROM ${prisma.$queryRawUnsafe(`"${tableName}"`)}
          `;
          const count = Number(countResult[0]?.count || 0);
          console.log(`   表名: ${tableName}, 当前记录数: ${count.toLocaleString()}`);

          if (count > 0) {
            await prisma.$executeRawUnsafe(`DELETE FROM "${tableName}"`);
            console.log(`   ✅ 已删除 ${count.toLocaleString()} 条记录\n`);
            rawFlightDataCleared = true;
            break;
          } else {
            console.log(`   ℹ️  表 ${tableName} 已为空\n`);
            rawFlightDataCleared = true;
            break;
          }
        }
      } catch (error: any) {
        // 继续尝试下一个表名
        continue;
      }
    }
    
    if (!rawFlightDataCleared) {
      console.log('   ℹ️  未找到 RawFlightData 表（可能表名不同或表不存在）\n');
    }

    // 2. 清理 FlightPriceDetail 表
    console.log('📊 清理 FlightPriceDetail 表...');
    const flightPriceDetailCount = await prisma.flightPriceDetail.count();
    console.log(`   当前记录数: ${flightPriceDetailCount.toLocaleString()}`);

    if (flightPriceDetailCount > 0) {
      const deleteResult = await prisma.flightPriceDetail.deleteMany({});
      console.log(`   ✅ 已删除 ${deleteResult.count.toLocaleString()} 条记录\n`);
    } else {
      console.log('   ℹ️  表已为空，无需清理\n');
    }

    // 3. 清理 DayOfWeekFactor 表
    console.log('📊 清理 DayOfWeekFactor 表...');
    const dayOfWeekFactorCount = await prisma.dayOfWeekFactor.count();
    console.log(`   当前记录数: ${dayOfWeekFactorCount}`);

    if (dayOfWeekFactorCount > 0) {
      const deleteResult = await prisma.dayOfWeekFactor.deleteMany({});
      console.log(`   ✅ 已删除 ${deleteResult.count} 条记录\n`);
    } else {
      console.log('   ℹ️  表已为空，无需清理\n');
    }

    // 4. 验证清理结果
    console.log('🔍 验证清理结果...');
    let remainingRawFlightData = 0;
    let rawFlightDataTableName = '';
    
    // 查找 RawFlightData 表并检查记录数
    for (const tableName of possibleTableNames) {
      try {
        const tableExistsResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
          ) as exists
        `;
        
        if (tableExistsResult[0]?.exists) {
          const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count FROM ${prisma.$queryRawUnsafe(`"${tableName}"`)}
          `;
          remainingRawFlightData = Number(countResult[0]?.count || 0);
          rawFlightDataTableName = tableName;
          break;
        }
      } catch (error: any) {
        // 继续尝试下一个表名
        continue;
      }
    }
    const remainingFlightPriceDetail = await prisma.flightPriceDetail.count();
    const remainingDayOfWeekFactor = await prisma.dayOfWeekFactor.count();

    console.log(`   RawFlightData 剩余记录: ${remainingRawFlightData}`);
    console.log(`   FlightPriceDetail 剩余记录: ${remainingFlightPriceDetail}`);
    console.log(`   DayOfWeekFactor 剩余记录: ${remainingDayOfWeekFactor}\n`);

    if (remainingRawFlightData === 0 && remainingFlightPriceDetail === 0 && remainingDayOfWeekFactor === 0) {
      console.log('✅ 所有数据已成功清理！');
      console.log('💡 现在可以重新导入2023、2024年的数据了。');
    } else {
      console.log('⚠️  警告：仍有数据未清理完成');
    }

  } catch (error: any) {
    console.error('\n❌ 清理失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

