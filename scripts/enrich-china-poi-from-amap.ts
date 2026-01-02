#!/usr/bin/env ts-node
/**
 * 从高德地图 API 填充中国地区 POI 的营业时间、门票等字段
 * 
 * 功能：
 * 1. 查询所有中国地区的 POI（通过 countryCode = 'CN' 或 City.countryCode = 'CN'）
 * 2. 调用高德地图 API 获取详细信息（营业时间、门票、联系方式等）
 * 3. 更新 Place 表的 metadata 字段
 * 
 * 使用方法:
 *   AMAP_API_KEY=your_api_key npm run enrich:china-amap
 * 
 * 或者：
 *   npx ts-node --project tsconfig.backend.json scripts/enrich-china-poi-from-amap.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();

// 高德地图 API 配置
// 使用搜索POI 2.0接口（v5版本）
const AMAP_API_KEY = process.env.AMAP_API_KEY;
const AMAP_BASE_URL = 'https://restapi.amap.com/v5';

if (!AMAP_API_KEY) {
  console.error('❌ 错误: AMAP_API_KEY 环境变量未设置');
  console.error('请设置环境变量: export AMAP_API_KEY=your_api_key');
  process.exit(1);
}

// 创建 axios 实例
const axiosInstance: AxiosInstance = axios.create({
  timeout: 10000,
  params: {
    key: AMAP_API_KEY,
  },
});

/**
 * 查询中国地区的 POI
 */
async function getChinaPois(forceUpdate: boolean = false) {
  const whereClause = forceUpdate
    ? ''
    : `AND (metadata->'openingHours' IS NULL OR metadata->>'ticketPrice' IS NULL)`;

  const query = `
    SELECT 
      id,
      "nameCN",
      "nameEN",
      category::text as category,
      metadata,
      address,
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "Place"
    WHERE 
      location IS NOT NULL
      AND "nameCN" IS NOT NULL
      AND "nameCN" != ''
      AND (
        -- 通过 countryCode 识别
        metadata->>'countryCode' = 'CN'
        -- 或者通过坐标范围识别（中国大致范围：18-54°N, 73-135°E）
        OR (ST_Y(location::geometry) BETWEEN 18 AND 54
            AND ST_X(location::geometry) BETWEEN 73 AND 135
            AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' NOT IN ('NP', 'NZ', 'IS'))
            AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
            AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NZ_%'))
        -- 或者通过 City 关联识别
        OR EXISTS (
          SELECT 1 FROM "City" c 
          WHERE c.id = "Place"."cityId" 
          AND c."countryCode" = 'CN'
        )
      )
      ${whereClause}
    ORDER BY id
  `;

  const pois = await prisma.$queryRawUnsafe<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
    metadata: any;
    address: string | null;
    lat: number;
    lng: number;
  }>>(query);

  return pois;
}

/**
 * 搜索 POI（根据名称和坐标）
 */
async function searchPOI(name: string, lat: number, lng: number): Promise<any | null> {
  try {
    // 简化名称（去除括号内容、标点等）
    const simplifiedName = simplifyName(name);
    
    const params = {
      keywords: simplifiedName,
      location: `${lng},${lat}`,
      radius: 500, // 搜索半径 500 米
      offset: 5,
      page: 1,
      extensions: 'all', // all: 返回详细信息（包含营业时间）
      business: '1', // 返回商业信息（包含营业时间）
    };

    const response = await axiosInstance.get(`${AMAP_BASE_URL}/place/text`, { params });
    const data = response.data;

    if (data.status === '1' && data.pois && data.pois.length > 0) {
      // 返回第一个结果（最匹配的）
      return data.pois[0];
    }

    return null;
  } catch (error: any) {
    console.error(`搜索 POI 失败: ${name} - ${error.message}`);
    return null;
  }
}

/**
 * 获取 POI 详情
 */
async function getPOIDetail(poiId: string): Promise<any | null> {
  try {
    // 使用搜索POI 2.0接口（v5版本）的ID搜索
    // ID搜索：通过已知的地点 ID（POI ID）搜索对应地点信息
    const params = {
      id: poiId,
      extensions: 'all', // 返回所有详细信息
      business: '1', // 返回商业信息（包含营业时间 opentime_week, opentime_today）
    };

    const response = await axiosInstance.get(`${AMAP_BASE_URL}/place/detail`, { params });
    const data = response.data;

    // 调试：检查API响应状态
    if (!(global as any).__amap_api_status_logged) {
      console.log(`\n🔍 调试: API响应状态: status=${data.status}, info=${data.info || 'N/A'}`);
      if (data.status !== '1') {
        console.log(`⚠️  API错误: ${JSON.stringify(data)}`);
      }
      (global as any).__amap_api_status_logged = true;
    }

    if (data.status === '1' && data.pois && data.pois.length > 0) {
      const poi = data.pois[0];
      // 调试：打印详情接口返回的字段（只打印一次）
      if (!(global as any).__amap_detail_debug_logged) {
        console.log(`\n🔍 调试: v5详情接口返回的POI字段:`, Object.keys(poi).join(', '));
        if (poi.business) {
          console.log(`🔍 调试: business对象字段:`, Object.keys(poi.business).join(', '));
          console.log(`🔍 调试: business对象内容:`, JSON.stringify(poi.business).substring(0, 200));
        }
        // 检查营业时间相关字段
        if (poi.opentime_week) console.log(`🔍 调试: opentime_week = ${poi.opentime_week}`);
        if (poi.opentime_today) console.log(`🔍 调试: opentime_today = ${poi.opentime_today}`);
        if (poi.business?.opentime_week) console.log(`🔍 调试: business.opentime_week = ${poi.business.opentime_week}`);
        if (poi.business?.opentime_today) console.log(`🔍 调试: business.opentime_today = ${poi.business.opentime_today}`);
        // 打印完整的POI对象（前500字符）用于调试
        console.log(`🔍 调试: POI完整数据（前500字符）:`, JSON.stringify(poi).substring(0, 500));
        (global as any).__amap_detail_debug_logged = true;
      }
      return poi;
    }

    return null;
  } catch (error: any) {
    console.error(`获取 POI 详情失败: ${poiId} - ${error.message}`);
    return null;
  }
}

/**
 * 简化 POI 名称（去除括号、标点等）
 */
function simplifyName(name: string): string {
  let simplified = name;
  
  // 去除括号及其内容
  simplified = simplified.replace(/[（(].*?[）)]/g, '');
  
  // 去除特殊字符（保留中文、英文、数字）
  simplified = simplified.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '');
  
  // 去除多余空格
  simplified = simplified.replace(/\s+/g, ' ').trim();
  
  // 去除开头的空格和标点
  simplified = simplified.replace(/^[\s、，,]+/, '');

  return simplified || name;
}

/**
 * 解析开放时间字符串为结构化格式
 */
function parseOpeningHours(businessTime: string): any {
  if (!businessTime) return undefined;

  const result: any = {};

  // 处理"全天开放"
  if (businessTime.includes('全天') || businessTime.includes('24小时') || businessTime.includes('24/7')) {
    result.alwaysOpen = true;
    return result;
  }

  // 处理"周一至周五"格式（高德 API 常见格式，可能包含括号内容）
  const weekdayMatch = businessTime.match(/周一至周五[：:]([^；;()]+)/);
  if (weekdayMatch) {
    const timeRange = parseTimeRange(weekdayMatch[1].split('(')[0].trim()); // 去除括号内容
    if (timeRange) {
      result.weekday = timeRange;
      // 也可以解析为 mon-fri
      result.mon = `${timeRange.open}-${timeRange.close}`;
      result.tue = `${timeRange.open}-${timeRange.close}`;
      result.wed = `${timeRange.open}-${timeRange.close}`;
      result.thu = `${timeRange.open}-${timeRange.close}`;
      result.fri = `${timeRange.open}-${timeRange.close}`;
    }
  }

  // 处理"周六"格式
  const saturdayMatch = businessTime.match(/周六[^：:]*[：:]([^；;()]+)/);
  if (saturdayMatch) {
    const timeRange = parseTimeRange(saturdayMatch[1].split('(')[0].trim());
    if (timeRange) {
      result.saturday = timeRange;
      result.sat = `${timeRange.open}-${timeRange.close}`;
    }
  }

  // 处理"周日"格式
  const sundayMatch = businessTime.match(/周日[^：:]*[：:]([^；;()]+)/);
  if (sundayMatch) {
    const timeRange = parseTimeRange(sundayMatch[1].split('(')[0].trim());
    if (timeRange) {
      result.sunday = timeRange;
      result.sun = `${timeRange.open}-${timeRange.close}`;
    }
  }

  // 处理 opentime_today 格式（多个时间段，如 "08:30-17:30 08:30-09:00 12:00-13:30"）
  // 如果没有匹配到特定格式，尝试解析为统一时间或多个时间段
  if (!result.weekday && !result.saturday && !result.sunday) {
    // 尝试解析多个时间段（空格分隔）
    const timeSlots = businessTime.split(/\s+/).filter(s => s.match(/\d{1,2}:\d{2}/));
    if (timeSlots.length > 0) {
      // 取第一个时间段作为主要营业时间
      const timeRange = parseTimeRange(timeSlots[0]);
      if (timeRange) {
        result.uniform = timeRange;
      }
    } else {
      // 尝试解析单个时间段
      const timeRange = parseTimeRange(businessTime);
      if (timeRange) {
        result.uniform = timeRange;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 解析时间范围（如 "08:30-17:30"）
 */
function parseTimeRange(timeStr: string): { open: string; close: string } | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})/);
  if (match) {
    return {
      open: `${match[1].padStart(2, '0')}:${match[2]}`,
      close: `${match[3].padStart(2, '0')}:${match[4]}`,
    };
  }
  return null;
}

/**
 * 解析门票价格字符串为结构化格式
 */
function parseTicketPrice(cost: string): any {
  if (!cost) return undefined;

  const result: any = {};

  // 处理"免费"
  if (cost.includes('免费') || cost.includes('0元')) {
    result.free = true;
    return result;
  }

  // 提取价格数字
  const priceMatch = cost.match(/(\d+(?:\.\d+)?)\s*元/);
  if (priceMatch) {
    result.basePrice = parseFloat(priceMatch[1]);
    result.currency = 'CNY';
  }

  // 解析成人票
  const adultMatch = cost.match(/成人[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
  if (adultMatch) {
    result.adult = parseFloat(adultMatch[1]);
  } else if (result.basePrice) {
    result.adult = result.basePrice;
  }

  // 解析儿童票
  const childMatch = cost.match(/儿童[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
  if (childMatch) {
    result.child = parseFloat(childMatch[1]);
  }

  // 解析学生票
  const studentMatch = cost.match(/学生[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
  if (studentMatch) {
    result.student = parseFloat(studentMatch[1]);
  }

  // 解析老人票/优惠票
  const seniorMatch = cost.match(/(老人|长者|优惠)[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
  if (seniorMatch) {
    result.senior = parseFloat(seniorMatch[2]);
  }

  // 保存原始字符串
  result.raw = cost;

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 解析详情结果
 */
function parseDetailResult(poi: any): {
  openingHours?: string;
  openingHoursStructured?: any;
  ticketPrice?: string;
  ticketPriceStructured?: any;
  type?: string;
  highlights?: string[];
  amapId?: string;
  address?: string;
  tel?: string;
  website?: string;
  email?: string;
} {
  const result: any = {
    amapId: poi.id,
    address: poi.address,
    tel: poi.tel,
    website: poi.website,
    email: poi.email,
  };

  // 1. 开放时间（营业时间）
  // 高德 API 返回的字段：opentime_week（周营业时间）或 opentime_today（今日营业时间）
  // 这些字段可能在 business 对象中，也可能直接在 poi 对象中
  const business = poi.business || {};
  const openingHoursStr = poi.opentime_week || poi.opentime_today || business.opentime_week || business.opentime_today || poi.business_time;
  if (openingHoursStr) {
    result.openingHours = openingHoursStr;
    result.openingHoursStructured = parseOpeningHours(openingHoursStr);
    // 同时保存原始字段名，方便调试
    if (poi.opentime_week || business.opentime_week) {
      result.opentime_week = poi.opentime_week || business.opentime_week;
    }
    if (poi.opentime_today || business.opentime_today) {
      result.opentime_today = poi.opentime_today || business.opentime_today;
    }
  }

  // 2. 门票价格
  if (poi.cost) {
    result.ticketPrice = poi.cost;
    result.ticketPriceStructured = parseTicketPrice(poi.cost);
  }

  // 3. 类型
  if (poi.type) {
    result.type = poi.type;
  }

  // 4. 亮点（标签）
  if (poi.tag) {
    if (typeof poi.tag === 'string') {
      result.highlights = poi.tag.split(',').map((t: string) => t.trim()).filter(Boolean);
    } else if (Array.isArray(poi.tag)) {
      result.highlights = poi.tag;
    }
  }

  return result;
}

/**
 * 获取 POI 详细信息（搜索 + 详情）
 */
async function getPOIDetails(name: string, lat: number, lng: number): Promise<any | null> {
  try {
    // 步骤1: 搜索 POI
    const searchResult = await searchPOI(name, lat, lng);
    
    if (!searchResult || !searchResult.id) {
      return null;
    }

    // 步骤2: 获取 POI 详情
    const detailResult = await getPOIDetail(searchResult.id);
    
    if (!detailResult) {
      // 如果详情获取失败，返回搜索结果的简化信息
      return {
        amapId: searchResult.id,
        address: searchResult.address,
        tel: searchResult.tel,
        type: searchResult.type,
      };
    }

    // 步骤3: 解析并返回详细信息
    return parseDetailResult(detailResult);
  } catch (error: any) {
    console.error(`获取 POI 详情失败: ${name} (${lat}, ${lng}) - ${error.message}`);
    return null;
  }
}

/**
 * 批量处理 POI，从高德获取数据并更新
 */
async function enrichChinaPoisFromAmap() {
  console.log('📊 开始从高德地图填充中国地区 POI 数据...\n');

  // 检查 API Key
  if (!AMAP_API_KEY) {
    console.error('❌ 错误: AMAP_API_KEY 环境变量未设置');
    process.exit(1);
  }

  try {
    // 1. 查询所有中国地区的 POI
    console.log('🔍 查询中国地区的 POI...');
    const pois = await getChinaPois(false); // false = 只处理还没有 openingHours 或 ticketPrice 的
    console.log(`找到 ${pois.length} 个 POI\n`);

    if (pois.length === 0) {
      console.log('✅ 所有 POI 都已填充数据，无需处理');
      return;
    }

    // 2. 统计
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 3. 批量处理（每批 10 个，批次间延迟 200ms 避免限流）
    const batchSize = 10;
    const delayBetweenBatches = 200;

    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = pois.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (poi) => {
        try {
          // 调用高德 API 获取详细信息
          const poiData = await getPOIDetails(poi.nameCN, poi.lat, poi.lng);

          if (!poiData) {
            return { poi, success: false, reason: '未获取到数据' };
          }

          // 更新 metadata
          const currentMetadata = (poi.metadata as any) || {};
          
          // 清理地址：确保是字符串或 null，不能是空数组
          const cleanAddress = (addr: any): string | null => {
            if (!addr || (Array.isArray(addr) && addr.length === 0)) return null;
            if (typeof addr === 'string' && addr.trim()) return addr.trim();
            return null;
          };

          const newAddress = cleanAddress(poiData.address) || cleanAddress(poi.address) || null;
          
          const updatedMetadata: any = {
            ...currentMetadata,
            // 基础结构字段（新格式）
            basic: {
              ...currentMetadata.basic,
              // 开放时间（原始字符串 + 结构化）
              ...(poiData.openingHours && { openingHours: poiData.openingHours }),
              ...(poiData.openingHoursStructured && { openingHoursStructured: poiData.openingHoursStructured }),
              // 门票价格（原始字符串 + 结构化）
              ...(poiData.ticketPrice && { ticketPrice: poiData.ticketPrice }),
              ...(poiData.ticketPriceStructured && { ticketPriceStructured: poiData.ticketPriceStructured }),
              // 联系方式
              contact: {
                ...currentMetadata.basic?.contact,
                ...(poiData.tel && { phone: poiData.tel }),
                ...(poiData.email && { email: poiData.email }),
                ...(poiData.website && { website: poiData.website }),
              },
              // 官方网址
              ...(poiData.website && { officialWebsite: poiData.website }),
              // 类型
              ...(poiData.type && { type: poiData.type }),
            },
            // 向后兼容字段（保留旧格式）
            ...(poiData.openingHoursStructured && { openingHours: poiData.openingHoursStructured }),
            ...(poiData.ticketPrice && { ticketPrice: poiData.ticketPrice }),
            ...(poiData.type && { type: poiData.type }),
            ...(poiData.highlights && Array.isArray(poiData.highlights) && poiData.highlights.length > 0 && { highlights: poiData.highlights }),
            ...(poiData.amapId && { amapId: poiData.amapId }),
            contact: {
              ...currentMetadata.contact,
              ...(poiData.tel && { phone: poiData.tel }),
              ...(poiData.email && { email: poiData.email }),
              ...(poiData.website && { website: poiData.website }),
            },
            ...(newAddress && { address: newAddress }),
            countryCode: 'CN', // 确保 countryCode 是 CN
            timezone: currentMetadata.timezone || 'Asia/Shanghai',
            lastEnrichedAt: new Date().toISOString(),
          };

          // 清理 metadata 中的 undefined 值
          const cleanMetadata = (obj: any): any => {
            if (obj === null || obj === undefined) return undefined;
            if (Array.isArray(obj)) {
              return obj.length > 0 ? obj : undefined;
            }
            if (typeof obj === 'object') {
              const cleaned: any = {};
              for (const [key, value] of Object.entries(obj)) {
                const cleanedValue = cleanMetadata(value);
                if (cleanedValue !== undefined) {
                  cleaned[key] = cleanedValue;
                }
              }
              return Object.keys(cleaned).length > 0 ? cleaned : undefined;
            }
            return obj;
          };

          const cleanedMetadata = cleanMetadata(updatedMetadata);

          // 更新数据库
          await prisma.place.update({
            where: { id: poi.id },
            data: {
              metadata: cleanedMetadata as Prisma.InputJsonValue,
              ...(newAddress !== null && { address: newAddress }),
              updatedAt: new Date(),
            },
          });

          return { poi, success: true };
        } catch (error: any) {
          console.error(`❌ 更新 POI ${poi.id} (${poi.nameCN}) 失败:`, error.message);
          return { poi, success: false, reason: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // 统计结果
      for (const result of batchResults) {
        if (result.success) {
          updatedCount++;
        } else {
          if (result.reason === '未获取到数据') {
            skippedCount++;
          } else {
            errorCount++;
          }
        }
      }

      // 显示进度
      const processed = Math.min(i + batchSize, pois.length);
      console.log(`  进度: ${processed}/${pois.length} | 已更新: ${updatedCount} | 跳过: ${skippedCount} | 错误: ${errorCount}`);

      // 批次间延迟（避免 API 限流）
      if (i + batchSize < pois.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // 4. 显示统计结果
    console.log('\n' + '='.repeat(60));
    console.log('✅ 处理完成！\n');
    console.log('📊 统计结果:');
    console.log(`  总 POI 数: ${pois.length}`);
    console.log(`  已更新: ${updatedCount}`);
    console.log(`  跳过（未获取到数据）: ${skippedCount}`);
    console.log(`  错误: ${errorCount}`);
    console.log('='.repeat(60));

    // 5. 验证更新结果
    console.log('\n🔍 验证更新结果...');
    const sampleUpdated = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      hasOpeningHours: boolean;
      hasTicketPrice: boolean;
      amapId: string | null;
    }>>`
      SELECT 
        id,
        "nameCN",
        (metadata->'openingHours' IS NOT NULL) as "hasOpeningHours",
        (metadata->>'ticketPrice' IS NOT NULL) as "hasTicketPrice",
        metadata->>'amapId' as "amapId"
      FROM "Place"
      WHERE metadata->>'countryCode' = 'CN'
        AND metadata->>'lastEnrichedAt' IS NOT NULL
      ORDER BY id DESC
      LIMIT 10
    `;

    console.log('\n样本数据验证:');
    sampleUpdated.forEach(poi => {
      console.log(`  ${poi.nameCN} (ID: ${poi.id}):`);
      console.log(`    营业时间: ${poi.hasOpeningHours ? '✅' : '❌'}`);
      console.log(`    门票价格: ${poi.hasTicketPrice ? '✅' : '❌'}`);
      console.log(`    高德 ID: ${poi.amapId || 'N/A'}`);
    });

  } catch (error: any) {
    console.error('❌ 处理失败:', error);
    throw error;
  }
}

// 运行脚本
enrichChinaPoisFromAmap()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

