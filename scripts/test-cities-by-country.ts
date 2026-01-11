// 测试不同国家的城市查询
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCitiesByCountry() {
  try {
    console.log('=== 测试不同国家的城市查询 ===\n');

    const testCountries = ['CN', 'JP', 'IS', 'US', 'GB', 'AE', 'AD'];

    for (const countryCode of testCountries) {
      console.log(`\n--- 测试国家代码: ${countryCode} ---`);
      
      // 1. 使用 Prisma 查询
      const prismaCities = await prisma.city.findMany({
        where: { countryCode },
        take: 5,
        select: {
          id: true,
          name: true,
          countryCode: true,
          nameCN: true,
          nameEN: true,
        },
      });

      console.log(`Prisma 查询结果: ${prismaCities.length} 个城市`);
      if (prismaCities.length > 0) {
        prismaCities.forEach(c => {
          console.log(`  ${c.id}: ${c.nameCN || c.nameEN || c.name} [${c.countryCode}]`);
        });
      } else {
        console.log(`  ⚠️  未找到 ${countryCode} 的城市`);
      }

      // 2. 使用原始 SQL 查询（与后端代码一致）
      const rawCities = await prisma.$queryRaw<any[]>`
        SELECT 
          id, name, "countryCode", "nameCN", "nameEN"
        FROM "City" 
        WHERE "countryCode" = ${countryCode}::text
        ORDER BY "countryCode" ASC, "name" ASC
        LIMIT 5
      `;

      console.log(`原始 SQL 查询结果: ${rawCities.length} 个城市`);
      if (rawCities.length > 0) {
        rawCities.forEach(c => {
          console.log(`  ${c.id}: ${c.nameCN || c.nameEN || c.name} [${c.countryCode}]`);
        });
      } else {
        console.log(`  ⚠️  未找到 ${countryCode} 的城市`);
      }

      // 3. 检查返回的城市是否都是正确的国家代码
      const wrongCountry = rawCities.filter(c => c.countryCode !== countryCode);
      if (wrongCountry.length > 0) {
        console.log(`  ❌ 错误！返回了其他国家的城市:`);
        wrongCountry.forEach(c => {
          console.log(`    ${c.id}: ${c.name} [${c.countryCode}] (应该是 ${countryCode})`);
        });
      } else if (rawCities.length > 0) {
        console.log(`  ✅ 所有城市的国家代码都正确`);
      }
    }

    console.log('\n=== 检查数据库中所有国家代码 ===');
    const allCountries = await prisma.$queryRaw<Array<{ countryCode: string; count: bigint }>>`
      SELECT "countryCode", COUNT(*) as count 
      FROM "City" 
      GROUP BY "countryCode" 
      ORDER BY count DESC
    `;
    console.log(`数据库中共有 ${allCountries.length} 个不同的国家代码:`);
    allCountries.forEach(c => {
      console.log(`  ${c.countryCode}: ${c.count} 个城市`);
    });

    console.log('\n=== 检查是否有重复的城市（相同名称但不同国家代码） ===');
    const duplicateNames = await prisma.$queryRaw<Array<{ name: string; countries: string }>>`
      SELECT 
        name,
        STRING_AGG(DISTINCT "countryCode", ', ') as countries
      FROM "City"
      GROUP BY name
      HAVING COUNT(DISTINCT "countryCode") > 1
      LIMIT 10
    `;
    if (duplicateNames.length > 0) {
      console.log(`找到 ${duplicateNames.length} 个在不同国家都存在的城市名:`);
      duplicateNames.forEach(d => {
        console.log(`  ${d.name}: 存在于 [${d.countries}]`);
      });
    } else {
      console.log('✅ 没有发现重复的城市名');
    }

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCitiesByCountry();
