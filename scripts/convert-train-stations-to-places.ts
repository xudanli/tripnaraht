// 将原始火车站数据转换为 Place 数据
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 省级名称到城市名称的映射
 */
const provinceToCityMap: Record<string, string> = {
  '北京市': '北京',
  '上海市': '上海',
  '天津市': '天津',
  '重庆市': '重庆',
  '广东省': '广州',
  '江苏省': '南京',
  '浙江省': '杭州',
  '山东省': '济南',
  '河南省': '郑州',
  '四川省': '成都',
  '湖北省': '武汉',
  '湖南省': '长沙',
  '河北省': '石家庄',
  '山西省': '太原',
  '辽宁省': '沈阳',
  '吉林省': '长春',
  '黑龙江省': '哈尔滨',
  '安徽省': '合肥',
  '福建省': '福州',
  '江西省': '南昌',
  '云南省': '昆明',
  '贵州省': '贵阳',
  '陕西省': '西安',
  '甘肃省': '兰州',
  '青海省': '西宁',
  '台湾省': '台北',
  '内蒙古自治区': '呼和浩特',
  '广西壮族自治区': '南宁',
  '西藏自治区': '拉萨',
  '宁夏回族自治区': '银川',
  '新疆维吾尔自治区': '乌鲁木齐',
  '香港特别行政区': '香港',
  '澳门特别行政区': '澳门',
};

/**
 * 从城市名称中提取标准城市名（移除"市"、"区"等后缀）
 */
function normalizeCityName(cityName: string | null): string | null {
  if (!cityName) return null;
  return cityName.replace(/[市区县]$/, '');
}

/**
 * 获取或创建城市
 */
async function getOrCreateCity(cityName: string): Promise<number | null> {
  if (!cityName) return null;

  const normalizedName = normalizeCityName(cityName);

  // 查找现有城市
  let city = await prisma.city.findFirst({
    where: {
      name: {
        contains: normalizedName || cityName,
      },
    },
  });

  if (city) {
    return city.id;
  }

  // 如果没找到，尝试创建（使用中国国家代码）
  try {
    city = await prisma.city.create({
      data: {
        name: normalizedName || cityName,
        countryCode: 'CN',
      },
    });
    return city.id;
  } catch (error) {
    console.warn(`无法创建城市: ${cityName}`, error);
    return null;
  }
}

/**
 * 转换原始火车站数据为 Place
 */
async function convertTrainStationsToPlaces(batchSize: number = 100) {
  console.log('🔄 开始转换火车站数据为 Place...\n');

  // 获取未处理的原始数据
  const total = await prisma.rawTrainStationData.count({
    where: { processed: false },
  });

  console.log(`📊 待处理数据: ${total} 条\n`);

  if (total === 0) {
    console.log('✅ 没有需要处理的数据');
    return;
  }

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const rawStations = await prisma.rawTrainStationData.findMany({
      where: { processed: false },
      take: batchSize,
      skip: offset,
    });

    console.log(`处理批次 ${Math.floor(offset / batchSize) + 1}/${Math.ceil(total / batchSize)} (${offset + 1}-${Math.min(offset + batchSize, total)})`);

    for (const raw of rawStations) {
      try {
        // 验证必填字段
        if (!raw.name || !raw.wgs84Lat || !raw.wgs84Lng) {
          console.warn(`⚠️  跳过：缺少必填字段 (${raw.name})`);
          await prisma.rawTrainStationData.update({
            where: { id: raw.id },
            data: { processed: true },
          });
          skipped++;
          continue;
        }

        // 确定城市
        let cityId: number | null = null;
        const cityName = raw.city || (raw.province ? provinceToCityMap[raw.province] : null);
        
        if (cityName) {
          cityId = await getOrCreateCity(cityName);
        }

        // 检查是否已存在（根据名称和坐标）
        const existing = await prisma.place.findFirst({
          where: {
            name: raw.name,
            category: 'TRANSIT_HUB',
          },
        });

        if (existing) {
          console.log(`⏭️  已存在: ${raw.name}`);
          await prisma.rawTrainStationData.update({
            where: { id: raw.id },
            data: { processed: true },
          });
          skipped++;
          continue;
        }

        // 创建 Place
        const place = await prisma.place.create({
          data: {
            uuid: randomUUID(),
            name: raw.name,
            category: 'TRANSIT_HUB',
            address: raw.address || null,
            cityId,
            rating: 0,
            metadata: {
              railwayBureau: raw.railwayBureau,
              category: raw.category,
              nature: raw.nature,
              province: raw.province,
              city: raw.city,
              source: '全国火车站数据库',
            } as any,
            updatedAt: new Date(),
          } as any,
        });

        // 更新地理位置（使用 PostGIS）
        await prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${raw.wgs84Lng}, ${raw.wgs84Lat}), 4326)
          WHERE id = ${place.id}
        `;

        // 标记为已处理
        await prisma.rawTrainStationData.update({
          where: { id: raw.id },
          data: { processed: true },
        });

        created++;
        processed++;
      } catch (error: any) {
        errors++;
        console.error(`❌ 转换失败: ${raw.name}`, error.message);
      }
    }

    const progress = ((offset + rawStations.length) / total * 100).toFixed(1);
    console.log(`  进度: ${progress}% (已创建: ${created}, 跳过: ${skipped}, 错误: ${errors})\n`);
  }

  console.log('✅ 转换完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 总处理数: ${processed}`);
  console.log(`  - 成功创建: ${created}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 错误: ${errors}`);
}

/**
 * 主函数
 */
async function main() {
  const batchSize = process.argv[2] ? parseInt(process.argv[2]) : 100;

  try {
    await convertTrainStationsToPlaces(batchSize);
  } catch (error: any) {
    console.error('❌ 转换失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

