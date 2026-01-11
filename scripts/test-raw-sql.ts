// 测试原始 SQL 查询的不同写法
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function testRawSQL() {
  console.log('=== 测试不同的 SQL 查询写法 ===\n');

  const countryCode = 'CN';
  const limit = 5;

  console.log(`查询国家代码: ${countryCode}\n`);

  // 方法1: 直接使用模板字符串（当前代码的方式）
  console.log('--- 方法1: 模板字符串 + ::text ---');
  try {
    const result1 = await prisma.$queryRaw<any[]>`
      SELECT id, name, "countryCode", "nameCN"
      FROM "City" 
      WHERE "countryCode" = ${countryCode}::text
      LIMIT ${limit}
    `;
    console.log(`结果: ${result1.length} 个城市`);
    if (result1.length > 0) {
      console.log(`第一个城市: ${result1[0].nameCN || result1[0].name} [${result1[0].countryCode}]`);
      const wrong = result1.filter(c => c.countryCode !== countryCode);
      if (wrong.length > 0) {
        console.log(`❌ 错误：返回了 ${wrong.length} 个其他国家的城市`);
      } else {
        console.log(`✅ 正确：所有城市都属于 ${countryCode}`);
      }
    }
  } catch (error: any) {
    console.log(`❌ 错误: ${error.message}`);
  }
  console.log('');

  // 方法2: 使用 Prisma.sql
  console.log('--- 方法2: Prisma.sql ---');
  try {
    const result2 = await prisma.$queryRaw<any[]>`
      SELECT id, name, "countryCode", "nameCN"
      FROM "City" 
      WHERE "countryCode" = ${Prisma.sql`${countryCode}`}
      LIMIT ${limit}
    `;
    console.log(`结果: ${result2.length} 个城市`);
    if (result2.length > 0) {
      console.log(`第一个城市: ${result2[0].nameCN || result2[0].name} [${result2[0].countryCode}]`);
      const wrong = result2.filter(c => c.countryCode !== countryCode);
      if (wrong.length > 0) {
        console.log(`❌ 错误：返回了 ${wrong.length} 个其他国家的城市`);
      } else {
        console.log(`✅ 正确：所有城市都属于 ${countryCode}`);
      }
    }
  } catch (error: any) {
    console.log(`❌ 错误: ${error.message}`);
  }
  console.log('');

  // 方法3: 使用 Prisma.sql 构建 WHERE 条件
  console.log('--- 方法3: Prisma.sql 构建 WHERE 条件 ---');
  try {
    const whereClause = Prisma.sql`WHERE "countryCode" = ${countryCode}`;
    const result3 = await prisma.$queryRaw<any[]>`
      SELECT id, name, "countryCode", "nameCN"
      FROM "City" 
      ${whereClause}
      LIMIT ${limit}
    `;
    console.log(`结果: ${result3.length} 个城市`);
    if (result3.length > 0) {
      console.log(`第一个城市: ${result3[0].nameCN || result3[0].name} [${result3[0].countryCode}]`);
      const wrong = result3.filter(c => c.countryCode !== countryCode);
      if (wrong.length > 0) {
        console.log(`❌ 错误：返回了 ${wrong.length} 个其他国家的城市`);
      } else {
        console.log(`✅ 正确：所有城市都属于 ${countryCode}`);
      }
    }
  } catch (error: any) {
    console.log(`❌ 错误: ${error.message}`);
  }
  console.log('');

  // 方法4: 使用标准 Prisma 查询（作为对比）
  console.log('--- 方法4: 标准 Prisma 查询（对比） ---');
  try {
    const result4 = await prisma.city.findMany({
      where: { countryCode },
      take: limit,
      select: { id: true, name: true, countryCode: true, nameCN: true },
    });
    console.log(`结果: ${result4.length} 个城市`);
    if (result4.length > 0) {
      console.log(`第一个城市: ${result4[0].nameCN || result4[0].name} [${result4[0].countryCode}]`);
      const wrong = result4.filter(c => c.countryCode !== countryCode);
      if (wrong.length > 0) {
        console.log(`❌ 错误：返回了 ${wrong.length} 个其他国家的城市`);
      } else {
        console.log(`✅ 正确：所有城市都属于 ${countryCode}`);
      }
    }
  } catch (error: any) {
    console.log(`❌ 错误: ${error.message}`);
  }
  console.log('');

  await prisma.$disconnect();
}

testRawSQL().catch(console.error);
