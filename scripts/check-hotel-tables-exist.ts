// 检查酒店价格表是否存在
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查酒店价格表...\n');

  // 检查 HotelPriceDetail
  const hotelTable = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'HotelPriceDetail'
  `;

  if (hotelTable.length > 0) {
    console.log('✅ HotelPriceDetail 表已存在');
    
    // 检查表结构
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
    }>>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'HotelPriceDetail'
      ORDER BY ordinal_position
    `;
    
    console.log('  字段:', columns.map(c => c.column_name).join(', '));
  } else {
    console.log('❌ HotelPriceDetail 表不存在');
  }

  // 检查 StarCityPriceDetail
  const starTable = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'StarCityPriceDetail'
  `;

  if (starTable.length > 0) {
    console.log('✅ StarCityPriceDetail 表已存在');
    
    // 检查表结构
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
    }>>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'StarCityPriceDetail'
      ORDER BY ordinal_position
    `;
    
    console.log('  字段:', columns.map(c => c.column_name).join(', '));
  } else {
    console.log('❌ StarCityPriceDetail 表不存在');
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
