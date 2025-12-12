import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

dotenv.config();

const prisma = new PrismaClient();

// 高德地图API配置
const AMAP_API_KEY = process.env.AMAP_API_KEY || '';
const AMAP_BASE_URL = 'https://restapi.amap.com/v3';

/**
 * 简化景点名称（去除地区前缀等）
 */
function simplifyName(name: string): string {
  // 去除地区前缀
  let simplified = name
    .replace(/^北京市?/, '')
    .replace(/^北京/, '')
    .replace(/^.*?区/, '')
    .replace(/^.*?市/, '')
    .replace(/^.*?县/, '')
    .trim();
  
  // 去除后缀
  simplified = simplified
    .replace(/景区$/, '')
    .replace(/旅游区$/, '')
    .replace(/旅游景点$/, '')
    .replace(/景点$/, '')
    .trim();
  
  return simplified || name;
}

/**
 * 使用高德地图API搜索POI
 */
async function searchPOI(name: string, city?: string, lat?: number, lng?: number): Promise<any | null> {
  if (!AMAP_API_KEY) {
    console.log('⚠️  高德地图 API Key 未配置');
    return null;
  }

  // 策略1: 使用原始名称搜索
  let poi = await trySearchPOI(name, city, lat, lng);
  if (poi) return poi;

  // 策略2: 使用简化名称搜索
  const simplifiedName = simplifyName(name);
  if (simplifiedName !== name) {
    poi = await trySearchPOI(simplifiedName, city, lat, lng);
    if (poi) return poi;
  }

  // 策略3: 如果名称包含"景区"，尝试去除后搜索
  if (name.includes('景区')) {
    const withoutSuffix = name.replace(/景区$/, '').trim();
    poi = await trySearchPOI(withoutSuffix, city, lat, lng);
    if (poi) return poi;
  }

  return null;
}

/**
 * 尝试搜索POI（内部方法）
 */
async function trySearchPOI(name: string, city?: string, lat?: number, lng?: number): Promise<any | null> {
  try {
    const params: any = {
      key: AMAP_API_KEY,
      keywords: name,
      types: '110000', // 风景名胜
      city: city || '北京',
      citylimit: 'true',
      offset: 1,
      page: 1,
      extensions: 'all',
    };

    // 如果有坐标，使用坐标搜索（更精确）
    if (lat && lng) {
      params.location = `${lng},${lat}`;
      params.radius = 5000; // 5km半径
    }

    const response = await axios.get(`${AMAP_BASE_URL}/place/text`, { params, timeout: 10000 });
    
    if (response.data.status === '1' && response.data.pois && response.data.pois.length > 0) {
      // 如果有坐标，优先选择距离最近的
      if (lat && lng) {
        const pois = response.data.pois;
        // 计算距离并排序
        const poisWithDistance = pois.map((p: any) => {
          const poiLat = parseFloat(p.location.split(',')[1]);
          const poiLng = parseFloat(p.location.split(',')[0]);
          const distance = Math.sqrt(
            Math.pow(poiLat - lat, 2) + Math.pow(poiLng - lng, 2)
          ) * 111; // 粗略转换为km
          return { ...p, distance };
        });
        poisWithDistance.sort((a: any, b: any) => a.distance - b.distance);
        return poisWithDistance[0];
      }
      return response.data.pois[0]; // 返回第一个匹配结果
    }
    
    return null;
  } catch (error: any) {
    return null;
  }
}

/**
 * 获取POI详细信息
 */
async function getPOIDetail(poiId: string): Promise<any | null> {
  if (!AMAP_API_KEY) {
    return null;
  }

  try {
    const params = {
      key: AMAP_API_KEY,
      id: poiId,
      extensions: 'all',
    };

    const response = await axios.get(`${AMAP_BASE_URL}/place/detail`, { params, timeout: 10000 });
    
    if (response.data.status === '1' && response.data.pois && response.data.pois.length > 0) {
      return response.data.pois[0];
    }
    
    return null;
  } catch (error: any) {
    console.error(`   ❌ 获取POI详情失败: ${error.message}`);
    return null;
  }
}

/**
 * 解析高德地图POI数据
 */
function parseAmapData(poi: any): {
  phone?: string;
  openingHours?: string;
  ticketPrice?: string;
  address?: string;
  website?: string;
} {
  const result: any = {};

  // 电话
  if (poi.tel) {
    result.phone = poi.tel;
  }

  // 地址
  if (poi.address) {
    result.address = poi.address;
  }

  // 网站
  if (poi.website) {
    result.website = poi.website;
  }

  // 开放时间（从detail_info中提取）
  if (poi.business_area) {
    // 尝试从business_area提取
  }

  // 从detail_info提取详细信息
  if (poi.detail_info) {
    const detail = poi.detail_info;
    
    // 开放时间
    if (detail.opentime) {
      result.openingHours = detail.opentime;
    } else if (detail.open_time) {
      result.openingHours = detail.open_time;
    }

    // 门票价格
    if (detail.cost) {
      result.ticketPrice = detail.cost;
    } else if (detail.price) {
      result.ticketPrice = detail.price;
    }
  }

  // 从indoor_map中提取
  if (poi.indoor_map) {
    const indoor = poi.indoor_map;
    if (indoor.opentime) {
      result.openingHours = indoor.opentime;
    }
  }

  return result;
}

/**
 * 从高德地图补充景点详细信息
 */
async function enrichAttractionFromAmap(placeId: number, name: string, city?: string): Promise<boolean> {
  try {
    // 获取地点信息（包括坐标）
    const place = await prisma.place.findUnique({
      where: { id: placeId },
    });

    if (!place) {
      console.log(`   ❌ 地点不存在: ${name} (ID: ${placeId})`);
      return false;
    }

    // 检查是否已有详细信息
    const metadata = (place.metadata as any) || {};
    if (metadata.phone || metadata.openingHours || metadata.ticketPrice) {
      console.log(`   ⏭️  已有详细信息，跳过: ${name}`);
      return true;
    }

    // 提取坐标
    let lat: number | undefined;
    let lng: number | undefined;
    if ((place as any).location) {
      const location = (place as any).location;
      // PostGIS POINT格式: POINT(lng lat)
      const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        lng = parseFloat(match[1]);
        lat = parseFloat(match[2]);
      }
    }

    // 搜索POI
    const poi = await searchPOI(name, city, lat, lng);
    if (!poi) {
      console.log(`   ⚠️  未找到POI: ${name}`);
      return false;
    }

    // 获取详细信息
    let detailPoi = poi;
    if (poi.id) {
      const detail = await getPOIDetail(poi.id);
      if (detail) {
        detailPoi = detail;
      }
    }

    // 解析数据
    const amapData = parseAmapData(detailPoi);

    // 更新metadata
    const updatedMetadata = {
      ...metadata,
      ...amapData,
      amapId: poi.id,
      amapSource: 'amap',
      enrichedAt: new Date().toISOString(),
    };

    // 更新地址（如果高德地图的地址更详细）
    const updateData: any = {
      metadata: updatedMetadata as any,
      updatedAt: new Date(),
    };

    if (amapData.address && (!place.address || place.address.length < amapData.address.length)) {
      updateData.address = amapData.address;
    }

    await prisma.place.update({
      where: { id: placeId },
      data: updateData,
    });

    const details = [];
    if (amapData.phone) details.push('电话');
    if (amapData.openingHours) details.push('开放时间');
    if (amapData.ticketPrice) details.push('门票');
    if (amapData.website) details.push('网站');

    console.log(`   ✅ 更新成功: ${name} (${details.join(', ')})`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ 更新失败: ${name} - ${error.message}`);
    return false;
  }
}

/**
 * 批量补充景点信息
 */
async function enrichAttractions(city?: string, limit?: number) {
  console.log('🚀 开始从高德地图补充景点详细信息...\n');

  if (!AMAP_API_KEY) {
    console.error('❌ 高德地图 API Key 未配置，请在 .env 文件中设置 AMAP_API_KEY');
    return;
  }

  // 查询需要补充信息的景点
  const where: any = {
    category: 'ATTRACTION',
  };

  if (city) {
    where.OR = [
      { address: { contains: city } },
      { nameCN: { contains: city } },
    ];
  }

  // 优先处理常见景点
  const commonAttractions = ['故宫', '天安门', '颐和园', '天坛', '圆明园', '景山公园', '北海公园', '长城', '雍和宫', '恭王府'];
  
  const places = await prisma.place.findMany({
    where,
    select: {
      id: true,
      nameCN: true,
      address: true,
      metadata: true,
    },
    take: limit || 50,
    orderBy: [
      // 优先处理常见景点
      { nameCN: 'asc' },
    ],
  });

  // 按常见景点优先排序
  places.sort((a, b) => {
    const aIndex = commonAttractions.indexOf(a.nameCN);
    const bIndex = commonAttractions.indexOf(b.nameCN);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.nameCN.localeCompare(b.nameCN);
  });

  console.log(`📊 找到 ${places.length} 个景点需要补充信息\n`);
  console.log('━'.repeat(60));

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    console.log(`[${i + 1}/${places.length}] 📍 ${place.nameCN}`);

    // 检查是否已有详细信息
    const metadata = (place.metadata as any) || {};
    if (metadata.phone || metadata.openingHours || metadata.ticketPrice) {
      console.log(`   ⏭️  已有详细信息，跳过`);
      skipCount++;
      continue;
    }

    const success = await enrichAttractionFromAmap(place.id, place.nameCN, city);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // 延迟，避免API限流
    if (i < places.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms延迟
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log('📊 补充统计:');
  console.log(`   成功: ${successCount}`);
  console.log(`   跳过: ${skipCount}`);
  console.log(`   失败: ${failCount}`);
  console.log('━'.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const city = args[0] || '北京';
  const limit = args[1] ? parseInt(args[1], 10) : undefined;

  await enrichAttractions(city, limit);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
