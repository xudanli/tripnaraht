// 检查城市数据
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCitiesData() {
  try {
    console.log('=== 检查中国城市数据 ===');
    const cnCities = await prisma.city.findMany({
      where: { countryCode: 'CN' },
      take: 5,
      select: { id: true, name: true, countryCode: true, nameCN: true },
    });
    console.log(`找到 ${cnCities.length} 个中国城市:`);
    cnCities.forEach(c => console.log(`  ${c.id}: ${c.name} (${c.nameCN}) [${c.countryCode}]`));

    console.log('\n=== 检查国家代码分布 ===');
    const countryStats = await prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
      SELECT "countryCode", COUNT(*) as count 
      FROM "City" 
      GROUP BY "countryCode" 
      ORDER BY count DESC 
      LIMIT 10
    `;
    console.log('前10个国家代码:');
    countryStats.forEach(s => console.log(`  ${s.countryCode}: ${s.count}`));

    console.log('\n=== 测试原始 SQL 查询（排除 location） ===');
    const rawCN = await prisma.$queryRaw<any[]>`
      SELECT 
        id, name, "countryCode", adcode, "nameCN", "nameEN", timezone, metadata
      FROM "City" 
      WHERE "countryCode" = 'CN'::text
      ORDER BY "countryCode" ASC, "name" ASC
      LIMIT 5
    `;
    console.log(`原始 SQL 查询找到 ${rawCN.length} 个中国城市:`);
    rawCN.forEach(c => console.log(`  ${c.id}: ${c.name} (${c.nameCN}) [${c.countryCode}]`));

    console.log('\n=== 测试 Prisma 查询 ===');
    const prismaCN = await prisma.city.findMany({
      where: { countryCode: 'CN' },
      take: 5,
    });
    console.log(`Prisma 查询找到 ${prismaCN.length} 个中国城市:`);
    prismaCN.forEach(c => console.log(`  ${c.id}: ${c.name} (${c.nameCN}) [${c.countryCode}]`));

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCitiesData();
