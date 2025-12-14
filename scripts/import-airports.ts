// scripts/import-airports.ts
/**
 * 导入机场数据到Place表
 * 
 * 数据来源：
 * 1. FlightPriceDetail表中的机场信息（已有坐标）
 * 2. Google Places API（通过airport类型搜索）
 * 
 * 使用方法：
 * npm run import:airports
 * 或
 * ts-node --project tsconfig.backend.json scripts/import-airports.ts
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface AirportData {
  name: string;
  nameCN?: string;
  nameEN?: string;
  iataCode?: string; // 如 PEK, JFK
  icaoCode?: string; // 如 ZBAA, KJFK
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
  address?: string;
}

/**
 * 从FlightPriceDetail表提取机场数据
 */
async function extractAirportsFromFlightPrices(): Promise<AirportData[]> {
  console.log('📊 从FlightPriceDetail表提取机场数据...');
  
  const airports = new Map<string, AirportData>();
  
  // 提取出发机场
  const originAirports = await prisma.$queryRaw<Array<{
    airport: string;
    lat: number;
    lng: number;
  }>>`
    SELECT DISTINCT 
      "originAirport" as airport,
      "originAirportLatitude" as lat,
      "originAirportLongitude" as lng
    FROM "FlightPriceDetail"
    WHERE "originAirport" IS NOT NULL 
      AND "originAirportLatitude" IS NOT NULL 
      AND "originAirportLongitude" IS NOT NULL
  `;
  
  // 提取到达机场
  const destAirports = await prisma.$queryRaw<Array<{
    airport: string;
    lat: number;
    lng: number;
  }>>`
    SELECT DISTINCT 
      "destinationAirport" as airport,
      "destinationAirportLatitude" as lat,
      "destinationAirportLongitude" as lng
    FROM "FlightPriceDetail"
    WHERE "destinationAirport" IS NOT NULL 
      AND "destinationAirportLatitude" IS NOT NULL 
      AND "destinationAirportLongitude" IS NOT NULL
  `;
  
  // 合并并去重
  [...originAirports, ...destAirports].forEach(({ airport, lat, lng }) => {
    if (airport && lat && lng) {
      airports.set(airport, {
        name: airport,
        lat: Number(lat),
        lng: Number(lng),
      });
    }
  });
  
  console.log(`✅ 找到 ${airports.size} 个不重复的机场`);
  return Array.from(airports.values());
}

/**
 * 解析机场名称，提取IATA代码等信息
 */
function parseAirportName(name: string): {
  cleanName: string;
  iataCode?: string;
  nameCN?: string;
  nameEN?: string;
} {
  // 尝试提取IATA代码（如 "北京首都国际机场 (PEK)"）
  const iataMatch = name.match(/([A-Z]{3})\)?\s*$/);
  const iataCode = iataMatch ? iataMatch[1] : undefined;
  
  // 清理名称（移除IATA代码）
  const cleanName = name.replace(/\s*\(?[A-Z]{3}\)?\s*$/, '').trim();
  
  // 检查是否有中英文分隔
  const parts = cleanName.split(/[|/]/);
  if (parts.length >= 2) {
    return {
      cleanName: parts[0].trim(),
      nameCN: parts[0].trim(),
      nameEN: parts[1].trim(),
      iataCode,
    };
  }
  
  // 检查是否主要是中文
  const isChinese = /[\u4e00-\u9fa5]/.test(cleanName);
  
  return {
    cleanName,
    nameCN: isChinese ? cleanName : undefined,
    nameEN: !isChinese ? cleanName : undefined,
    iataCode,
  };
}

/**
 * 导入单个机场到Place表
 */
async function importAirport(airport: AirportData): Promise<{ success: boolean; placeId?: number; error?: string }> {
  try {
    const { name, lat, lng } = airport;
    const parsed = parseAirportName(name);
    
    // 检查是否已存在（通过名称和坐标）
    const existing = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Place"
      WHERE category::text = ${'TRANSIT_HUB'}
        AND (
          "nameCN" = ${parsed.cleanName}
          OR "nameEN" = ${parsed.cleanName}
          OR (
            ST_Distance(
              location::geography,
              ST_MakePoint(${lng}, ${lat})::geography
            ) < 1000
          )
        )
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      return { success: false, placeId: existing[0].id, error: '已存在' };
    }
    
    // 创建Place记录
    const place = await prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: parsed.nameCN || parsed.cleanName,
        nameEN: parsed.nameEN || undefined,
        category: PlaceCategory.TRANSIT_HUB,
        address: airport.address || undefined,
        metadata: {
          airport: true,
          iataCode: parsed.iataCode,
          icaoCode: airport.icaoCode,
          city: airport.city,
          countryCode: airport.countryCode,
        } as any,
        physicalMetadata: {
          // 机场通常是大型建筑，需要一定步行
          terrain_type: 'FLAT',
          seated_ratio: 0.8, // 机场大部分时间坐着（等待）
          intensity_factor: 0.5, // 低强度
        } as any,
        updatedAt: new Date(),
      } as any,
    });
    
    // 更新地理位置
    await prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${place.id}
    `;
    
    return { success: true, placeId: place.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始导入机场数据...\n');
  
  try {
    // 1. 从FlightPriceDetail提取机场
    const airports = await extractAirportsFromFlightPrices();
    
    if (airports.length === 0) {
      console.log('⚠️  未找到机场数据');
      return;
    }
    
    // 2. 导入每个机场
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    console.log(`\n开始导入 ${airports.length} 个机场...\n`);
    
    for (let i = 0; i < airports.length; i++) {
      const airport = airports[i];
      const result = await importAirport(airport);
      
      if (result.success) {
        successCount++;
        console.log(`✅ [${i + 1}/${airports.length}] ${airport.name} (ID: ${result.placeId})`);
      } else if (result.error === '已存在') {
        skippedCount++;
        console.log(`⏭️  [${i + 1}/${airports.length}] ${airport.name} (已存在, ID: ${result.placeId})`);
      } else {
        errorCount++;
        console.error(`❌ [${i + 1}/${airports.length}] ${airport.name} - ${result.error}`);
      }
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

// 运行
if (require.main === module) {
  main();
}

