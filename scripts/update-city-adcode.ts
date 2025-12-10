// 从酒店数据表中提取城市adcode并更新City表
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 标准化城市名称（移除"市"、"区"等后缀）
 */
function normalizeCityName(cityName: string): string {
  return cityName.replace(/[市区县]$/, '').trim();
}

/**
 * 从酒店数据中提取城市和adcode的映射关系
 */
async function extractCityAdcodeMap() {
  console.log('📊 从酒店数据中提取城市adcode映射...\n');

  // 查询酒店数据中的城市和adcode，按城市分组，取最常见的adcode
  const cityAdcodeList = await prisma.$queryRaw<Array<{
    city: string;
    adcode: string;
    count: bigint;
  }>>`
    SELECT 
      city,
      adcode,
      COUNT(*) as count
    FROM "RawHotelData_Slim"
    WHERE city IS NOT NULL 
      AND adcode IS NOT NULL
      AND city != ''
      AND adcode != ''
    GROUP BY city, adcode
    ORDER BY city, count DESC
  `;

  // 为每个城市选择最常见的adcode
  const cityAdcodeMap = new Map<string, string>();
  const cityCountMap = new Map<string, number>();

  for (const item of cityAdcodeList) {
    const normalizedCity = normalizeCityName(item.city);
    const count = Number(item.count);

    // 如果这个城市还没有adcode，或者这个adcode的酒店数量更多，则更新
    if (!cityAdcodeMap.has(normalizedCity) || 
        (cityCountMap.get(normalizedCity) || 0) < count) {
      cityAdcodeMap.set(normalizedCity, item.adcode);
      cityCountMap.set(normalizedCity, count);
    }
  }

  console.log(`✅ 提取到 ${cityAdcodeMap.size} 个城市的adcode映射\n`);
  return cityAdcodeMap;
}

/**
 * 更新City表的adcode字段
 */
async function updateCityAdcode() {
  console.log('🔄 开始更新City表的adcode字段...\n');

  // 提取城市adcode映射
  const cityAdcodeMap = await extractCityAdcodeMap();

  // 获取所有城市
  const allCities = await prisma.city.findMany({
    where: {
      countryCode: 'CN', // 只处理中国城市
    },
  });

  console.log(`📋 找到 ${allCities.length} 个中国城市\n`);

  let updated = 0;
  let notFound = 0;
  const notFoundCities: string[] = [];

  for (const city of allCities) {
    const normalizedName = normalizeCityName(city.name);
    
    // 尝试多种匹配方式
    let adcode: string | undefined = cityAdcodeMap.get(normalizedName);
    
    // 如果直接匹配失败，尝试在酒店数据中查找包含该城市名的记录
    if (!adcode) {
      // 尝试查找包含该城市名的记录（例如："北京" 匹配 "北京市"）
      for (const [hotelCity, code] of cityAdcodeMap.entries()) {
        const normalizedHotelCity = normalizeCityName(hotelCity);
        
        // 精确匹配
        if (normalizedHotelCity === normalizedName) {
          adcode = code;
          break;
        }
        
        // 包含匹配（但要避免误匹配，比如"延边"不应该匹配"延边州敦化"）
        if (normalizedName.length >= 2) {
          // 如果城市名包含在酒店城市名中，且酒店城市名不超过城市名+5个字符
          if (normalizedHotelCity.includes(normalizedName) && 
              normalizedHotelCity.length <= normalizedName.length + 5) {
            adcode = code;
            break;
          }
          // 反向匹配：如果酒店城市名包含在城市名中
          if (normalizedName.includes(normalizedHotelCity) && 
              normalizedName.length <= normalizedHotelCity.length + 5) {
            adcode = code;
            break;
          }
        }
      }
    }
    
    // 如果还是没找到，尝试从原始酒店数据中直接查询
    if (!adcode) {
      const hotelData = await prisma.$queryRaw<Array<{adcode: string}>>`
        SELECT DISTINCT adcode
        FROM "RawHotelData_Slim"
        WHERE city IS NOT NULL 
          AND adcode IS NOT NULL
          AND (
            city = ${city.name} 
            OR city = ${city.name + '市'}
            OR city LIKE ${city.name + '%'}
            OR ${city.name} LIKE city || '%'
          )
        ORDER BY adcode
        LIMIT 1
      `;
      
      if (hotelData.length > 0 && hotelData[0].adcode) {
        adcode = hotelData[0].adcode;
      }
    }

    if (adcode) {
      await prisma.city.update({
        where: { id: city.id },
        data: { adcode },
      });
      updated++;
      if (updated <= 20) {
        console.log(`✅ ${city.name} -> ${adcode}`);
      }
    } else {
      notFound++;
      if (notFound <= 20) {
        notFoundCities.push(city.name);
      }
    }
  }

  console.log(`\n📊 更新统计:`);
  console.log(`  - 成功更新: ${updated} 个城市`);
  console.log(`  - 未找到adcode: ${notFound} 个城市`);

  if (notFoundCities.length > 0) {
    console.log(`\n⚠️  未找到adcode的城市（前20个）:`);
    notFoundCities.forEach(name => console.log(`  - ${name}`));
  }

  console.log('\n✅ 更新完成！');
}

/**
 * 验证更新结果
 */
async function verifyUpdate() {
  console.log('\n🔍 验证更新结果...\n');

  const totalCities = await prisma.city.count({
    where: { countryCode: 'CN' },
  });

  const citiesWithAdcode = await prisma.city.count({
    where: {
      countryCode: 'CN',
      adcode: { not: null },
    },
  });

  console.log(`📊 统计:`);
  console.log(`  - 总城市数: ${totalCities}`);
  console.log(`  - 有adcode的城市: ${citiesWithAdcode} (${((citiesWithAdcode / totalCities) * 100).toFixed(1)}%)`);

  // 显示一些示例
  const sampleCities = await prisma.city.findMany({
    where: {
      countryCode: 'CN',
      adcode: { not: null },
    },
    take: 10,
    orderBy: {
      name: 'asc',
    },
  });

  console.log(`\n📋 示例数据（前10个）:`);
  sampleCities.forEach(city => {
    console.log(`  ${city.name} -> ${city.adcode}`);
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    await updateCityAdcode();
    await verifyUpdate();
  } catch (error: any) {
    console.error('❌ 更新失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
