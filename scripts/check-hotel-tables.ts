// 检查酒店价格表结构
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查酒店价格表结构...\n');

  // 检查所有表
  const allTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%Hotel%' OR table_name LIKE '%hotel%' OR table_name LIKE '%Star%' OR table_name LIKE '%star%')
    ORDER BY table_name
  `;

  console.log('📊 找到的表:');
  allTables.forEach(t => console.log(`  - ${t.table_name}`));
  console.log('');

  // 检查 HotelPriceDetail 表
  console.log('🔍 检查 HotelPriceDetail 表:');
  try {
    const hotelPriceDetailColumns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'HotelPriceDetail'
      ORDER BY ordinal_position
    `;

    if (hotelPriceDetailColumns.length > 0) {
      console.log('  ✅ HotelPriceDetail 表存在:');
      hotelPriceDetailColumns.forEach(col => {
        console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
    } else {
      console.log('  ❌ HotelPriceDetail 表不存在');
    }
  } catch (e: any) {
    console.log(`  ❌ 查询错误: ${e.message}`);
  }
  console.log('');

  // 检查 StarCityPriceDetail 表
  console.log('🔍 检查 StarCityPriceDetail 表:');
  try {
    const starCityPriceDetailColumns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'StarCityPriceDetail'
      ORDER BY ordinal_position
    `;

    if (starCityPriceDetailColumns.length > 0) {
      console.log('  ✅ StarCityPriceDetail 表存在:');
      starCityPriceDetailColumns.forEach(col => {
        console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
    } else {
      console.log('  ❌ StarCityPriceDetail 表不存在');
    }
  } catch (e: any) {
    console.log(`  ❌ 查询错误: ${e.message}`);
  }
  console.log('');

  // 检查其他可能的表
  const tableNames = ['HotelWideData_Quarterly', 'StarCityMonthlyPrice', 'BrandStarMapping'];
  for (const tableName of tableNames) {
    console.log(`🔍 检查 ${tableName} 表:`);
    try {
      const columns = await prisma.$queryRaw<Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>>`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      if (columns.length > 0) {
        console.log(`  ✅ ${tableName} 表存在 (${columns.length} 列):`);
        columns.forEach(col => {
          console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
        });
      } else {
        console.log(`  ❌ ${tableName} 表不存在`);
      }
    } catch (e: any) {
      console.log(`  ❌ 查询错误: ${e.message}`);
    }
    console.log('');
  }

  console.log('✅ 检查完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
