import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkAttractions() {
  const attractionNames = [
    '故宫', '天安门', '长城', '天坛', '颐和园', '圆明园',
    '北海公园', '什刹海', '恭王府', '雍和宫', '景山公园',
    '明十三陵', '鸟巢', '水立方', '798艺术区', '南锣鼓巷',
    '王府井', '前门大街', '香山公园', '北京动物园', '北京植物园',
    '天安门广场', '国家博物馆', '国家大剧院', '钟鼓楼',
    '孔庙和国子监', '地坛公园', '朝阳公园', '玉渊潭公园', '紫竹院公园'
  ];

  console.log('🔍 查询数据库中这些景点的数据...\n');
  console.log('━'.repeat(80));

  const results = await prisma.place.findMany({
    where: {
      category: 'ATTRACTION',
      nameCN: {
        in: attractionNames,
      },
    },
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
      address: true,
      rating: true,
      cityId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      nameCN: 'asc',
    },
  });

  console.log(`📊 找到 ${results.length} / ${attractionNames.length} 个景点\n`);

  if (results.length > 0) {
    console.log('✅ 已存在的景点：\n');
    results.forEach((place) => {
      const metadata = place.metadata as any;
      console.log(`📍 ${place.nameCN}`);
      console.log(`   ID: ${place.id}`);
      if (place.nameEN) {
        console.log(`   英文名: ${place.nameEN}`);
      }
      if (place.address) {
        console.log(`   地址: ${place.address.substring(0, 50)}${place.address.length > 50 ? '...' : ''}`);
      }
      if (place.rating) {
        console.log(`   评分: ${place.rating}`);
      }
      if (metadata?.source) {
        console.log(`   来源: ${metadata.source}`);
      }
      if (metadata?.sourceUrl) {
        console.log(`   来源URL: ${metadata.sourceUrl.substring(0, 60)}...`);
      }
      if (metadata?.description) {
        console.log(`   描述: ${metadata.description.substring(0, 50)}...`);
      }
      if (metadata?.phone) {
        console.log(`   电话: ${metadata.phone}`);
      }
      if (metadata?.website) {
        console.log(`   网站: ${metadata.website}`);
      }
      console.log(`   创建时间: ${place.createdAt.toLocaleString('zh-CN')}`);
      console.log(`   更新时间: ${place.updatedAt.toLocaleString('zh-CN')}`);
      console.log('');
    });
  }

  // 检查缺失的景点
  const foundNames = results.map((p) => p.nameCN);
  const missingNames = attractionNames.filter((name) => !foundNames.includes(name));

  if (missingNames.length > 0) {
    console.log('━'.repeat(80));
    console.log(`❌ 未找到的景点 (${missingNames.length} 个)：\n`);
    missingNames.forEach((name) => {
      console.log(`   - ${name}`);
    });
  }

  // 统计信息
  console.log('\n' + '━'.repeat(80));
  console.log('📈 统计信息：');
  console.log(`   总数: ${attractionNames.length}`);
  console.log(`   已存在: ${results.length}`);
  console.log(`   缺失: ${missingNames.length}`);
  console.log(`   覆盖率: ${((results.length / attractionNames.length) * 100).toFixed(1)}%`);

  // 检查有完整数据的景点
  const completeData = results.filter((place) => {
    const metadata = place.metadata as any;
    return (
      place.address &&
      place.rating &&
      metadata?.description &&
      (metadata?.phone || metadata?.website || metadata?.openingHours)
    );
  });

  console.log(`   完整数据: ${completeData.length} 个`);
  console.log('━'.repeat(80));

  await prisma.$disconnect();
}

checkAttractions().catch((error) => {
  console.error('❌ 查询失败:', error);
  process.exit(1);
});
