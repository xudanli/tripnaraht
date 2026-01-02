// scripts/import-poi-generic.ts
// 通用 POI 导入脚本（支持瑞士、挪威、秘鲁等国家）
// 使用 Overpass API 从 OSM 抓取 POI 数据

import { PrismaClient, Prisma } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface RegionSeed {
  region_key: string;
  name: string;
  name_en: string;
  description: string;
  seed: { lat: number; lng: number };
  radius_km: number;
  scenario: string;
  priority: number;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * 基础 Overpass Profile（通用 POI 类型）
 */
const BASE_OVERPASS_PROFILES = [
  {
    name: 'A',
    description: 'Transport & Infrastructure',
    tags: [
      'amenity=parking',
      'amenity=fuel',
      'amenity=charging_station',
      'public_transport=station',
      'railway=station',
      'aeroway=aerodrome',
    ],
  },
  {
    name: 'B',
    description: 'Accommodation & Services',
    tags: [
      'tourism=hotel',
      'tourism=hostel',
      'tourism=camp_site',
      'amenity=hospital',
      'amenity=pharmacy',
      'amenity=bank',
      'amenity=atm',
      'shop=supermarket',
    ],
  },
  {
    name: 'C',
    description: 'Attractions & Activities',
    tags: [
      'tourism=attraction',
      'tourism=viewpoint',
      'tourism=museum',
      'tourism=artwork',
      'historic=*',
      'natural=*',
      'leisure=*',
    ],
  },
  {
    name: 'D',
    description: 'Food & Dining',
    tags: [
      'amenity=restaurant',
      'amenity=cafe',
      'amenity=fast_food',
      'amenity=bar',
      'amenity=pub',
    ],
  },
];

/**
 * 构建 Overpass 查询
 */
function buildOverpassQuery(
  profile: { name: string; tags: string[] },
  lat: number,
  lng: number,
  radiusMeters: number
): string {
  // 构建标签过滤器
  const tagFilters: string[] = [];
  
  for (const tag of profile.tags) {
    if (tag.includes('=')) {
      const [key, value] = tag.split('=');
      if (value === '*') {
        // 支持通配符，如 historic=*
        tagFilters.push(`["${key}"]`);
      } else {
        tagFilters.push(`["${key}"="${value}"]`);
      }
    } else {
      tagFilters.push(`["${tag}"]`);
    }
  }
  
  // 为每个标签创建查询，使用 nwr (node, way, relation) 简写
  const queries = tagFilters.map(filter => 
    `  nwr${filter}(around:${radiusMeters},${lat},${lng});`
  ).join('\n');

  return `
[out:json][timeout:180];
(
${queries}
);
out center tags;
`.trim();
}

/**
 * 调用 Overpass API
 */
async function fetchFromOverpass(query: string, maxRetries: number = 3): Promise<OverpassElement[]> {
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 发送 Overpass 查询... (尝试 ${attempt}/${maxRetries})`);
      const response = await axios.post<OverpassResponse>(
        overpassUrl,
        `data=${encodeURIComponent(query)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 200000,
        }
      );
      
      return response.data.elements || [];
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isTimeout = error.code === 'ECONNABORTED' || error.response?.status === 504;
      
      if (isLastAttempt) {
        console.error(`❌ Overpass API 错误 (已重试 ${maxRetries} 次): ${error.message}`);
        throw error;
      }
      
      if (isTimeout) {
        const waitTime = attempt * 10;
        console.log(`⏳ Overpass API 超时，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      } else {
        const waitTime = attempt * 5;
        console.log(`⏳ Overpass API 错误，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }
    }
  }
  
  return [];
}

/**
 * 将 OSM 标签映射为 PlaceCategory
 */
function mapCategory(tags: Record<string, string>): string {
  // 住宿
  if (tags.tourism === 'hotel' || tags.tourism === 'hostel' || tags.tourism === 'camp_site') {
    return 'HOTEL';
  }
  
  // 餐厅
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food' || tags.amenity === 'bar' || tags.amenity === 'pub') {
    return 'RESTAURANT';
  }
  
  // 景点
  if (tags.tourism === 'attraction' || tags.tourism === 'viewpoint' || tags.tourism === 'museum' || tags.historic || tags.natural) {
    return 'ATTRACTION';
  }
  
  // 购物
  if (tags.shop) {
    return 'SHOPPING';
  }
  
  // 交通
  if (tags.amenity === 'parking' || tags.public_transport || tags.railway || tags.aeroway) {
    return 'TRANSIT_HUB';
  }
  
  // 默认
  return 'ATTRACTION';
}

/**
 * 转换为 Place 数据
 */
function convertToPlace(
  element: OverpassElement,
  regionKey: string,
  profileName: string,
  countryCode: string
): {
  osmId: number;
  osmType: string;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  category: string;
  rawTags: Record<string, string>;
} {
  const isArea = !!element.center;
  const lat = isArea ? element.center!.lat : element.lat!;
  const lng = isArea ? element.center!.lon : element.lon!;
  
  const tags = element.tags || {};
  const name = tags.name || tags['name:en'] || tags['name:zh'] || 'Unnamed place';
  const nameEN = tags['name:en'] || tags.name;
  const nameCN = tags['name:zh'] || tags['name:zh-CN'] || tags.name;
  
  const category = mapCategory(tags);
  
  return {
    osmId: element.id,
    osmType: element.type,
    name: nameCN || name,
    nameEN: nameEN && nameEN !== nameCN ? nameEN : undefined,
    lat,
    lng,
    category,
    rawTags: {
      ...tags,
      profile: profileName,
      source: 'OSM',
      region: regionKey,
      countryCode,
    },
  };
}

/**
 * 根据坐标找到最近的城市
 */
async function findNearestCityByLocation(
  lat: number,
  lng: number,
  countryCode: string
): Promise<number | null> {
  try {
    const nearestCity = await prisma.$queryRaw<Array<{ id: number; distance: number }>>`
      SELECT 
        id,
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance
      FROM "City"
      WHERE location IS NOT NULL
        AND "countryCode" = ${countryCode}
      ORDER BY location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geometry
      LIMIT 1
    `;
    
    if (nearestCity.length > 0) {
      const maxDistance = countryCode === 'IS' ? 200000 : 150000; // 冰岛 200km，其他 150km
      if (nearestCity[0].distance < maxDistance) {
        return nearestCity[0].id;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error(`查找最近城市失败: ${error.message}`);
    return null;
  }
}

/**
 * 导入单个 region 的单个 profile
 */
async function importRegionProfile(
  region: RegionSeed,
  profile: { name: string; description: string; tags: string[] },
  countryCode: string
): Promise<{ created: number; skipped: number; errors: number }> {
  console.log(`\n📍 处理 Region: ${region.region_key} (${region.name})`);
  console.log(`📋 Profile: ${profile.name} - ${profile.description}`);
  
  const radiusMeters = region.radius_km * 1000;
  const query = buildOverpassQuery(profile, region.seed.lat, region.seed.lng, radiusMeters);
  
  // 调用 Overpass API
  const elements = await fetchFromOverpass(query);
  console.log(`✅ 获取到 ${elements.length} 个 POI`);
  
  if (elements.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 转换为 Place 数据
  const places = elements.map(el => convertToPlace(el, region.region_key, profile.name, countryCode));
  
  if (places.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 批量检查已存在的 POI
  const CHECK_BATCH_SIZE = 1000;
  const existingOsmIdSet = new Set<string>();
  
  for (let i = 0; i < places.length; i += CHECK_BATCH_SIZE) {
    const batch = places.slice(i, i + CHECK_BATCH_SIZE);
    const osmIds = batch.map(p => p.osmId.toString());
    
    const existingOsmIds = await prisma.$queryRaw<Array<{ osmId: string }>>`
      SELECT DISTINCT metadata->>'osmId' as "osmId"
      FROM "Place"
      WHERE metadata->>'osmId' = ANY(${osmIds})
    `;
    
    existingOsmIds.forEach(e => existingOsmIdSet.add(e.osmId));
  }
  
  const newPlaces = places.filter(p => !existingOsmIdSet.has(p.osmId.toString()));
  let skipped = places.length - newPlaces.length;
  
  if (newPlaces.length === 0) {
    console.log(`  ✅ 创建: 0, ⏭️  跳过: ${skipped}, ❌ 错误: 0`);
    return { created: 0, skipped, errors: 0 };
  }
  
  // 查找 region 对应的城市（一次性查找）
  const regionCityId = await findNearestCityByLocation(region.seed.lat, region.seed.lng, countryCode);
  if (regionCityId) {
    console.log(`  🏙️  匹配到城市 (cityId: ${regionCityId})`);
  }
  
  // 批量插入
  const BATCH_SIZE = 50;
  let created = 0;
  let errors = 0;
  
  for (let i = 0; i < newPlaces.length; i += BATCH_SIZE) {
    const batch = newPlaces.slice(i, i + BATCH_SIZE);
    
    for (const place of batch) {
      try {
        const metadata = {
          osmId: place.osmId,
          osmType: place.osmType,
          regionKey: region.region_key,
          profile: profile.name,
          rawTags: place.rawTags,
          source: 'OSM',
          countryCode,
        };
        
        await prisma.$executeRaw`
          INSERT INTO "Place" (
            uuid, "nameCN", "nameEN", category, location, "cityId", metadata, "createdAt", "updatedAt"
          )
          VALUES (
            gen_random_uuid()::text,
            ${place.name},
            ${place.nameEN || null},
            ${place.category}::"PlaceCategory",
            ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326),
            ${regionCityId || null},
            ${JSON.stringify(metadata)}::jsonb,
            NOW(),
            NOW()
          )
        `;
        created++;
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (
          error.code === 'P2002' || 
          errorMsg.includes('unique constraint') || 
          errorMsg.includes('duplicate key')
        ) {
          skipped++;
        } else {
          console.error(`❌ 插入 POI 失败: ${error.message}`);
          errors++;
        }
      }
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= newPlaces.length) {
      console.log(`  📊 进度: ${Math.min(i + BATCH_SIZE, newPlaces.length)}/${newPlaces.length} (创建: ${created}, 错误: ${errors})`);
    }
  }
  
  console.log(`  ✅ 创建: ${created}, ⏭️  跳过: ${skipped}, ❌ 错误: ${errors}`);
  return { created, skipped, errors };
}

/**
 * 主要导入函数
 */
async function importPOI(
  countryCode: string,
  regions: RegionSeed[],
  profiles: Array<{ name: string; description: string; tags: string[] }> = BASE_OVERPASS_PROFILES
) {
  try {
    console.log(`\n开始导入 ${countryCode} 的 POI 数据...`);
    console.log(`Regions: ${regions.length} 个`);
    console.log(`Profiles: ${profiles.length} 个\n`);
    
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    // 串行处理每个 region 和 profile（避免 Overpass API 速率限制）
    for (const region of regions) {
      for (const profile of profiles) {
        const result = await importRegionProfile(region, profile, countryCode);
        totalCreated += result.created;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        // 每个请求之间稍作延迟，避免速率限制
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n=== 完成 ===`);
    console.log(`总计 - 创建: ${totalCreated}, 跳过: ${totalSkipped}, 错误: ${totalErrors}`);
    
  } catch (error: any) {
    console.error('导入失败:', error.message);
    throw error;
  }
}

// 导出函数供其他脚本使用
export { importPOI, BASE_OVERPASS_PROFILES, type RegionSeed };

// 如果直接运行此脚本，需要提供配置
if (require.main === module) {
  console.log('此脚本需要配合具体的国家配置文件使用');
  console.log('请参考 import-iceland-poi.ts 或 import-nepal-poi.ts 的用法');
  process.exit(1);
}

