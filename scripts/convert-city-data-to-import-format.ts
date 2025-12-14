// scripts/convert-city-data-to-import-format.ts

/**
 * 将原始城市数据转换为导入格式
 * 
 * 支持从多种字段名自动转换 countryCode
 * 
 * 使用方法:
 *   npm run convert:cities <原始数据文件> <输出文件>
 * 
 * 示例:
 *   npm run convert:cities raw-cities.json cities.json
 */

import * as fs from 'fs';
import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';
import enLocale from 'i18n-iso-countries/langs/en.json';

// 注册语言包
countries.registerLocale(zhLocale);
countries.registerLocale(enLocale);

// 国家名称到 ISO 代码的映射（补充一些常见变体）
const COUNTRY_NAME_MAP: Record<string, string> = {
  // 中文名称
  '中国': 'CN',
  '美国': 'US',
  '英国': 'GB',
  '法国': 'FR',
  '德国': 'DE',
  '日本': 'JP',
  '韩国': 'KR',
  '澳大利亚': 'AU',
  '加拿大': 'CA',
  '意大利': 'IT',
  '西班牙': 'ES',
  '瑞士': 'CH',
  '冰岛': 'IS',
  '尼泊尔': 'NP',
  '新西兰': 'NZ',
  '俄罗斯': 'RU',
  '印度': 'IN',
  '泰国': 'TH',
  '新加坡': 'SG',
  '马来西亚': 'MY',
  '印度尼西亚': 'ID',
  '菲律宾': 'PH',
  '越南': 'VN',
  '巴西': 'BR',
  '阿根廷': 'AR',
  '墨西哥': 'MX',
  '南非': 'ZA',
  '埃及': 'EG',
  '土耳其': 'TR',
  '希腊': 'GR',
  '葡萄牙': 'PT',
  '荷兰': 'NL',
  '比利时': 'BE',
  '奥地利': 'AT',
  '瑞典': 'SE',
  '挪威': 'NO',
  '丹麦': 'DK',
  '芬兰': 'FI',
  '波兰': 'PL',
  '捷克': 'CZ',
  '匈牙利': 'HU',
  '爱尔兰': 'IE',
  // 英文常见变体
  'United States of America': 'US',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'USA': 'US',
  'South Korea': 'KR',
  'North Korea': 'KP',
  'Czech Republic': 'CZ',
  'Russian Federation': 'RU',
};

/**
 * 尝试从各种字段名获取国家代码
 */
function getCountryCode(data: any): string | null {
  // 1. 直接有 countryCode 字段（已符合格式）
  if (data.countryCode && /^[A-Z]{2}$/.test(data.countryCode)) {
    return data.countryCode.toUpperCase();
  }

  // 2. 有 country_code 字段
  if (data.country_code) {
    const code = String(data.country_code).toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) {
      return code;
    }
  }

  // 3. 有 iso_code 字段
  if (data.iso_code) {
    const code = String(data.iso_code).toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) {
      return code;
    }
  }

  // 4. 从国家名称转换（中文）
  if (data.country_name || data.country) {
    const countryName = String(data.country_name || data.country).trim();
    
    // 先尝试中文映射
    if (COUNTRY_NAME_MAP[countryName]) {
      return COUNTRY_NAME_MAP[countryName];
    }

    // 尝试使用 i18n-iso-countries 库（支持中文和英文）
    try {
      // 尝试中文
      const codeZh = countries.getAlpha2Code(countryName, 'zh');
      if (codeZh) return codeZh;

      // 尝试英文
      const codeEn = countries.getAlpha2Code(countryName, 'en');
      if (codeEn) return codeEn;
    } catch (e) {
      // 忽略错误，继续尝试其他方法
    }
  }

  // 5. 从 nationality 字段转换
  if (data.nationality) {
    const nationality = String(data.nationality).trim();
    // 这里可以添加 nationality 到 country code 的映射
    // 例如: "Chinese" -> "CN"
  }

  return null;
}

/**
 * 获取城市名称（支持多种字段名）
 */
function getCityName(data: any): string | null {
  return data.name || data.city || data.cityName || data.city_name || null;
}

/**
 * 获取城市名称（支持多种字段名）
 */
function getCityNameCN(data: any): string | null {
  return data.nameCN || data.name_zh || data.nameZH || data.NAME_ZH || null;
}

/**
 * 获取城市英文名称（支持多种字段名）
 */
function getCityNameEN(data: any): string | null {
  return data.nameEN || data.name_en || data.nameEN || data.NAME_EN || null;
}

/**
 * 获取经纬度
 */
function getCoordinates(data: any): { latitude?: number; longitude?: number } {
  const lat = data.latitude || data.lat || data.纬度 || data.LAT || null;
  const lng = data.longitude || data.lng || data.lon || data.经度 || data.LNG || data.LON || null;
  
  return {
    latitude: lat ? parseFloat(String(lat)) : undefined,
    longitude: lng ? parseFloat(String(lng)) : undefined,
  };
}

/**
 * 获取时区
 */
function getTimezone(data: any): string | null {
  return data.timezone || data.TIMEZONE || data.timeZone || null;
}

/**
 * 构建 metadata 对象
 */
function buildMetadata(rawData: any): any {
  const metadata: any = {};

  // 行政区划信息
  if (rawData.ADM0NAME || rawData.adm0name || rawData.country) {
    metadata.adminLevel0 = rawData.ADM0NAME || rawData.adm0name || rawData.country;
  }
  if (rawData.ADM1NAME || rawData.adm1name || rawData.province || rawData.state) {
    metadata.adminLevel1 = rawData.ADM1NAME || rawData.adm1name || rawData.province || rawData.state;
  }

  // 外部ID
  if (rawData.WIKIDATAID || rawData.wikidataId || rawData.wikidata_id) {
    metadata.wikidataId = String(rawData.WIKIDATAID || rawData.wikidataId || rawData.wikidata_id);
  }
  if (rawData.GEONAMESID || rawData.geonamesId || rawData.geonames_id) {
    metadata.geonamesId = parseInt(String(rawData.GEONAMESID || rawData.geonamesId || rawData.geonames_id));
  }
  if (rawData.WOF_ID || rawData.wofId || rawData.wof_id) {
    metadata.wofId = parseInt(String(rawData.WOF_ID || rawData.wofId || rawData.wof_id));
  }

  // 其他语言名称
  const langMap: Record<string, string> = {
    NAME_DE: 'nameDE',
    NAME_ES: 'nameES',
    NAME_FR: 'nameFR',
    NAME_JA: 'nameJA',
    NAME_KO: 'nameKO',
  };
  
  for (const [sourceKey, targetKey] of Object.entries(langMap)) {
    if (rawData[sourceKey]) {
      metadata[targetKey] = String(rawData[sourceKey]);
    }
  }

  // 要素分类
  if (rawData.FEATURECLA || rawData.featureClass || rawData.feature_cla) {
    metadata.featureClass = String(rawData.FEATURECLA || rawData.featureClass || rawData.feature_cla);
  }

  // 如果有任何 metadata 内容，返回它
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * 转换单条城市数据
 */
function convertCityData(rawData: any): {
  name: string;
  nameCN?: string;
  nameEN?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  adcode?: string;
  metadata?: any;
} | null {
  const name = getCityName(rawData);
  if (!name) {
    console.warn('⚠️  跳过：缺少城市名称', JSON.stringify(rawData));
    return null;
  }

  const countryCode = getCountryCode(rawData);
  if (!countryCode) {
    console.warn(`⚠️  跳过：无法确定国家代码 - ${name}`, JSON.stringify(rawData));
    return null;
  }

  const result: any = {
    name: name.trim(),
    countryCode: countryCode,
  };

  // 添加中英文名称
  const nameCN = getCityNameCN(rawData);
  if (nameCN) {
    result.nameCN = String(nameCN).trim();
  }

  const nameEN = getCityNameEN(rawData);
  if (nameEN) {
    result.nameEN = String(nameEN).trim();
  }

  // 添加坐标
  const coords = getCoordinates(rawData);
  if (coords.latitude !== undefined && coords.longitude !== undefined) {
    result.latitude = coords.latitude;
    result.longitude = coords.longitude;
  }

  // 添加时区
  const timezone = getTimezone(rawData);
  if (timezone) {
    result.timezone = String(timezone).trim();
  }

  // 添加 adcode（如果存在）
  if (rawData.adcode || rawData.admin_code || rawData.行政区划代码) {
    result.adcode = String(rawData.adcode || rawData.admin_code || rawData.行政区划代码).trim();
  }

  // 构建 metadata
  const metadata = buildMetadata(rawData);
  if (metadata) {
    result.metadata = metadata;
  }

  return result;
}

async function main() {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3];

  if (!inputFile || !outputFile) {
    console.error('❌ 请提供输入和输出文件路径');
    console.error('\n使用方法:');
    console.error('  npm run convert:cities <原始数据文件> <输出文件>');
    console.error('\n示例:');
    console.error('  npm run convert:cities raw-cities.json cities.json');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 文件不存在: ${inputFile}`);
    process.exit(1);
  }

  console.log(`📂 读取文件: ${inputFile}\n`);

  const fileContent = fs.readFileSync(inputFile, 'utf-8');
  let rawData: any[];

  try {
    const parsed = JSON.parse(fileContent);
    rawData = Array.isArray(parsed) ? parsed : parsed.cities || parsed.data || [];
  } catch (error: any) {
    console.error(`❌ JSON 解析失败: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 找到 ${rawData.length} 条原始数据\n`);
  console.log('开始转换...\n');

  const converted: any[] = [];
  const skipped: any[] = [];

  for (const item of rawData) {
    const convertedItem = convertCityData(item);
    if (convertedItem) {
      converted.push(convertedItem);
    } else {
      skipped.push(item);
    }
  }

  // 保存转换后的数据
  fs.writeFileSync(outputFile, JSON.stringify(converted, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(50));
  console.log('📊 转换统计:');
  console.log(`  ✅ 成功转换: ${converted.length}`);
  console.log(`  ⏭️  跳过: ${skipped.length}`);
  console.log('='.repeat(50));

  if (skipped.length > 0) {
    console.log('\n⚠️  跳过的数据（前10条）:');
    skipped.slice(0, 10).forEach((item, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(item)}`);
    });
    if (skipped.length > 10) {
      console.log(`  ... 还有 ${skipped.length - 10} 条`);
    }
  }

  console.log(`\n✅ 转换完成！输出文件: ${outputFile}`);
  console.log(`\n💡 下一步: npm run import:cities ${outputFile}`);
}

main().catch(console.error);

