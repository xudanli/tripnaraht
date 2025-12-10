// 修复火车站城市匹配错误
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从地址中提取城市名称
 */
function extractCityFromAddress(address: string | null, province: string | null): string | null {
  if (!address) return null;

  // 匹配模式：XX市、XX区、XX县
  const patterns = [
    /([^省市区县]+?)(?:市|区|县)/,
    /北京市([^区]+?区)/,
    /上海市([^区]+?区)/,
    /天津市([^区]+?区)/,
    /重庆市([^区县]+?[区县])/,
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      let cityName = match[1] || match[0];
      // 移除"省"、"自治区"等前缀
      cityName = cityName.replace(/^(.*?省|.*?自治区|.*?特别行政区)/, '');
      return cityName.trim();
    }
  }

  return null;
}

/**
 * 获取或创建城市（改进版，使用精确匹配）
 */
async function getOrCreateCityExact(cityName: string): Promise<number | null> {
  if (!cityName) return null;

  // 标准化城市名称
  const normalized = cityName.replace(/[市区县]$/, '');

  // 首先尝试精确匹配
  let city = await prisma.city.findFirst({
    where: {
      name: normalized,
    },
  });

  if (city) {
    return city.id;
  }

  // 如果精确匹配失败，尝试包含匹配（但要排除包含关系）
  // 例如："大兴"不应该匹配"大兴安岭地区漠河"
  const allCities = await prisma.city.findMany({
    where: {
      name: {
        contains: normalized,
      },
    },
  });

  // 找到最匹配的城市（优先选择名称长度接近的）
  if (allCities.length > 0) {
    // 如果只有一个匹配，且不是包含关系（即不是"大兴"匹配"大兴安岭"），则使用
    const exactMatch = allCities.find(c => c.name === normalized || c.name.startsWith(normalized + '市'));
    if (exactMatch) {
      return exactMatch.id;
    }

    // 如果匹配的城市名称包含查询的城市名，但查询的城市名也包含在匹配的城市名中
    // 例如："大兴" 和 "大兴安岭地区漠河" - 这种情况应该创建新城市
    const containsMatch = allCities.find(c => {
      const cNormalized = c.name.replace(/[市区县]$/, '');
      return cNormalized.includes(normalized) && normalized.length >= 2;
    });

    // 只有当匹配的城市名长度不超过查询城市名+3个字符时才使用
    if (containsMatch && containsMatch.name.length <= normalized.length + 3) {
      return containsMatch.id;
    }
  }

  // 如果没找到，创建新城市
  try {
    city = await prisma.city.create({
      data: {
        name: normalized,
        countryCode: 'CN',
      },
    });
    return city.id;
  } catch (error: any) {
    // 如果创建失败（可能是唯一性约束），再次尝试查找
    city = await prisma.city.findFirst({
      where: {
        name: normalized,
      },
    });
    return city?.id || null;
  }
}

/**
 * 修复错误匹配的城市
 */
async function fixWrongCities() {
  console.log('🔧 开始修复火车站城市匹配错误...\n');

  // 查找所有火车站
  const stations = await prisma.place.findMany({
    where: {
      category: 'TRANSIT_HUB',
    },
    include: {
      city: true,
    },
  });

  let fixed = 0;
  let checked = 0;
  const errors: string[] = [];

  for (const station of stations) {
    checked++;
    const metadata = station.metadata as any;
    const province = metadata?.province;
    const rawCity = metadata?.city;
    const address = station.address;

    // 检查当前城市是否合理
    const currentCityName = station.city?.name || '';
    let shouldFix = false;
    let correctCityName: string | null = null;

    // 情况1：如果省份是北京，但城市名包含"大兴安岭"，这是错误的
    if (province === '北京' && currentCityName.includes('大兴安岭')) {
      shouldFix = true;
      // 从地址中提取城市名
      if (address) {
        const extracted = extractCityFromAddress(address, province);
        if (extracted) {
          correctCityName = extracted;
        } else if (address.includes('大兴区')) {
          correctCityName = '大兴';
        } else if (address.includes('黄村镇')) {
          correctCityName = '大兴';
        } else if (address.includes('昌平区')) {
          correctCityName = '昌平';
        } else if (address.includes('海淀区')) {
          correctCityName = '海淀';
        } else if (address.includes('朝阳区')) {
          correctCityName = '朝阳';
        } else if (address.includes('东城区')) {
          correctCityName = '东城';
        } else if (address.includes('西城区')) {
          correctCityName = '西城';
        } else if (address.includes('丰台区')) {
          correctCityName = '丰台';
        } else if (address.includes('石景山区')) {
          correctCityName = '石景山';
        } else if (address.includes('房山区')) {
          correctCityName = '房山';
        } else if (address.includes('通州区')) {
          correctCityName = '通州';
        } else if (address.includes('顺义区')) {
          correctCityName = '顺义';
        } else if (address.includes('怀柔区')) {
          correctCityName = '怀柔';
        } else if (address.includes('平谷区')) {
          correctCityName = '平谷';
        } else if (address.includes('密云区')) {
          correctCityName = '密云';
        } else if (address.includes('延庆区')) {
          correctCityName = '延庆';
        } else {
          correctCityName = '北京';
        }
      } else {
        correctCityName = '北京';
      }
    }
    // 情况2：如果原始数据中有城市信息，但当前城市不匹配
    else if (rawCity && currentCityName !== rawCity && !currentCityName.includes(rawCity)) {
      // 检查是否是明显的错误匹配
      if (currentCityName.length > rawCity.length + 5 && currentCityName.includes(rawCity)) {
        shouldFix = true;
        correctCityName = rawCity;
      }
    }

    if (shouldFix && correctCityName) {
      try {
        const newCityId = await getOrCreateCityExact(correctCityName);
        if (newCityId && newCityId !== station.cityId) {
          await prisma.place.update({
            where: { id: station.id },
            data: { cityId: newCityId },
          });
          fixed++;
          if (fixed <= 10) {
            console.log(`✅ 修复: ${station.name} - ${currentCityName} → ${correctCityName}`);
          }
        }
      } catch (error: any) {
        errors.push(`${station.name}: ${error.message}`);
      }
    }
  }

  console.log(`\n📊 修复统计:`);
  console.log(`  - 检查数量: ${checked}`);
  console.log(`  - 修复数量: ${fixed}`);
  console.log(`  - 错误数量: ${errors.length}`);

  if (errors.length > 0 && errors.length <= 10) {
    console.log(`\n⚠️  错误列表:`);
    errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\n✅ 修复完成！');
}

/**
 * 主函数
 */
async function main() {
  try {
    await fixWrongCities();
  } catch (error: any) {
    console.error('❌ 修复失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
