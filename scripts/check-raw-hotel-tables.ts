// 检查原始酒店表结构
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查原始酒店表结构...\n');

  // 检查 RawHotelData_Slim
  console.log('📊 RawHotelData_Slim 表:');
  try {
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'RawHotelData_Slim'
      ORDER BY ordinal_position
    `;

    if (columns.length > 0) {
      console.log(`  字段数: ${columns.length}`);
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '?' : '';
        console.log(`    - ${col.column_name}: ${col.data_type}${nullable}`);
      });
      
      // 检查数据量
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::BIGINT as count FROM "RawHotelData_Slim"
      `;
      console.log(`  数据量: ${count[0]?.count || 0} 条记录`);
    } else {
      console.log('  ❌ 表不存在');
    }
  } catch (e: any) {
    console.log(`  ❌ 查询错误: ${e.message}`);
  }
  console.log('');

  // 检查 HotelWideData_Quarterly
  console.log('📊 HotelWideData_Quarterly 表:');
  try {
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'HotelWideData_Quarterly'
      ORDER BY ordinal_position
    `;

    if (columns.length > 0) {
      console.log(`  字段数: ${columns.length}`);
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '?' : '';
        console.log(`    - ${col.column_name}: ${col.data_type}${nullable}`);
      });
      
      // 检查数据量
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::BIGINT as count FROM "HotelWideData_Quarterly"
      `;
      console.log(`  数据量: ${count[0]?.count || 0} 条记录`);
      
      // 检查示例数据
      const sample = await prisma.$queryRaw<Array<any>>`
        SELECT * FROM "HotelWideData_Quarterly" LIMIT 1
      `;
      if (sample.length > 0) {
        console.log('  示例数据:');
        const row = sample[0];
        console.log(`    city: ${row.city}, starRating: ${row.starRating}`);
        const quarters = Object.keys(row).filter(k => k.match(/^\d{4}_Q[1-4]$/));
        console.log(`    季度字段: ${quarters.slice(0, 5).join(', ')}... (共 ${quarters.length} 个)`);
      }
    } else {
      console.log('  ❌ 表不存在');
    }
  } catch (e: any) {
    console.log(`  ❌ 查询错误: ${e.message}`);
  }

  console.log('\n✅ 检查完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
