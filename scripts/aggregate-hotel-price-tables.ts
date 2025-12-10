// 从原始酒店数据聚合生成查找表
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 聚合生成 HotelPriceDetail（城市维度）
 * 
 * 从 HotelWideData_Quarterly 聚合所有季度、所有星级的数据
 * 计算每个城市的平均价格、中位数和城市因子
 */
async function aggregateHotelPriceDetail() {
  console.log('📊 开始聚合 HotelPriceDetail 表...\n');

  // 使用 SQL 将所有季度价格展开并聚合
  const result = await prisma.$executeRaw`
    INSERT INTO "HotelPriceDetail" (
      city, "avgPrice", "medianPrice", "cityFactor", "sampleCount", 
      "minPrice", "maxPrice", "stdDev", "createdAt", "updatedAt"
    )
    WITH all_prices AS (
      SELECT 
        city,
        UNNEST(ARRAY[
          "2018_Q1", "2018_Q2", "2018_Q3", "2018_Q4",
          "2019_Q1", "2019_Q2", "2019_Q3", "2019_Q4",
          "2020_Q1", "2020_Q2", "2020_Q3", "2020_Q4",
          "2021_Q1", "2021_Q2", "2021_Q3", "2021_Q4",
          "2022_Q1", "2022_Q2", "2022_Q3", "2022_Q4",
          "2023_Q1", "2023_Q2", "2023_Q3", "2023_Q4",
          "2024_Q1"
        ]) as price
      FROM "HotelWideData_Quarterly"
      WHERE city IS NOT NULL
    ),
    city_stats AS (
      SELECT 
        city,
        AVG(price) as avg_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        STDDEV(price) as std_dev,
        COUNT(*) as sample_count
      FROM all_prices
      WHERE price IS NOT NULL AND price > 0
      GROUP BY city
    ),
    overall_avg AS (
      SELECT AVG(price) as overall_avg_price
      FROM all_prices
      WHERE price IS NOT NULL AND price > 0
    )
    SELECT 
      cs.city,
      cs.avg_price::FLOAT,
      cs.median_price::FLOAT,
      CASE 
        WHEN oa.overall_avg_price > 0 THEN (cs.avg_price / oa.overall_avg_price)::FLOAT
        ELSE 1.0::FLOAT
      END as city_factor,
      cs.sample_count::INT,
      cs.min_price::FLOAT,
      cs.max_price::FLOAT,
      cs.std_dev::FLOAT,
      NOW() as created_at,
      NOW() as updated_at
    FROM city_stats cs
    CROSS JOIN overall_avg oa
    ON CONFLICT (city) DO UPDATE SET
      "avgPrice" = EXCLUDED."avgPrice",
      "medianPrice" = EXCLUDED."medianPrice",
      "cityFactor" = EXCLUDED."cityFactor",
      "sampleCount" = EXCLUDED."sampleCount",
      "minPrice" = EXCLUDED."minPrice",
      "maxPrice" = EXCLUDED."maxPrice",
      "stdDev" = EXCLUDED."stdDev",
      "updatedAt" = NOW()
  `;

  console.log(`✅ HotelPriceDetail 聚合完成，影响 ${result} 行\n`);
}

/**
 * 聚合生成 StarCityPriceDetail（质量维度）
 * 
 * 从 HotelWideData_Quarterly 按城市和星级聚合
 * 计算每个城市-星级组合的平均价格和城市-星级因子
 */
async function aggregateStarCityPriceDetail() {
  console.log('📊 开始聚合 StarCityPriceDetail 表...\n');

  const result = await prisma.$executeRaw`
    INSERT INTO "StarCityPriceDetail" (
      city, "starRating", "avgPrice", "cityStarFactor", "sampleCount",
      "minPrice", "maxPrice", "stdDev", "createdAt", "updatedAt"
    )
    WITH all_prices AS (
      SELECT 
        city,
        "starRating",
        UNNEST(ARRAY[
          "2018_Q1", "2018_Q2", "2018_Q3", "2018_Q4",
          "2019_Q1", "2019_Q2", "2019_Q3", "2019_Q4",
          "2020_Q1", "2020_Q2", "2020_Q3", "2020_Q4",
          "2021_Q1", "2021_Q2", "2021_Q3", "2021_Q4",
          "2022_Q1", "2022_Q2", "2022_Q3", "2022_Q4",
          "2023_Q1", "2023_Q2", "2023_Q3", "2023_Q4",
          "2024_Q1"
        ]) as price
      FROM "HotelWideData_Quarterly"
      WHERE city IS NOT NULL AND "starRating" IS NOT NULL
    ),
    city_star_stats AS (
      SELECT 
        city,
        "starRating",
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        STDDEV(price) as std_dev,
        COUNT(*) as sample_count
      FROM all_prices
      WHERE price IS NOT NULL AND price > 0
      GROUP BY city, "starRating"
    ),
    city_avg AS (
      SELECT 
        city,
        AVG(price) as city_avg_price
      FROM all_prices
      WHERE price IS NOT NULL AND price > 0
      GROUP BY city
    )
    SELECT 
      css.city,
      css."starRating"::INT,
      css.avg_price::FLOAT,
      CASE 
        WHEN ca.city_avg_price > 0 THEN (css.avg_price / ca.city_avg_price)::FLOAT
        ELSE 1.0::FLOAT
      END as city_star_factor,
      css.sample_count::INT,
      css.min_price::FLOAT,
      css.max_price::FLOAT,
      css.std_dev::FLOAT,
      NOW() as created_at,
      NOW() as updated_at
    FROM city_star_stats css
    JOIN city_avg ca ON css.city = ca.city
    ON CONFLICT (city, "starRating") DO UPDATE SET
      "avgPrice" = EXCLUDED."avgPrice",
      "cityStarFactor" = EXCLUDED."cityStarFactor",
      "sampleCount" = EXCLUDED."sampleCount",
      "minPrice" = EXCLUDED."minPrice",
      "maxPrice" = EXCLUDED."maxPrice",
      "stdDev" = EXCLUDED."stdDev",
      "updatedAt" = NOW()
  `;

  console.log(`✅ StarCityPriceDetail 聚合完成，影响 ${result} 行\n`);
}

async function main() {
  console.log('🚀 开始聚合酒店价格查找表...\n');

  try {
    // 检查原始数据
    const quarterlyCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::BIGINT as count FROM "HotelWideData_Quarterly"
    `;
    console.log(`📊 HotelWideData_Quarterly 数据量: ${quarterlyCount[0]?.count || 0} 条\n`);

    if (Number(quarterlyCount[0]?.count || 0) === 0) {
      console.log('⚠️  警告: HotelWideData_Quarterly 表为空，请先导入数据');
      return;
    }

    // 聚合 HotelPriceDetail
    await aggregateHotelPriceDetail();

    // 聚合 StarCityPriceDetail
    await aggregateStarCityPriceDetail();

    // 验证结果
    const hotelDetailCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::BIGINT as count FROM "HotelPriceDetail"
    `;
    const starDetailCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::BIGINT as count FROM "StarCityPriceDetail"
    `;

    console.log('📊 聚合结果统计:');
    console.log(`  HotelPriceDetail: ${hotelDetailCount[0]?.count || 0} 条记录`);
    console.log(`  StarCityPriceDetail: ${starDetailCount[0]?.count || 0} 条记录`);

    // 显示示例数据
    const hotelSample = await prisma.$queryRaw<Array<{
      city: string;
      medianPrice: number;
      cityFactor: number;
    }>>`
      SELECT city, "medianPrice", "cityFactor"
      FROM "HotelPriceDetail"
      LIMIT 5
    `;

    if (hotelSample.length > 0) {
      console.log('\n📋 HotelPriceDetail 示例数据:');
      hotelSample.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.city}: 中位数=${row.medianPrice?.toFixed(2)}, 因子=${row.cityFactor?.toFixed(4)}`);
      });
    }

    const starSample = await prisma.$queryRaw<Array<{
      city: string;
      starRating: number;
      avgPrice: number;
      cityStarFactor: number;
    }>>`
      SELECT city, "starRating", "avgPrice", "cityStarFactor"
      FROM "StarCityPriceDetail"
      LIMIT 5
    `;

    if (starSample.length > 0) {
      console.log('\n📋 StarCityPriceDetail 示例数据:');
      starSample.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.city} ${row.starRating}星: 均价=${row.avgPrice?.toFixed(2)}, 因子=${row.cityStarFactor?.toFixed(4)}`);
      });
    }

    console.log('\n✅ 聚合完成！');
  } catch (error: any) {
    console.error('❌ 聚合失败:', error.message);
    console.error(error.stack);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
