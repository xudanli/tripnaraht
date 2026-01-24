import { PrismaClient } from '@prisma/client';

async function detailedVerify() {
  const prisma = new PrismaClient();

  try {
    const attractions = await prisma.place.findMany({
      where: {
        category: 'ATTRACTION',
        City: {
          nameEN: 'Reykjavík',
          countryCode: 'IS',
        },
      },
      include: {
        City: true,
      },
      orderBy: {
        nameCN: 'asc',
      },
    });

    console.log('\n🎯 冰岛景点完整列表（15个）\n');
    console.log('═'.repeat(100));

    attractions.forEach((attr, idx) => {
      const meta = attr.metadata as any;
      const region = meta?.region || '未知';
      const num = idx + 1;
      console.log(`${num}. ${attr.nameCN} (${attr.nameEN})`);
      console.log(`   ID: ${meta?.poi_id || '未知'} | 分类: ${attr.category}`);
      console.log(`   地区: ${region} | 评分: ${attr.rating || 'N/A'}`);
      console.log(`   描述: ${attr.description?.substring(0, 60)}...`);
      console.log('');
    });

    console.log('═'.repeat(100));
    console.log(`\n✅ 总景点数: ${attractions.length}`);

  } finally {
    await prisma.$disconnect();
  }
}

detailedVerify();
