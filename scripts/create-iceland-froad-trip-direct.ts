#!/usr/bin/env tsx
/**
 * 直接创建冰岛 F 路测试行程（不依赖 NestJS）
 * 
 * 1. 在数据库中创建冰岛 F 路行程
 * 2. 添加行程项（包含 F 路相关 POI）
 * 3. 展示行程信息
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 冰岛 F 路关键 POI
const FROAD_POIS = [
  { name: 'Selfoss', lat: 63.9330, lng: -21.0023, category: 'ROUTE_GATE' },
  { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667, category: 'SCENIC' },
  { name: 'Askja 火山', lat: 65.0333, lng: -16.75, category: 'SCENIC' },
  { name: 'Þingvellir', lat: 64.2553, lng: -21.1150, category: 'SCENIC' },
  { name: 'Vík', lat: 63.4194, lng: -19.0067, category: 'ROUTE_GATE' },
  { name: 'Akureyri', lat: 65.6836, lng: -18.1000, category: 'ROUTE_GATE' },
];

async function findOrCreatePlace(poi: typeof FROAD_POIS[0]) {
  // 尝试查找现有的 Place（通过 nameCN 或 nameEN）
  const existing = await prisma.place.findFirst({
    where: {
      OR: [
        { nameCN: { contains: poi.name } },
        { nameEN: { contains: poi.name } },
      ],
    },
    include: {
      City: true,
    },
  });

  if (existing) {
    return existing;
  }

  // 查找或创建冰岛的城市（用于关联）
  let city = await prisma.city.findFirst({
    where: {
      countryCode: 'IS',
      nameEN: { contains: 'Reykjavik' },
    },
  });

  if (!city) {
    // 创建一个默认城市
    city = await prisma.city.create({
      data: {
        nameCN: '雷克雅未克',
        nameEN: 'Reykjavik',
        countryCode: 'IS',
        latitude: 64.1466,
        longitude: -21.9426,
      } as any,
    });
  }

  // 创建新的 Place
  const now = new Date();
  const place = await prisma.place.create({
    data: {
      uuid: randomUUID(),
      nameCN: poi.name,
      nameEN: poi.name,
      category: poi.category === 'SCENIC' ? 'ATTRACTION' : 'POINT_OF_INTEREST',
      cityId: city.id,
      updatedAt: now,
      metadata: {
        countryCode: 'IS',
        coordinates: { lat: poi.lat, lng: poi.lng },
        lat: poi.lat,
        lng: poi.lng,
      } as any,
    } as any,
  });

  // 更新地理位置（使用 PostGIS）
  await prisma.$executeRaw`
    UPDATE "Place"
    SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
    WHERE id = ${place.id}
  `;

  return place;
}

async function main() {
  log('========================================', 'blue');
  log('创建冰岛 F 路测试行程', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. 创建 Trip
    log('步骤 1: 创建 Trip...', 'cyan');
    const startDate = DateTime.now().plus({ days: 30 }).startOf('day');
    const endDate = startDate.plus({ days: 7 });
    const tripId = randomUUID();

    const trip = await prisma.trip.create({
      data: {
        id: tripId,
        name: '冰岛高地 F 路穿越',
        destination: 'IS',
        startDate: startDate.toJSDate(),
        endDate: endDate.toJSDate(),
        status: 'PLANNING',
        pacingConfig: {
          fitness: 'high',
          pace: 'moderate',
          riskTolerance: 'high',
        } as any,
        budgetConfig: {
          totalBudget: 50000,
          currency: 'CNY',
        } as any,
        metadata: {
          routeType: 'ADVENTURE_DRIVE',
          vehicleRequired: '4x4',
          testTrip: true,
          description: '冰岛高地 F 路穿越测试行程，用于展示世界模型',
        } as any,
        updatedAt: new Date(),
      } as any,
    });

    log(`✅ Trip 创建成功: ${trip.id}`, 'green');
    console.log(`  名称: ${trip.name}`);
    console.log(`  目的地: ${trip.destination}`);
    console.log(`  开始日期: ${startDate.toFormat('yyyy-MM-dd')}`);
    console.log(`  结束日期: ${endDate.toFormat('yyyy-MM-dd')}`);
    console.log('');

    // 2. 创建 TripDay
    log('步骤 2: 创建 TripDay...', 'cyan');
    const tripDays = [];
    for (let i = 0; i < 8; i++) {
      const dayDate = startDate.plus({ days: i });
      const tripDay = await prisma.tripDay.create({
        data: {
          id: randomUUID(),
          tripId: trip.id,
          date: dayDate.toJSDate(),
        } as any,
      });
      tripDays.push(tripDay);
      console.log(`  ✅ 第${i + 1}天: ${dayDate.toFormat('yyyy-MM-dd')} (ID: ${tripDay.id})`);
    }
    log(`✅ 创建了 ${tripDays.length} 个 TripDay`, 'green');
    console.log('');

    // 3. 查找或创建 Place
    log('步骤 3: 查找或创建 Place...', 'cyan');
    const places = [];
    for (const poi of FROAD_POIS) {
      const place = await findOrCreatePlace(poi);
      places.push(place);
      log(`  ✅ ${place.nameCN} (ID: ${place.id})`, 'green');
    }
    console.log('');

    // 4. 创建 ItineraryItem
    log('步骤 4: 创建 ItineraryItem...', 'cyan');
    const itineraryItems = [];
    
    // 第1天：Selfoss → Landmannalaugar
    const day1 = tripDays[0];
    const selfoss = places.find(p => p.nameCN === 'Selfoss');
    const landmannalaugar = places.find(p => p.nameCN === 'Landmannalaugar');
    
    if (selfoss) {
      const item1 = await prisma.itineraryItem.create({
        data: {
          id: randomUUID(),
          tripDayId: day1.id,
          placeId: selfoss.id,
          type: 'ACTIVITY',
          startTime: DateTime.fromJSDate(day1.date).set({ hour: 9 }).toJSDate(),
          endTime: DateTime.fromJSDate(day1.date).set({ hour: 10 }).toJSDate(),
          note: 'F208 起点，准备进入高地',
        } as any,
      });
      itineraryItems.push(item1);
      console.log(`  ✅ 第1天: ${selfoss.nameCN} (F208 起点)`);
    }

    if (landmannalaugar) {
      const item2 = await prisma.itineraryItem.create({
        data: {
          id: randomUUID(),
          tripDayId: day1.id,
          placeId: landmannalaugar.id,
          type: 'ACTIVITY',
          startTime: DateTime.fromJSDate(day1.date).set({ hour: 14 }).toJSDate(),
          endTime: DateTime.fromJSDate(day1.date).set({ hour: 18 }).toJSDate(),
          note: 'Landmannalaugar 高地探索',
        } as any,
      });
      itineraryItems.push(item2);
      console.log(`  ✅ 第1天: ${landmannalaugar.nameCN} (高地探索)`);
    }

    // 第2-3天：高地探索
    for (let i = 1; i < 3; i++) {
      const day = tripDays[i];
      if (landmannalaugar) {
        const item = await prisma.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: day.id,
            placeId: landmannalaugar.id,
            type: 'ACTIVITY',
            startTime: DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
            endTime: DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
            note: `第${i + 1}天：高地徒步和温泉`,
          } as any,
        });
        itineraryItems.push(item);
        console.log(`  ✅ 第${i + 1}天: ${landmannalaugar.nameCN}`);
      }
    }

    // 第4-5天：Askja 火山
    const askja = places.find(p => p.nameCN === 'Askja 火山');
    for (let i = 3; i < 5; i++) {
      const day = tripDays[i];
      if (askja) {
        const item = await prisma.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: day.id,
            placeId: askja.id,
            type: 'ACTIVITY',
            startTime: DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
            endTime: DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
            note: `第${i + 1}天：Askja 火山探索`,
          } as any,
        });
        itineraryItems.push(item);
        console.log(`  ✅ 第${i + 1}天: ${askja.nameCN}`);
      }
    }

    // 第6-7天：Þingvellir
    const thingvellir = places.find(p => p.nameCN === 'Þingvellir');
    for (let i = 5; i < 7; i++) {
      const day = tripDays[i];
      if (thingvellir) {
        const item = await prisma.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: day.id,
            placeId: thingvellir.id,
            type: 'ACTIVITY',
            startTime: DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
            endTime: DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
            note: `第${i + 1}天：Þingvellir 国家公园`,
          } as any,
        });
        itineraryItems.push(item);
        console.log(`  ✅ 第${i + 1}天: ${thingvellir.nameCN}`);
      }
    }

    // 第8天：返回
    const day8 = tripDays[7];
    const akureyri = places.find(p => p.nameCN === 'Akureyri');
    if (akureyri) {
      const item = await prisma.itineraryItem.create({
        data: {
          id: randomUUID(),
          tripDayId: day8.id,
          placeId: akureyri.id,
          type: 'ACTIVITY',
          startTime: DateTime.fromJSDate(day8.date).set({ hour: 9 }).toJSDate(),
          endTime: DateTime.fromJSDate(day8.date).set({ hour: 12 }).toJSDate(),
          note: '第8天：返回 Akureyri，结束 F 路穿越',
        } as any,
      });
      itineraryItems.push(item);
      console.log(`  ✅ 第8天: ${akureyri.nameCN}`);
    }

    log(`✅ 创建了 ${itineraryItems.length} 个 ItineraryItem`, 'green');
    console.log('');

    // 5. 总结
    log('========================================', 'blue');
    log('✅ 行程创建完成', 'green');
    log('========================================', 'blue');
    console.log('');
    console.log(`📋 Trip ID: ${trip.id}`);
    console.log(`📋 行程名称: ${trip.name}`);
    console.log(`📋 天数: ${tripDays.length} 天`);
    console.log(`📋 行程项: ${itineraryItems.length} 个`);
    console.log(`📋 Place: ${places.length} 个`);
    console.log('');
    console.log('💡 下一步:');
    console.log(`  1. 查询行程: GET /api/trips/${trip.id}`);
    console.log(`  2. 构建世界模型: 使用 world.buildContext({ tripId: '${trip.id}' })`);
    console.log(`  3. 查看行程项: GET /api/itinerary-items?tripId=${trip.id}`);
    console.log('');

    // 6. 生成 JSON 摘要
    const summary = {
      timestamp: new Date().toISOString(),
      trip: {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        startDate: trip.startDate.toISOString(),
        endDate: trip.endDate.toISOString(),
        daysCount: tripDays.length,
        itemsCount: itineraryItems.length,
        placesCount: places.length,
      },
      days: tripDays.map((day, idx) => ({
        dayNumber: idx + 1,
        date: day.date.toISOString(),
        dayId: day.id,
        itemsCount: itineraryItems.filter(item => item.tripDayId === day.id).length,
      })),
      places: places.map(p => ({
        id: p.id,
        name: p.nameCN,
        category: p.category,
        coordinates: { lat: p.latitude, lng: p.longitude },
      })),
    };

    console.log('📊 JSON 摘要:');
    console.log(JSON.stringify(summary, null, 2));
    console.log('');

  } catch (error: any) {
    log(`❌ 操作失败: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
