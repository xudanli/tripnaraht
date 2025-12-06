// scripts/check-visa-data.ts
// 检查已导入的签证数据

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查已导入的签证数据...\n');
  
  // 查询所有有签证信息的国家
  const countries = await prisma.countryProfile.findMany({
    where: {
      visaForCN: { not: null },
    },
    select: {
      isoCode: true,
      nameCN: true,
      visaForCN: true,
    },
    orderBy: {
      isoCode: 'asc',
    },
  });
  
  console.log(`📊 总计: ${countries.length} 个国家有签证信息\n`);
  
  // 统计签证状态
  const stats: Record<string, number> = {};
  countries.forEach(country => {
    const visaInfo = country.visaForCN as any;
    const status = visaInfo?.status || 'UNKNOWN';
    stats[status] = (stats[status] || 0) + 1;
  });
  
  console.log('📈 签证状态统计：');
  Object.entries(stats).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} 个国家`);
  });
  
  console.log('\n📋 示例数据（前10个）：');
  countries.slice(0, 10).forEach(country => {
    const visaInfo = country.visaForCN as any;
    console.log(`  ${country.isoCode} (${country.nameCN}): ${visaInfo?.status || 'N/A'} - ${visaInfo?.requirement || 'N/A'}`);
  });
  
  if (countries.length > 10) {
    console.log(`\n  ... 还有 ${countries.length - 10} 个国家`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

