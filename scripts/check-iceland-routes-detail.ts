#!/usr/bin/env tsx
/**
 * 检查冰岛路线详细信息
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('冰岛路线详细信息');
  console.log('='.repeat(60));
  console.log('');

  try {
    const routes = await prisma.routeDirection.findMany({
      where: { countryCode: 'IS' },
      orderBy: { id: 'asc' },
    });

    console.log(`找到 ${routes.length} 条冰岛路线:\n`);

    routes.forEach((route, index) => {
      console.log(`${index + 1}. 路线 ID: ${route.id}`);
      console.log(`   UUID: ${route.uuid}`);
      console.log(`   名称(CN): ${route.nameCN}`);
      console.log(`   名称(EN): ${route.nameEN}`);
      console.log(`   描述: ${route.description?.substring(0, 100)}...`);
      console.log(`   状态: ${route.status}`);
      console.log(`   标签: ${route.tags.join(', ')}`);
      console.log(`   Regions: ${route.regions.join(', ')}`);

      const metadata = route.metadata as any;
      if (metadata?.route_id) {
        console.log(`   Route ID (metadata): ${metadata.route_id}`);
      }

      const signaturePois = route.signaturePois as any;
      if (signaturePois?.count) {
        console.log(`   关键景点数: ${signaturePois.count}`);
      }

      console.log('');
    });

  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
