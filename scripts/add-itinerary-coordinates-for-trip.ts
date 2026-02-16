#!/usr/bin/env npx ts-node
/**
 * 为行程 7891922b-f0cf-4b1d-90f3-89a259325fa0 的 Place 添加坐标
 * 用于世界模型 DEM 证据生成（需至少 2 个路线点）
 */
import { PrismaClient } from '@prisma/client';

const TRIP_ID = '7891922b-f0cf-4b1d-90f3-89a259325fa0';

// 冰岛真实坐标 (lat, lng)
const PLACE_COORDS: Record<number, { lat: number; lng: number }> = {
  381051: { lat: 65.5978, lng: -17.001 },   // 米湖天然浴场宾馆 Mývatn
  381046: { lat: 63.4194, lng: -19.0067 },   // 黑沙滩套房酒店 Vík
  381086: { lat: 64.7389, lng: -23.9503 },   // Djúpalónssandur黑沙滩
  381089: { lat: 64.0489, lng: -16.1791 },   // 钻石沙滩
  381049: { lat: 64.925, lng: -23.2533 },    // 格伦达菲厄泽宾馆
};

async function main() {
  const prisma = new PrismaClient();

  const items = await prisma.itineraryItem.findMany({
    where: { TripDay: { tripId: TRIP_ID } },
    include: { Place: true },
    orderBy: [{ TripDay: { date: 'asc' } }, { order: 'asc' }],
  });

  console.log(`找到 ${items.length} 个行程项`);

  for (const item of items) {
    const placeId = item.placeId;
    if (!placeId || !PLACE_COORDS[placeId]) continue;

    const place = item.Place;
    if (!place) continue;

    const coords = PLACE_COORDS[placeId];
    const metadata = (place.metadata as Record<string, unknown>) || {};
    if (metadata.coordinates) {
      console.log(`Place ${placeId} 已有坐标，跳过`);
      continue;
    }

    const updated = { ...metadata, coordinates: coords };
    await prisma.place.update({
      where: { id: placeId },
      data: { metadata: updated },
    });
    console.log(`Place ${placeId} (${place.nameCN}) 已添加坐标: ${coords.lat}, ${coords.lng}`);
  }

  // 添加西峡湾路线点，形成更完整的路线（≥10 个点有利于 DEM 采样）
  const tripDays = await prisma.tripDay.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: 'asc' },
  });

  if (tripDays.length > 0) {
    const westfjordsPoints = [
      { name: 'Hólmavík 霍尔马维克', lat: 65.7077, lng: -21.6704 },
      { name: 'Ísafjörður 伊萨菲厄泽', lat: 66.0752, lng: -23.126 },
      { name: 'Dynjandi 瀑布', lat: 65.7291, lng: -23.2067 },
      { name: 'Patreksfjörður', lat: 65.5558, lng: -23.9611 },
      { name: 'Látrabjarg 海鸟悬崖', lat: 65.5022, lng: -24.5328 },
    ];

    const cityId = 7338;
    for (let i = 0; i < westfjordsPoints.length; i++) {
      const p = westfjordsPoints[i];
      const day = tripDays[i % tripDays.length];

      const existingPlace = await prisma.place.findFirst({
        where: { nameCN: p.name },
      });
      let placeId: number;

      if (existingPlace) {
        placeId = existingPlace.id;
        const meta = (existingPlace.metadata as Record<string, unknown>) || {};
        if (!meta.coordinates) {
          await prisma.place.update({
            where: { id: placeId },
            data: { metadata: { ...meta, coordinates: { lat: p.lat, lng: p.lng } } },
          });
        }
      } else {
        const newPlace = await prisma.place.create({
          data: {
            uuid: `wf-test-${Date.now()}-${i}`,
            nameCN: p.name,
            nameEN: p.name,
            category: 'ATTRACTION',
            address: p.name,
            cityId,
            metadata: { coordinates: { lat: p.lat, lng: p.lng }, source: 'test_script' },
            physicalMetadata: {},
            updatedAt: new Date(),
          },
        });
        placeId = newPlace.id;
      }

      const maxOrder = await prisma.itineraryItem.findFirst({
        where: { tripDayId: day.id },
        orderBy: { order: 'desc' },
      });
      const nextOrder = (maxOrder?.order ?? 0) + 1;

      const itemId = `wf-item-${Date.now()}-${i}`;
      await prisma.itineraryItem.create({
        data: {
          id: itemId,
          type: 'ACTIVITY',
          placeId,
          tripDayId: day.id,
          order: nextOrder,
          startTime: new Date(day.date),
          endTime: new Date(day.date),
        },
      });
      console.log(`添加行程项: ${p.name} (Day ${i % tripDays.length + 1})`);
    }
  }

  console.log('\n完成。可运行 curl 测试世界模型:');
  console.log(`curl -s -X POST http://localhost:3000/api/world/buildContext -H "Content-Type: application/json" -d '{"tripId":"${TRIP_ID}"}'`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
