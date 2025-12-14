// scripts/import-airports-from-google.ts
/**
 * 从Google Places API导入机场数据
 * 
 * 通过搜索指定城市/国家的机场来获取机场数据
 * 
 * 使用方法：
 * ts-node --project tsconfig.backend.json scripts/import-airports-from-google.ts <countryCode>
 * 
 * 示例：
 * ts-node --project tsconfig.backend.json scripts/import-airports-from-google.ts IS
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * 通过Google Places API搜索机场
 */
async function searchAirportsByCountry(
  countryCode: string,
  apiKey: string
): Promise<any[]> {
  console.log(`🔍 搜索 ${countryCode} 的机场...`);
  
  if (!apiKey) {
    console.error('❌ Google Places API Key 未配置');
    return [];
  }
  
  try {
    // 使用Text Search API搜索机场
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query: `airport ${countryCode}`,
          key: apiKey,
          language: 'en',
        },
        timeout: 30000,
      }
    );
    
    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error(`API错误: ${response.data.status}`);
      return [];
    }
    
    return response.data.results || [];
  } catch (error: any) {
    console.error(`搜索失败: ${error.message}`);
    return [];
  }
}

/**
 * 导入单个机场
 */
async function importAirportFromGoogle(place: any, countryCode: string): Promise<{ success: boolean; placeId?: number; error?: string }> {
  try {
    const { name, geometry, place_id, formatted_address } = place;
    const lat = geometry?.location?.lat;
    const lng = geometry?.location?.lng;
    
    if (!lat || !lng) {
      return { success: false, error: '缺少坐标' };
    }
    
    // 检查是否已存在
    const existing = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Place"
      WHERE category::text = ${'TRANSIT_HUB'}
        AND (
          "nameCN" = ${name}
          OR "nameEN" = ${name}
          OR "googlePlaceId" = ${place_id}
          OR (
            ST_Distance(
              location::geography,
              ST_MakePoint(${lng}, ${lat})::geography
            ) < 2000
          )
        )
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      return { success: false, placeId: existing[0].id, error: '已存在' };
    }
    
    // 创建Place记录
    const placeRecord = await prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: name, // 可以根据需要添加中文名称
        nameEN: name,
        category: PlaceCategory.TRANSIT_HUB,
        address: formatted_address || undefined,
        googlePlaceId: place_id,
        metadata: {
          airport: true,
          countryCode,
        } as any,
        physicalMetadata: {
          terrain_type: 'FLAT',
          seated_ratio: 0.8,
          intensity_factor: 0.5,
        } as any,
        updatedAt: new Date(),
      } as any,
    });
    
    // 更新地理位置
    await prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${placeRecord.id}
    `;
    
    return { success: true, placeId: placeRecord.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  const countryCode = process.argv[2]?.toUpperCase();
  
  if (!countryCode || countryCode.length !== 2) {
    console.error('❌ 请提供国家代码 (ISO 3166-1 alpha-2)');
    console.error('用法: ts-node scripts/import-airports-from-google.ts <countryCode>');
    console.error('示例: ts-node scripts/import-airports-from-google.ts IS');
    process.exit(1);
  }
  
  console.log(`🚀 开始从Google Places导入 ${countryCode} 的机场数据...\n`);
  
  try {
    // 获取API Key
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || 
                   process.env.GOOGLE_MAPS_API_KEY || 
                   '';
    
    if (!apiKey) {
      console.error('❌ 请设置环境变量 GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_API_KEY');
      process.exit(1);
    }
    
    // 搜索机场
    const airports = await searchAirportsByCountry(countryCode, apiKey);
    
    if (airports.length === 0) {
      console.log('⚠️  未找到机场数据');
      return;
    }
    
    console.log(`找到 ${airports.length} 个机场，开始导入...\n`);
    
    // 导入每个机场
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < airports.length; i++) {
      const airport = airports[i];
      const result = await importAirportFromGoogle(airport, countryCode);
      
      if (result.success) {
        successCount++;
        console.log(`✅ [${i + 1}/${airports.length}] ${airport.name} (ID: ${result.placeId})`);
      } else if (result.error === '已存在') {
        skippedCount++;
        console.log(`⏭️  [${i + 1}/${airports.length}] ${airport.name} (已存在)`);
      } else {
        errorCount++;
        console.error(`❌ [${i + 1}/${airports.length}] ${airport.name} - ${result.error}`);
      }
      
      // 避免API速率限制
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('导入完成！');
    console.log('='.repeat(60));
    console.log(`总计: ${airports.length}`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`⏭️  跳过: ${skippedCount}`);
    console.log(`❌ 失败: ${errorCount}`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error: any) {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

