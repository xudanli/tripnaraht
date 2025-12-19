// scripts/fill-place-cityid.ts
/**
 * 为 Place 数据填充 cityId
 * 
 * 运行方式: npm run fill:cityid
 * 或: ts-node --project tsconfig.backend.json scripts/fill-place-cityid.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * 从地址中提取城市名
 */
function extractCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  
  // 中国地址格式：省市区街道，例如："北京市东城区天安门广场"
  // 支持多种行政区划：省、市、区、县、旗、盟、自治州等
  const parts = address.split(/[省市区县旗盟州]/);
  if (parts.length >= 2) {
    const cityPart = parts[1] || parts[0];
    // 移除"市"、"区"、"县"、"旗"、"盟"等后缀
    return cityPart.replace(/[市区县旗盟州]$/, '');
  }
  
  // 尝试匹配常见城市名（包括内蒙古等地区）
  const cityPatterns = [
    /(北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|乌兰察布|包头|赤峰|通辽|鄂尔多斯|呼伦贝尔|巴彦淖尔|乌海|锡林郭勒|兴安|阿拉善)/,
  ];
  
  for (const pattern of cityPatterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * 根据坐标找到最近的城市
 */
async function findNearestCityByLocation(
  prisma: PrismaClient,
  lat: number,
  lng: number,
  countryCode?: string
): Promise<number | null> {
  try {
    // 使用 PostGIS 查找最近的城市（在指定国家内，如果有 countryCode）
    const countryFilter = countryCode
      ? Prisma.sql`AND "countryCode" = ${countryCode}`
      : Prisma.sql``;
    
    const nearestCity = await prisma.$queryRaw<Array<{ id: number; distance: number }>>`
      SELECT 
        id,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance
      FROM "City"
      WHERE location IS NOT NULL
        ${countryFilter}
      ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geometry
      LIMIT 1
    `;
    
    if (nearestCity.length > 0 && nearestCity[0].distance < 100000) {
      // 如果距离小于 100 公里，认为是该城市（增加半径以覆盖偏远景点）
      return nearestCity[0].id;
    }
    
    return null;
  } catch (error: any) {
    console.error(`查找最近城市失败: ${error.message}`);
    return null;
  }
}

/**
 * 根据城市名匹配 City 表
 * 支持模糊匹配：如"乌兰察布市"匹配"乌兰察布"
 */
async function findCityByName(
  prisma: PrismaClient,
  cityName: string
): Promise<number | null> {
  try {
    // 先尝试精确匹配
    let city = await prisma.city.findFirst({
      where: {
        OR: [
          { nameCN: cityName },
          { name: cityName },
          { nameEN: cityName },
        ],
      },
    });
    
    if (city) {
      return city.id;
    }
    
    // 如果精确匹配失败，尝试模糊匹配（移除常见后缀）
    const normalizedName = cityName.replace(/[市区县旗盟州]$/, '');
    if (normalizedName !== cityName) {
      city = await prisma.city.findFirst({
        where: {
          OR: [
            { nameCN: { startsWith: normalizedName } },
            { name: { startsWith: normalizedName } },
            { nameEN: { startsWith: normalizedName } },
          ],
        },
      });
      
      if (city) {
        return city.id;
      }
    }
    
    // 尝试包含匹配（用于处理"太仆寺旗"匹配"太仆寺"等情况）
    if (cityName.includes('旗') || cityName.includes('盟') || cityName.includes('市')) {
      const baseName = cityName.replace(/[市区县旗盟州].*$/, '');
      if (baseName && baseName.length >= 2) {
        city = await prisma.city.findFirst({
          where: {
            OR: [
              { nameCN: { contains: baseName } },
              { name: { contains: baseName } },
            ],
          },
        });
        
        if (city) {
          return city.id;
        }
      }
    }
    
    return null;
  } catch (error: any) {
    console.error(`查找城市失败: ${error.message}`);
    return null;
  }
}

async function fillPlaceCityId() {
  const prisma = new PrismaClient();

  try {
    console.log('开始填充 Place 表的 cityId...\n');

    // 1. 查询所有 cityId 为 null 的 Place
    // 注意：将 location 转换为文本格式，避免 Prisma 反序列化问题
    const placesWithoutCityId = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      address: string | null;
      location: string | null;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        address,
        CASE 
          WHEN location IS NOT NULL THEN ST_AsText(location::geometry)
          ELSE NULL
        END as location,
        metadata
      FROM "Place"
      WHERE "cityId" IS NULL
      ORDER BY id
    `;

    console.log(`找到 ${placesWithoutCityId.length} 个需要填充 cityId 的 Place\n`);

    if (placesWithoutCityId.length === 0) {
      console.log('✅ 所有 Place 都已填充 cityId');
      return;
    }

    // 2. 批量处理
    const batchSize = 50;
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < placesWithoutCityId.length; i += batchSize) {
      const batch = placesWithoutCityId.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(placesWithoutCityId.length / batchSize);

      console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个地点)...`);

      for (const place of batch) {
        try {
          let cityId: number | null = null;

          // 策略 1: 从 metadata 中提取城市信息
          const metadata = place.metadata as any;
          if (metadata?.city || metadata?.cityName) {
            const cityName = metadata.city || metadata.cityName;
            cityId = await findCityByName(prisma, cityName);
            if (cityId) {
              console.log(`  ✅ Place ${place.id} (${place.nameCN}) - 从 metadata 匹配城市: ${cityName} (cityId: ${cityId})`);
            }
          }

          // 策略 2: 从 address 中提取城市名
          if (!cityId && place.address) {
            const cityName = extractCityFromAddress(place.address);
            if (cityName) {
              cityId = await findCityByName(prisma, cityName);
              if (cityId) {
                console.log(`  ✅ Place ${place.id} (${place.nameCN}) - 从地址匹配城市: ${cityName} (cityId: ${cityId})`);
              }
            }
          }

          // 策略 3: 根据坐标查找最近的城市
          if (!cityId && place.location) {
            try {
              // 提取坐标
              // location 现在是 WKT 格式的字符串，例如 "POINT(116.3974 39.9093)"
              let lat: number | null = null;
              let lng: number | null = null;

              const locationStr = String(place.location);
              const match = locationStr.match(/POINT\(([\d.+\-]+)\s+([\d.+\-]+)\)/);
              if (match) {
                lng = parseFloat(match[1]);
                lat = parseFloat(match[2]);
              }

              if (lat && lng) {
                // 尝试从 metadata 获取 countryCode
                const countryCode = metadata?.countryCode || metadata?.country;
                cityId = await findNearestCityByLocation(prisma, lat, lng, countryCode);
                if (cityId) {
                  console.log(`  ✅ Place ${place.id} (${place.nameCN}) - 根据坐标匹配城市 (cityId: ${cityId})`);
                }
              }
            } catch (error: any) {
              console.warn(`  ⚠️  Place ${place.id} (${place.nameCN}) - 坐标解析失败: ${error.message}`);
            }
          }

          // 更新 cityId
          if (cityId) {
            await prisma.$executeRawUnsafe(
              `UPDATE "Place" SET "cityId" = $1 WHERE id = $2`,
              cityId,
              place.id
            );
            successCount++;
          } else {
            skippedCount++;
            console.log(`  ⚠️  Place ${place.id} (${place.nameCN}) - 无法匹配城市，跳过`);
          }
        } catch (error: any) {
          failCount++;
          console.error(`  ❌ Place ${place.id} (${place.nameCN}) - 失败: ${error.message}`);
        }

        // 延迟以避免数据库压力
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // 批次间延迟
      if (i + batchSize < placesWithoutCityId.length) {
        console.log('  等待 0.5 秒后继续下一批次...\n');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log('\n✅ 填充完成！');
    console.log(`  - 成功: ${successCount}`);
    console.log(`  - 跳过: ${skippedCount}`);
    console.log(`  - 失败: ${failCount}`);
    console.log(`  - 总计: ${placesWithoutCityId.length}`);

    // 3. 验证结果
    const placesWithCityId = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE "cityId" IS NOT NULL;
    `;

    const placesWithoutCityIdAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE "cityId" IS NULL;
    `;

    console.log(`\n当前统计:`);
    console.log(`  - 已填充 cityId 的 Place: ${placesWithCityId[0]?.count || 0}`);
    console.log(`  - 未填充 cityId 的 Place: ${placesWithoutCityIdAfter[0]?.count || 0}`);
  } catch (error: any) {
    console.error('❌ 填充失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fillPlaceCityId();

