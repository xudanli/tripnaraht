/**
 * 危险区域数据填充脚本
 * 
 * 填充 hazard_zones 表，用于世界模型的风险评估
 * 
 * 使用方法：
 *   npx ts-node scripts/seed-hazard-zones.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 冰岛已知危险区域数据
const ICELAND_HAZARD_ZONES = [
  // 雪崩区域
  {
    name: 'Eyjafjallajökull Glacier Zone',
    type: 'AVALANCHE',
    countryCode: 'IS',
    centerLat: 63.6333,
    centerLng: -19.6167,
    radiusKm: 10,
    seasonalRisk: {
      highRiskMonths: [11, 12, 1, 2, 3, 4],
      lowRiskMonths: [6, 7, 8],
    },
    defaultLevel: 'MEDIUM',
    notes: 'Active glacier with avalanche risk during winter',
  },
  {
    name: 'Vatnajökull Glacier Zone',
    type: 'AVALANCHE',
    countryCode: 'IS',
    centerLat: 64.4,
    centerLng: -16.8,
    radiusKm: 30,
    seasonalRisk: {
      highRiskMonths: [10, 11, 12, 1, 2, 3, 4, 5],
      lowRiskMonths: [7, 8],
    },
    defaultLevel: 'HIGH',
    notes: 'Largest glacier in Europe, frequent avalanches',
  },
  {
    name: 'Langjökull Glacier Zone',
    type: 'AVALANCHE',
    countryCode: 'IS',
    centerLat: 64.7,
    centerLng: -19.9,
    radiusKm: 15,
    seasonalRisk: {
      highRiskMonths: [11, 12, 1, 2, 3],
      lowRiskMonths: [6, 7, 8, 9],
    },
    defaultLevel: 'MEDIUM',
  },
  // 火山区域
  {
    name: 'Katla Volcano Zone',
    type: 'VOLCANIC',
    countryCode: 'IS',
    centerLat: 63.633,
    centerLng: -19.05,
    radiusKm: 20,
    defaultLevel: 'LOW',
    notes: 'Subglacial volcano, potential for jökulhlaup (glacial flood)',
  },
  {
    name: 'Hekla Volcano Zone',
    type: 'VOLCANIC',
    countryCode: 'IS',
    centerLat: 63.983,
    centerLng: -19.7,
    radiusKm: 15,
    defaultLevel: 'LOW',
    notes: 'Active volcano, last eruption 2000',
  },
  {
    name: 'Fagradalsfjall Volcanic Zone',
    type: 'VOLCANIC',
    countryCode: 'IS',
    centerLat: 63.883,
    centerLng: -22.267,
    radiusKm: 5,
    defaultLevel: 'MEDIUM',
    notes: 'Recent eruptions 2021-2024',
  },
  {
    name: 'Grindavík Volcanic Zone',
    type: 'VOLCANIC',
    countryCode: 'IS',
    centerLat: 63.85,
    centerLng: -22.45,
    radiusKm: 8,
    defaultLevel: 'HIGH',
    notes: 'Ongoing volcanic activity since 2023',
  },
  // 河流穿越危险区
  {
    name: 'Krossá River Crossing',
    type: 'FLOOD',
    countryCode: 'IS',
    centerLat: 63.55,
    centerLng: -19.35,
    radiusKm: 2,
    seasonalRisk: {
      highRiskMonths: [6, 7, 8], // 融雪季节
      lowRiskMonths: [12, 1, 2],
    },
    defaultLevel: 'HIGH',
    notes: 'Dangerous river crossing in Þórsmörk, glacial meltwater',
  },
  {
    name: 'Markarfljót River Zone',
    type: 'FLOOD',
    countryCode: 'IS',
    centerLat: 63.7,
    centerLng: -19.6,
    radiusKm: 5,
    seasonalRisk: {
      highRiskMonths: [6, 7, 8],
      lowRiskMonths: [11, 12, 1, 2],
    },
    defaultLevel: 'MEDIUM',
  },
  // 高地 F-road 区域
  {
    name: 'Sprengisandur Highland Route',
    type: 'ICE',
    countryCode: 'IS',
    centerLat: 64.8,
    centerLng: -18.0,
    radiusKm: 40,
    seasonalRisk: {
      highRiskMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
      lowRiskMonths: [7, 8],
    },
    defaultLevel: 'HIGH',
    notes: 'Highland road F26, impassable in winter',
  },
  {
    name: 'Kjölur Highland Route',
    type: 'ICE',
    countryCode: 'IS',
    centerLat: 64.65,
    centerLng: -19.5,
    radiusKm: 30,
    seasonalRisk: {
      highRiskMonths: [10, 11, 12, 1, 2, 3, 4, 5],
      lowRiskMonths: [7, 8, 9],
    },
    defaultLevel: 'MEDIUM',
    notes: 'Highland road F35',
  },
];

// 挪威危险区域
const NORWAY_HAZARD_ZONES = [
  {
    name: 'Trollstigen Winter Zone',
    type: 'AVALANCHE',
    countryCode: 'NO',
    centerLat: 62.45,
    centerLng: 7.67,
    radiusKm: 5,
    seasonalRisk: {
      highRiskMonths: [11, 12, 1, 2, 3, 4],
      lowRiskMonths: [6, 7, 8],
    },
    defaultLevel: 'HIGH',
    notes: 'Road closed Nov-May due to avalanche risk',
  },
  {
    name: 'Lofoten Winter Roads',
    type: 'ICE',
    countryCode: 'NO',
    centerLat: 68.2,
    centerLng: 14.0,
    radiusKm: 50,
    seasonalRisk: {
      highRiskMonths: [12, 1, 2, 3],
      lowRiskMonths: [6, 7, 8],
    },
    defaultLevel: 'MEDIUM',
    notes: 'Icy road conditions in winter',
  },
];

// 斯瓦尔巴危险区域
const SVALBARD_HAZARD_ZONES = [
  {
    name: 'Longyearbyen Polar Bear Zone',
    type: 'OTHER',
    countryCode: 'SJ',
    centerLat: 78.22,
    centerLng: 15.65,
    radiusKm: 100,
    defaultLevel: 'HIGH',
    notes: 'Polar bear risk - rifle required outside settlements',
    metadata: { hazardType: 'POLAR_BEAR' },
  },
  {
    name: 'Svalbard Glacier Zone',
    type: 'AVALANCHE',
    countryCode: 'SJ',
    centerLat: 78.5,
    centerLng: 17.0,
    radiusKm: 80,
    seasonalRisk: {
      highRiskMonths: [10, 11, 12, 1, 2, 3, 4, 5],
      lowRiskMonths: [7, 8],
    },
    defaultLevel: 'HIGH',
    notes: 'Extensive glacier coverage with crevasse risk',
  },
];

// 尼泊尔高海拔危险区域
const NEPAL_HAZARD_ZONES = [
  {
    name: 'Everest Base Camp Zone',
    type: 'AVALANCHE',
    countryCode: 'NP',
    centerLat: 28.0025,
    centerLng: 86.8528,
    radiusKm: 15,
    seasonalRisk: {
      highRiskMonths: [12, 1, 2, 6, 7, 8],
      lowRiskMonths: [4, 5, 10, 11],
    },
    defaultLevel: 'HIGH',
    notes: 'High altitude avalanche risk, altitude sickness zone',
    metadata: { minElevation: 5000, hazardType: 'AVALANCHE_AND_ALTITUDE' },
  },
  {
    name: 'Annapurna Circuit High Zone',
    type: 'AVALANCHE',
    countryCode: 'NP',
    centerLat: 28.75,
    centerLng: 83.93,
    radiusKm: 20,
    seasonalRisk: {
      highRiskMonths: [12, 1, 2, 6, 7, 8],
      lowRiskMonths: [4, 5, 10, 11],
    },
    defaultLevel: 'HIGH',
    notes: 'Thorong La Pass area, extreme weather possible',
  },
];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         危险区域数据填充脚本                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 检查表是否存在 - 现有表结构使用 zone_id 和 description 而非 name
  console.log('📋 使用现有 hazard_zones 表结构...\n');

  // 合并所有危险区域
  const allZones = [
    ...ICELAND_HAZARD_ZONES,
    ...NORWAY_HAZARD_ZONES,
    ...SVALBARD_HAZARD_ZONES,
    ...NEPAL_HAZARD_ZONES,
  ];

  console.log(`📋 准备插入 ${allZones.length} 个危险区域...\n`);

  let inserted = 0;
  for (const zone of allZones) {
    try {
      // 生成唯一 zone_id
      const zoneId = zone.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
      
      // 检查是否已存在
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM hazard_zones WHERE zone_id = ${zoneId}
      `;
      
      if (existing.length > 0) {
        console.log(`   ⏭️  跳过 (已存在): ${zone.name}`);
        continue;
      }
      
      // 创建圆形多边形 (使用现有表结构: id(uuid), zone_id, description, seasonality)
      await prisma.$executeRaw`
        INSERT INTO hazard_zones (
          id, zone_id, type, country_code, level, 
          geom, seasonality, metadata, description, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${zoneId},
          ${zone.type},
          ${zone.countryCode},
          ${zone.defaultLevel},
          ST_Buffer(
            ST_SetSRID(ST_MakePoint(${zone.centerLng}, ${zone.centerLat}), 4326)::geography, 
            ${zone.radiusKm * 1000}
          ),
          ${JSON.stringify(zone.seasonalRisk ? { ...zone.seasonalRisk, radiusKm: zone.radiusKm } : { radiusKm: zone.radiusKm })}::jsonb,
          ${JSON.stringify({ ...((zone as any).metadata || {}), centerLat: zone.centerLat, centerLng: zone.centerLng })}::jsonb,
          ${zone.notes || zone.name},
          NOW()
        )
      `;
      
      console.log(`   ✅ 已插入: ${zone.name} (${zone.type}, ${zone.countryCode})`);
      inserted++;
    } catch (error: any) {
      console.log(`   ❌ 插入失败: ${zone.name} - ${error.message}`);
    }
  }

  console.log(`\n📊 结果: 成功插入 ${inserted}/${allZones.length} 个危险区域\n`);

  // 显示统计
  const stats = await prisma.$queryRaw<any[]>`
    SELECT 
      country_code,
      type,
      COUNT(*) as count
    FROM hazard_zones
    GROUP BY country_code, type
    ORDER BY country_code, type
  `;
  
  console.log('📊 危险区域统计:');
  for (const stat of stats) {
    console.log(`   ${stat.country_code} - ${stat.type}: ${stat.count}`);
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
