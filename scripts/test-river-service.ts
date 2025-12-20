#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import { GeoFactsRiverService } from '../src/trips/readiness/services/geo-facts-river.service';

const prisma = new PrismaClient() as any; // 临时类型转换

async function test() {
  console.log('🧪 测试 GeoFactsRiverService...\n');
  
  const service = new GeoFactsRiverService(prisma);
  
  // 测试点位查询（冰岛雷克雅未克）
  console.log('📍 测试点位查询 (冰岛雷克雅未克 64.1283, -21.8278):');
  const pointFeatures = await service.getRiverFeaturesForPoint(64.1283, -21.8278);
  console.log(JSON.stringify(pointFeatures, null, 2));
  
  // 测试路线查询
  console.log('\n🛣️  测试路线查询 (雷克雅未克到蓝湖):');
  const routeFeatures = await service.getRiverFeaturesForRoute({
    points: [
      { lat: 64.1283, lng: -21.8278 }, // 雷克雅未克
      { lat: 64.0485, lng: -22.1900 }, // 蓝湖
    ]
  });
  console.log(JSON.stringify(routeFeatures, null, 2));
  
  console.log('\n✅ 测试完成！');
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

