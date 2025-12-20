/**
 * 种子数据脚本：补齐宁海"十里红妆"相关POI
 * 
 * 为什么：避免宁海"十里红妆"族谱缺失，导致0结果
 * 
 * 使用方法：
 * npx ts-node scripts/seed-ninghai-shilihongzhuang.ts
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('开始补齐宁海"十里红妆"相关POI...');

  // 先查找宁波市（宁海的上级城市）
  const ningboCity = await prisma.city.findFirst({
    where: {
      OR: [
        { nameCN: '宁波' },
        { name: 'Ningbo' },
      ],
    },
  });

  if (!ningboCity) {
    console.error('未找到宁波市，请先导入城市数据');
    return;
  }

  console.log(`找到宁波市: ${ningboCity.nameCN} (ID: ${ningboCity.id})`);

  const items = [
    {
      nameCN: '十里红妆博物馆',
      nameEN: 'Shili Hongzhuang Museum',
      category: 'MUSEUM' as PlaceCategory,
      cityId: ningboCity.id,
      lat: 29.2879,
      lng: 121.4321,
      address: '浙江省宁波市宁海县',
      metadata: {
        source: 'seed_script',
        aliases: ['十里红妆', '十里红妆博物馆', '宁海十里红妆'],
        description: '宁海十里红妆博物馆，展示传统婚嫁文化',
      },
    },
    {
      nameCN: '十里红妆文化园',
      nameEN: 'Shili Hongzhuang Cultural Park',
      category: 'ATTRACTION' as PlaceCategory,
      cityId: ningboCity.id,
      lat: 29.2891,
      lng: 121.4332,
      address: '浙江省宁波市宁海县',
      metadata: {
        source: 'seed_script',
        aliases: ['十里红妆', '十里红妆文化园', '宁海十里红妆'],
        description: '宁海十里红妆文化园，体验传统婚嫁文化',
      },
    },
    {
      nameCN: '十里红妆景区',
      nameEN: 'Shili Hongzhuang Scenic Area',
      category: 'ATTRACTION' as PlaceCategory,
      cityId: ningboCity.id,
      lat: 29.2910,
      lng: 121.4310,
      address: '浙江省宁波市宁海县',
      metadata: {
        source: 'seed_script',
        aliases: ['十里红妆', '十里红妆景区', '宁海十里红妆'],
        description: '宁海十里红妆景区',
      },
    },
    {
      nameCN: '十里红妆一条街',
      nameEN: 'Shili Hongzhuang Street',
      category: 'ATTRACTION' as PlaceCategory,
      cityId: ningboCity.id,
      lat: 29.2920,
      lng: 121.4300,
      address: '浙江省宁波市宁海县',
      metadata: {
        source: 'seed_script',
        aliases: ['十里红妆', '十里红妆一条街', '宁海十里红妆'],
        description: '宁海十里红妆一条街，传统婚嫁文化街区',
      },
    },
  ];

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    try {
      // 检查是否已存在（通过nameCN和cityId）
      const existing = await prisma.place.findFirst({
        where: {
          nameCN: item.nameCN,
          cityId: item.cityId,
        },
      });

      if (existing) {
        // 更新现有记录（先更新基本字段）
        await prisma.place.update({
          where: { id: existing.id },
          data: {
            nameCN: item.nameCN,
            nameEN: item.nameEN,
            category: item.category,
            address: item.address,
            metadata: item.metadata as any,
            updatedAt: new Date(),
          },
        });
        
        // 使用原始SQL更新location字段
        await prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${item.lng}, ${item.lat}), 4326)::geography
          WHERE id = ${existing.id}
        `;
        
        updatedCount++;
        console.log(`✓ 更新: ${item.nameCN}`);
      } else {
        // 创建新记录（先创建基本字段）
        const place = await prisma.place.create({
          data: {
            uuid: randomUUID(),
            nameCN: item.nameCN,
            nameEN: item.nameEN,
            category: item.category,
            cityId: item.cityId,
            address: item.address,
            metadata: item.metadata as any,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        
        // 使用原始SQL更新location字段
        await prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${item.lng}, ${item.lat}), 4326)::geography
          WHERE id = ${place.id}
        `;
        
        createdCount++;
        console.log(`✓ 创建: ${item.nameCN} (ID: ${place.id})`);
      }
    } catch (error: any) {
      console.error(`✗ 处理失败 ${item.nameCN}: ${error?.message || String(error)}`);
    }
  }

  console.log(`\n完成！创建: ${createdCount}, 更新: ${updatedCount}`);
  console.log('\n注意：这些POI需要生成embedding才能被向量搜索找到。');
  console.log('请运行 embedding 生成脚本或等待自动生成。');
}

main()
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

