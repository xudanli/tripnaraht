#!/usr/bin/env tsx
/**
 * 验证乌斯怀亚POI导入结果
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证乌斯怀亚POI导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 查找城市
    const city = await prisma.city.findFirst({
      where: {
        nameCN: '乌斯怀亚',
        countryCode: 'AR',
      },
    });

    if (!city) {
      console.log('❌ 未找到乌斯怀亚城市');
      return;
    }

    console.log(`✅ 城市信息:`);
    console.log(`  ID: ${city.id}`);
    console.log(`  名称: ${city.nameCN} (${city.nameEN})`);
    console.log(`  国家代码: ${city.countryCode}`);
    console.log(`  时区: ${city.timezone}`);
    console.log('');

    // 统计地点数量
    const totalPlaces = await prisma.place.count({
      where: { cityId: city.id },
    });

    console.log(`📍 地点统计:`);
    console.log(`  总数: ${totalPlaces} 个`);
    console.log('');

    // 按类别统计
    const placesByCategory = await prisma.place.groupBy({
      by: ['category'],
      where: { cityId: city.id },
      _count: true,
    });

    console.log(`📊 按类别统计:`);
    placesByCategory.forEach(item => {
      console.log(`  ${item.category}: ${item._count} 个`);
    });
    console.log('');

    // 显示前10个地点
    const samplePlaces = await prisma.place.findMany({
      where: { cityId: city.id },
      take: 10,
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        address: true,
        rating: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`📍 最近导入的10个地点:`);
    samplePlaces.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.nameCN}${place.nameEN ? ` (${place.nameEN})` : ''}`);
      console.log(`     类别: ${place.category}, 地址: ${place.address || '无'}, 评分: ${place.rating || '无'}`);
    });

  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
