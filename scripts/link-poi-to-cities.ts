// scripts/link-poi-to-cities.ts
// 为 POI 关联 cityId（根据坐标匹配最近的城市）
// 支持按国家批量处理

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 为指定国家的 POI 关联 cityId
 */
async function linkPOIToCities(countryCodes: string[] = ['IS', 'CH', 'NO', 'PE']) {
  try {
    console.log('开始为 POI 关联 cityId...\n');
    
    for (const countryCode of countryCodes) {
      console.log(`\n=== 处理 ${countryCode} ===`);
      
      // 查找该国家没有 cityId 但有坐标的 POI
      const poisWithoutCityId = await prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        lat: number;
        lng: number;
        regionKey: string | null;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          p.metadata->>'regionKey' as "regionKey"
        FROM "Place" p
        WHERE p."cityId" IS NULL
          AND p.location IS NOT NULL
          AND (
            -- 通过 regionKey 匹配
            (p.metadata->>'regionKey' LIKE ${countryCode + '_%'})
            -- 或者通过 City 关联（如果 POI 已经有 cityId，但需要更新）
            OR EXISTS (
              SELECT 1 FROM "City" c
              WHERE c.id = p."cityId"
              AND c."countryCode" = ${countryCode}
            )
          )
        LIMIT 10000
      `;
      
      console.log(`找到 ${poisWithoutCityId.length} 个需要匹配 cityId 的 POI`);
      
      if (poisWithoutCityId.length === 0) {
        console.log(`✅ ${countryCode} 没有需要处理的 POI\n`);
        continue;
      }
      
      // 根据国家设置搜索半径
      const searchRadius = countryCode === 'IS' ? 200000 : 150000; // 冰岛城市间距大，使用 200km
      const maxDistance = countryCode === 'IS' ? 200 : 150; // 最大允许距离（公里）
      
      let matched = 0;
      let notMatched = 0;
      let errors = 0;
      
      const BATCH_SIZE = 50;
      for (let i = 0; i < poisWithoutCityId.length; i += BATCH_SIZE) {
        const batch = poisWithoutCityId.slice(i, i + BATCH_SIZE);
        
        for (const poi of batch) {
          try {
            // 查找最近的城市
            const nearestCity = await prisma.$queryRaw<Array<{
              id: number;
              name: string;
              countryCode: string;
              distance_km: number;
            }>>`
              SELECT 
                id,
                name,
                "countryCode",
                ROUND((ST_Distance(
                  location::geography,
                  ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
                ) / 1000.0)::numeric, 1)::float as distance_km
              FROM "City"
              WHERE location IS NOT NULL
                AND "countryCode" = ${countryCode}
                AND ST_DWithin(
                  location::geography,
                  ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography,
                  ${searchRadius}
                )
              ORDER BY distance_km
              LIMIT 1
            `;
            
            if (nearestCity.length > 0) {
              const selectedCity = nearestCity[0];
              
              // 检查距离是否在允许范围内
              if (selectedCity.distance_km <= maxDistance) {
                await prisma.$executeRaw`
                  UPDATE "Place"
                  SET "cityId" = ${selectedCity.id},
                      "updatedAt" = NOW()
                  WHERE id = ${poi.id}
                `;
                matched++;
              } else {
                notMatched++;
              }
            } else {
              notMatched++;
            }
            
            if ((matched + notMatched) % 100 === 0) {
              console.log(`  进度: ${matched + notMatched}/${poisWithoutCityId.length} (已匹配: ${matched}, 未匹配: ${notMatched})`);
            }
          } catch (error: any) {
            console.error(`❌ 处理 POI ${poi.id} 失败: ${error.message}`);
            errors++;
          }
        }
      }
      
      console.log(`\n✅ ${countryCode} 完成: 匹配 ${matched} 个, 未匹配 ${notMatched} 个, 错误 ${errors} 个\n`);
    }
    
    console.log('\n=== 完成 ===');
    
  } catch (error: any) {
    console.error('处理失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
const countryCodes = process.argv.slice(2);
if (countryCodes.length > 0) {
  linkPOIToCities(countryCodes);
} else {
  // 默认处理所有目标国家
  linkPOIToCities(['IS', 'CH', 'NO', 'PE']);
}

