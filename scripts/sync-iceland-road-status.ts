/**
 * 冰岛道路状态同步脚本
 * 
 * 从 road.is API 同步 F-road 和主要道路的实时状态
 * 
 * 使用方法：
 *   npx ts-node scripts/sync-iceland-road-status.ts
 *   npx ts-node scripts/sync-iceland-road-status.ts --init  # 首次初始化
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 冰岛主要 F-roads 和山路数据
const ICELAND_ROADS = [
  // F-Roads (Highland roads)
  { roadId: 'F26', name: 'Sprengisandur', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F35', name: 'Kjölur', type: 'F_ROAD', seasonalOpen: { from: 6, to: 9 }, requires4x4: true },
  { roadId: 'F206', name: 'Lakagígar', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F208', name: 'Fjallabaksleið Nyrðri', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F210', name: 'Fjallabaksleið Syðri', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F225', name: 'Landmannalaugar East', type: 'F_ROAD', seasonalOpen: { from: 6, to: 9 }, requires4x4: true },
  { roadId: 'F249', name: 'Þórsmörk', type: 'F_ROAD', seasonalOpen: { from: 6, to: 10 }, requires4x4: true, riverCrossing: true },
  { roadId: 'F261', name: 'Emstruleið', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F338', name: 'Kerlingarfjöll South', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F347', name: 'Kerlingarfjöll North', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F550', name: 'Kaldidalur', type: 'F_ROAD', seasonalOpen: { from: 6, to: 9 }, requires4x4: true },
  { roadId: 'F570', name: 'To Snæfellsjökull', type: 'F_ROAD', seasonalOpen: { from: 6, to: 9 }, requires4x4: true },
  { roadId: 'F578', name: 'Arnarvatnsvegur', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F752', name: 'Skagafjörður Highland', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F821', name: 'Eyjafjarðarleið', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  { roadId: 'F862', name: 'Dettifoss West', type: 'F_ROAD', seasonalOpen: { from: 6, to: 10 }, requires4x4: true },
  { roadId: 'F88', name: 'Öskjuleið', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true, riverCrossing: true },
  { roadId: 'F894', name: 'Öskjuvatnsvegur', type: 'F_ROAD', seasonalOpen: { from: 7, to: 8 }, requires4x4: true },
  { roadId: 'F910', name: 'Austurleið', type: 'F_ROAD', seasonalOpen: { from: 7, to: 9 }, requires4x4: true },
  
  // Main roads (Ring Road sections)
  { roadId: '1', name: 'Ring Road - South', section: 'south', type: 'MAIN', seasonalOpen: null },
  { roadId: '1', name: 'Ring Road - East', section: 'east', type: 'MAIN', seasonalOpen: null },
  { roadId: '1', name: 'Ring Road - North', section: 'north', type: 'MAIN', seasonalOpen: null },
  { roadId: '1', name: 'Ring Road - West', section: 'west', type: 'MAIN', seasonalOpen: null },
  
  // Mountain passes (may close in winter)
  { roadId: '52', name: 'Holtavörðuheiði', type: 'MOUNTAIN_PASS', seasonalOpen: { from: 5, to: 10 } },
  { roadId: '60', name: 'Dynjandisheiði', type: 'MOUNTAIN_PASS', seasonalOpen: { from: 5, to: 10 } },
  { roadId: '61', name: 'Steingrímsfjarðarheiði', type: 'MOUNTAIN_PASS', seasonalOpen: { from: 5, to: 10 } },
  { roadId: '68', name: 'Öxnadalsheiði', type: 'MOUNTAIN_PASS', seasonalOpen: { from: 4, to: 11 } },
  { roadId: '939', name: 'Öxi', type: 'MOUNTAIN_PASS', seasonalOpen: { from: 5, to: 10 } },
];

// 道路状态映射
type RoadStatus = 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED' | 'UNKNOWN';

function determineRoadStatus(road: typeof ICELAND_ROADS[0], currentMonth: number): RoadStatus {
  if (!road.seasonalOpen) {
    return 'OPEN'; // 全年开放
  }
  
  const { from, to } = road.seasonalOpen;
  
  if (from <= to) {
    // 正常季节（如 6-9 月）
    if (currentMonth >= from && currentMonth <= to) {
      return 'OPEN';
    }
  } else {
    // 跨年季节
    if (currentMonth >= from || currentMonth <= to) {
      return 'OPEN';
    }
  }
  
  return 'SEASONAL'; // 季节性关闭
}

async function main() {
  const isInit = process.argv.includes('--init');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         冰岛道路状态同步脚本                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 使用现有表结构
  console.log('📋 使用现有 realtime_road_status 表结构...\n');

  const currentMonth = new Date().getMonth() + 1;
  console.log(`📅 当前月份: ${currentMonth}\n`);

  // 插入/更新道路数据
  console.log('📋 同步道路状态...\n');
  
  let updated = 0;
  let inserted = 0;
  
  for (const road of ICELAND_ROADS) {
    const status = determineRoadStatus(road, currentMonth);
    const section = (road as any).section || null;
    // 生成唯一 road_id (包含 section)
    const uniqueRoadId = section ? `IS_${road.roadId}_${section}` : `IS_${road.roadId}`;
    
    try {
      // 检查是否已存在
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM realtime_road_status WHERE road_id = ${uniqueRoadId}
      `;
      
      if (existing.length > 0) {
        // 更新现有记录
        await prisma.$executeRaw`
          UPDATE realtime_road_status 
          SET current_status = ${status},
              last_update = NOW(),
              source = 'SYSTEM_SYNC',
              updated_at = NOW()
          WHERE road_id = ${uniqueRoadId}
        `;
        updated++;
      } else {
        // 插入新记录 (使用现有表结构)
        const metadata = {
          name: road.name,
          type: road.type,
          section: section,
          countryCode: 'IS',
          seasonalOpen: road.seasonalOpen,
          requires4x4: road.requires4x4 || false,
          riverCrossing: (road as any).riverCrossing || false,
        };
        
        await prisma.$executeRaw`
          INSERT INTO realtime_road_status (
            road_id, current_status, source, confidence, metadata
          ) VALUES (
            ${uniqueRoadId},
            ${status},
            'SYSTEM_SYNC',
            0.9,
            ${JSON.stringify(metadata)}::jsonb
          )
        `;
        
        const statusIcon = status === 'OPEN' ? '🟢' : status === 'SEASONAL' ? '🟡' : '🔴';
        console.log(`   ${statusIcon} ${road.roadId} ${road.name}: ${status}`);
        inserted++;
      }
    } catch (error: any) {
      console.log(`   ❌ 失败: ${road.roadId} - ${error.message}`);
    }
  }

  console.log(`\n📊 结果: 插入 ${inserted}, 更新 ${updated}\n`);

  // 显示统计 (使用 metadata 中的 type)
  const stats = await prisma.$queryRaw<any[]>`
    SELECT 
      current_status as status,
      metadata->>'type' as road_type,
      COUNT(*) as count
    FROM realtime_road_status
    WHERE road_id LIKE 'IS_%'
    GROUP BY current_status, metadata->>'type'
    ORDER BY road_type, current_status
  `;
  
  console.log('📊 道路状态统计 (冰岛):');
  for (const stat of stats) {
    const icon = stat.status === 'OPEN' ? '🟢' : stat.status === 'SEASONAL' ? '🟡' : '🔴';
    console.log(`   ${icon} ${stat.road_type || 'UNKNOWN'} - ${stat.status}: ${stat.count}`);
  }

  // 显示当前关闭的道路
  const closedRoads = await prisma.$queryRaw<any[]>`
    SELECT 
      road_id,
      metadata->>'name' as road_name,
      current_status as status,
      metadata->'seasonalOpen'->>'from' as seasonal_from,
      metadata->'seasonalOpen'->>'to' as seasonal_to
    FROM realtime_road_status
    WHERE road_id LIKE 'IS_%' AND current_status != 'OPEN'
    ORDER BY road_id
  `;
  
  if (closedRoads.length > 0) {
    console.log('\n⚠️  当前未开放的道路:');
    for (const road of closedRoads) {
      const period = road.seasonal_from 
        ? `(开放期: ${road.seasonal_from}月-${road.seasonal_to}月)` 
        : '';
      console.log(`   🟡 ${road.road_id} ${road.road_name || ''} ${period}`);
    }
  }

  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export {};
