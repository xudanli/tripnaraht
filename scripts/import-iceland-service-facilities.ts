#!/usr/bin/env tsx
/**
 * 批量导入冰岛服务设施 POI
 *
 * 用途: 导入加油站、高地小屋、救援站等关键 POI
 * 数据源: 官方 API、爬虫、手动整理
 *
 * 使用: npx tsx scripts/import-iceland-service-facilities.ts
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 冰岛服务设施 POI 数据结构
 */
interface IcelandServiceFacility {
  nameEN: string;
  nameCN: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address?: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  dataSource: 'official' | 'google' | 'osm' | 'manual';
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * 冰岛加油站数据（手动整理）
 */
const GAS_STATIONS: IcelandServiceFacility[] = [
  {
    nameEN: 'Selfoss N1',
    nameCN: 'Selfoss N1 加油站',
    category: 'SHOPPING',
    latitude: 63.9330,
    longitude: -21.0023,
    address: 'Selfoss, Iceland',
    openingHours: '07:00-23:00',
    phone: '+354 480 0000',
    website: 'https://www.n1.is',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F208'],
      type: 'gas_station',
      vendor: 'N1',
    },
  },
  {
    nameEN: 'Hella N1',
    nameCN: 'Hella N1 加油站',
    category: 'SHOPPING',
    latitude: 63.8383,
    longitude: -20.4042,
    openingHours: '07:00-23:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F208', 'F210'],
      type: 'gas_station',
      vendor: 'N1',
    },
  },
  {
    nameEN: 'Kirkjubæjarklaustur Orkan',
    nameCN: 'Kirkjubæjarklaustur Orkan 加油站',
    category: 'SHOPPING',
    latitude: 63.7933,
    longitude: -18.0558,
    openingHours: '08:00-22:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F206', 'F210'],
      type: 'gas_station',
      vendor: 'Orkan',
    },
  },
  {
    nameEN: 'Akureyri N1',
    nameCN: 'Akureyri N1 加油站',
    category: 'SHOPPING',
    latitude: 65.6830,
    longitude: -18.1059,
    openingHours: '24小时',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F26', 'F821'],
      type: 'gas_station',
      vendor: 'N1',
    },
  },
  {
    nameEN: 'Blönduós Olís',
    nameCN: 'Blönduós Olís 加油站',
    category: 'SHOPPING',
    latitude: 65.6642,
    longitude: -20.2883,
    openingHours: '07:00-23:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F26'],
      type: 'gas_station',
      vendor: 'Olís',
    },
  },
  {
    nameEN: 'Mývatn N1',
    nameCN: 'Mývatn N1 加油站',
    category: 'SHOPPING',
    latitude: 65.6378,
    longitude: -16.9086,
    openingHours: '07:00-23:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F88', 'F910'],
      type: 'gas_station',
      vendor: 'N1',
    },
  },
  {
    nameEN: 'Egilsstaðir Orkan',
    nameCN: 'Egilsstaðir Orkan 加油站',
    category: 'SHOPPING',
    latitude: 65.2638,
    longitude: -14.3940,
    openingHours: '24小时',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F910'],
      type: 'gas_station',
      vendor: 'Orkan',
    },
  },
  {
    nameEN: 'Hveragerði N1',
    nameCN: 'Hveragerði N1 加油站',
    category: 'SHOPPING',
    latitude: 64.0020,
    longitude: -21.1880,
    openingHours: '07:00-23:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F35'],
      type: 'gas_station',
      vendor: 'N1',
    },
  },
  {
    nameEN: 'Varmahlíð Olís',
    nameCN: 'Varmahlíð Olís 加油站',
    category: 'SHOPPING',
    latitude: 65.5523,
    longitude: -19.4150,
    openingHours: '07:00-22:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F35'],
      type: 'gas_station',
      vendor: 'Olís',
    },
  },
  {
    nameEN: 'Vík Orkan',
    nameCN: 'Vík Orkan 加油站',
    category: 'SHOPPING',
    latitude: 63.4183,
    longitude: -19.0059,
    openingHours: '08:00-22:00',
    dataSource: 'manual',
    metadata: {
      fRoadNearby: ['F208'],
      type: 'gas_station',
      vendor: 'Orkan',
    },
  },
];

/**
 * 冰岛高地小屋数据（手动整理）
 */
const MOUNTAIN_HUTS: IcelandServiceFacility[] = [
  {
    nameEN: 'Landmannalaugar Hut',
    nameCN: 'Landmannalaugar 山屋',
    category: 'HOTEL',
    latitude: 63.9833,
    longitude: -19.0667,
    openingHours: '6月-9月',
    website: 'https://www.fi.is/en/mountain-huts',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F208'],
      type: 'mountain_hut',
      beds: 78,
      amenities: ['厕所', '淋浴', '厨房'],
      manager: 'Ferðafélag Íslands',
      reservationUrl: 'https://www.fi.is/en/mountain-huts/landmannalaugar',
    },
  },
  {
    nameEN: 'Þórsmörk (Básar) Hut',
    nameCN: 'Þórsmörk (Básar) 山屋',
    category: 'HOTEL',
    latitude: 63.6833,
    longitude: -19.4833,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F249'],
      type: 'mountain_hut',
      beds: 75,
      amenities: ['厕所', '淋浴', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Þórsmörk (Volcano Huts)',
    nameCN: 'Þórsmörk (Volcano Huts) 山屋',
    category: 'HOTEL',
    latitude: 63.6900,
    longitude: -19.4800,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F249'],
      type: 'mountain_hut',
      beds: 100,
      amenities: ['厕所', '淋浴', '餐厅', '暖气'],
      manager: 'Volcano Huts',
    },
  },
  {
    nameEN: 'Hveravellir Hut',
    nameCN: 'Hveravellir 山屋',
    category: 'HOTEL',
    latitude: 64.8667,
    longitude: -19.5500,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F35', 'F337'],
      type: 'mountain_hut',
      beds: 50,
      amenities: ['厕所', '温泉', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Kerlingarfjöll Hut',
    nameCN: 'Kerlingarfjöll 山屋',
    category: 'HOTEL',
    latitude: 64.6333,
    longitude: -19.3167,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F35', 'F347'],
      type: 'mountain_hut',
      beds: 60,
      amenities: ['厕所', '淋浴', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Askja (Dreki) Hut',
    nameCN: 'Askja (Dreki) 山屋',
    category: 'HOTEL',
    latitude: 65.0500,
    longitude: -16.4167,
    openingHours: '6月-8月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F910'],
      type: 'mountain_hut',
      beds: 30,
      amenities: ['厕所', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Nýidalur Hut',
    nameCN: 'Nýidalur 山屋',
    category: 'HOTEL',
    latitude: 64.7167,
    longitude: -18.0833,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F26'],
      type: 'mountain_hut',
      beds: 38,
      amenities: ['厕所', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Mælifellssandur Hut',
    nameCN: 'Mælifellssandur 山屋',
    category: 'HOTEL',
    latitude: 63.9167,
    longitude: -18.7500,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F210'],
      type: 'mountain_hut',
      beds: 12,
      amenities: ['厕所'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Strútur Hut',
    nameCN: 'Strútur 山屋',
    category: 'HOTEL',
    latitude: 63.9000,
    longitude: -19.3000,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: ['F225'],
      type: 'mountain_hut',
      beds: 15,
      amenities: ['厕所', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
  {
    nameEN: 'Álftavatn Hut',
    nameCN: 'Álftavatn 山屋',
    category: 'HOTEL',
    latitude: 64.0833,
    longitude: -19.1333,
    openingHours: '6月-9月',
    dataSource: 'official',
    metadata: {
      fRoadNearby: [],
      type: 'mountain_hut',
      beds: 32,
      amenities: ['厕所', '淋浴', '厨房'],
      manager: 'Ferðafélag Íslands',
    },
  },
];

/**
 * 导入函数
 */
async function importServiceFacilities() {
  console.log('🚀 开始导入冰岛服务设施 POI...\n');

  try {
    // 1. 导入加油站
    console.log('📍 导入加油站...');
    let gasStationCount = 0;

    for (const station of GAS_STATIONS) {
      try {
        // 检查是否已存在
        const existing = await prisma.place.findFirst({
          where: {
            nameEN: station.nameEN,
            nameCN: station.nameCN,
          },
        });

        if (existing) {
          // 更新现有记录（使用原始 SQL 更新 location）
          await prisma.$executeRaw`
            UPDATE "Place"
            SET
              "location" = ST_SetSRID(ST_MakePoint(${station.longitude}, ${station.latitude}), 4326)::geography,
              "address" = ${station.address || null},
              "metadata" = ${JSON.stringify({
                ...station.metadata,
                openingHours: station.openingHours,
                phone: station.phone,
                website: station.website,
                dataSource: station.dataSource,
              })}::jsonb,
              "updatedAt" = NOW()
            WHERE "id" = ${existing.id}
          `;
          console.log(`   🔄 更新: ${station.nameCN}`);
        } else {
          // 创建新记录
          await prisma.$executeRaw`
            INSERT INTO "Place" ("uuid", "nameEN", "nameCN", "category", "location", "address", "metadata", "createdAt", "updatedAt")
            VALUES (
              ${`iceland-gas-${Date.now()}-${Math.random().toString(36).substring(7)}`},
              ${station.nameEN},
              ${station.nameCN},
              ${station.category}::"PlaceCategory",
              ST_SetSRID(ST_MakePoint(${station.longitude}, ${station.latitude}), 4326)::geography,
              ${station.address || null},
              ${JSON.stringify({
                ...station.metadata,
                openingHours: station.openingHours,
                phone: station.phone,
                website: station.website,
                dataSource: station.dataSource,
              })}::jsonb,
              NOW(),
              NOW()
            )
          `;
          console.log(`   ✅ 新增: ${station.nameCN}`);
        }

        gasStationCount++;
      } catch (error: any) {
        console.error(`   ❌ 导入失败: ${station.nameCN}`, error.message);
      }
    }

    console.log(`   总计: ${gasStationCount}/${GAS_STATIONS.length} ✅\n`);

    // 2. 导入高地小屋
    console.log('🏔️  导入高地小屋...');
    let hutCount = 0;

    for (const hut of MOUNTAIN_HUTS) {
      try {
        const existing = await prisma.place.findFirst({
          where: {
            nameEN: hut.nameEN,
            nameCN: hut.nameCN,
          },
        });

        if (existing) {
          await prisma.$executeRaw`
            UPDATE "Place"
            SET
              "location" = ST_SetSRID(ST_MakePoint(${hut.longitude}, ${hut.latitude}), 4326)::geography,
              "metadata" = ${JSON.stringify({
                ...hut.metadata,
                openingHours: hut.openingHours,
                website: hut.website,
                dataSource: hut.dataSource,
              })}::jsonb,
              "updatedAt" = NOW()
            WHERE "id" = ${existing.id}
          `;
          console.log(`   🔄 更新: ${hut.nameCN}`);
        } else {
          await prisma.$executeRaw`
            INSERT INTO "Place" ("uuid", "nameEN", "nameCN", "category", "location", "metadata", "createdAt", "updatedAt")
            VALUES (
              ${`iceland-hut-${Date.now()}-${Math.random().toString(36).substring(7)}`},
              ${hut.nameEN},
              ${hut.nameCN},
              ${hut.category}::"PlaceCategory",
              ST_SetSRID(ST_MakePoint(${hut.longitude}, ${hut.latitude}), 4326)::geography,
              ${JSON.stringify({
                ...hut.metadata,
                openingHours: hut.openingHours,
                website: hut.website,
                dataSource: hut.dataSource,
              })}::jsonb,
              NOW(),
              NOW()
            )
          `;
          console.log(`   ✅ 新增: ${hut.nameCN} (${hut.metadata?.beds || '?'} 张床)`);
        }

        hutCount++;
      } catch (error: any) {
        console.error(`   ❌ 导入失败: ${hut.nameCN}`, error.message);
      }
    }

    console.log(`   总计: ${hutCount}/${MOUNTAIN_HUTS.length} ✅\n`);

    // 3. 统计结果
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ 导入完成！');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📊 导入统计:');
    console.log(`   - 加油站: ${gasStationCount} 个`);
    console.log(`   - 高地小屋: ${hutCount} 个`);
    console.log(`   - 总计: ${gasStationCount + hutCount} 个\n`);

    // 4. 显示数据质量
    const result = await prisma.$queryRaw<Array<{ total: bigint; with_location: bigint }>>`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as with_location
      FROM "Place"
    `;

    const totalPlaces = Number(result[0].total);
    const withLocation = Number(result[0].with_location);

    console.log('📈 数据质量:');
    console.log(`   - 总 POI 数: ${totalPlaces} 个`);
    console.log(`   - 有地理位置: ${withLocation} 个 (${((withLocation / totalPlaces) * 100).toFixed(1)}%)\n`);

    console.log('🎯 下一步:');
    console.log('   1. 运行 POI 覆盖率分析: npx tsx scripts/analyze-iceland-poi-coverage.ts');
    console.log('   2. 检查数据质量（地理位置、开放时间）');
    console.log('   3. 补充其他 POI（露营地、停车场、河流穿越点）');
  } catch (error) {
    console.error('❌ 导入失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行导入
importServiceFacilities();
