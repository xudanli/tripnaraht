// 导入指定品牌的酒店数据
// 支持从 CSV 或 JSON 文件导入，自动关联星级

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

/**
 * 5星级酒店品牌列表（豪华酒店）
 */
const FIVE_STAR_BRANDS = [
  'JW万豪',
  'JW Marriott',
  'W酒店',
  'W Hotels',
  '丽思卡尔顿',
  'Ritz-Carlton',
  '瑞吉',
  'St. Regis',
  '万豪',
  'Marriott',
  '万豪行政公寓',
  'Marriott Executive Apartments',
  '万丽',
  'Renaissance',
  '威斯汀',
  'Westin',
  '喜来登',
  'Sheraton',
  '希尔顿',
  'Hilton',
  '华尔道夫',
  'Waldorf Astoria',
  '康莱德',
  'Conrad',
  '希尔顿嘉悦里',
  'Canopy by Hilton',
  '洲际',
  'InterContinental',
  '四季',
  'Four Seasons',
  '凯悦',
  'Hyatt',
  '香格里拉',
  'Shangri-La',
];

/**
 * 4星级酒店品牌列表（中高端酒店）
 */
const FOUR_STAR_BRANDS = [
  '万怡',
  'Courtyard',
  '万枫',
  'Fairfield',
  '希尔顿花园',
  'Hilton Garden Inn',
  '希尔顿逸林',
  'DoubleTree by Hilton',
  '希尔顿格芮',
  'Curio Collection by Hilton',
  '希尔顿欢朋',
  'Hampton by Hilton',
  '希尔顿惠庭',
  'Home2 Suites by Hilton',
  '皇冠假日',
  'Crowne Plaza',
  '假日',
  'Holiday Inn',
];

/**
 * 品牌名称标准化（处理中英文变体）
 */
function normalizeBrand(brand: string | null): string | null {
  if (!brand) return null;

  const normalized = brand.trim();

  // 品牌映射表（处理中英文变体）
  const brandMap: Record<string, string> = {
    // 万豪集团
    'JW Marriott': 'JW万豪',
    'JW万豪': 'JW万豪',
    'W Hotels': 'W酒店',
    'W酒店': 'W酒店',
    'Ritz-Carlton': '丽思卡尔顿',
    '丽思卡尔顿': '丽思卡尔顿',
    'St. Regis': '瑞吉',
    '瑞吉': '瑞吉',
    'Marriott': '万豪',
    '万豪': '万豪',
    'Marriott Executive Apartments': '万豪行政公寓',
    '万豪行政公寓': '万豪行政公寓',
    'Renaissance': '万丽',
    '万丽': '万丽',
    'Courtyard': '万怡',
    '万怡': '万怡',
    'Westin': '威斯汀',
    '威斯汀': '威斯汀',
    'Sheraton': '喜来登',
    '喜来登': '喜来登',
    // 希尔顿集团
    'Hilton': '希尔顿',
    '希尔顿': '希尔顿',
    'Waldorf Astoria': '华尔道夫',
    '华尔道夫': '华尔道夫',
    'Conrad': '康莱德',
    '康莱德': '康莱德',
    'Canopy by Hilton': '希尔顿嘉悦里',
    '希尔顿嘉悦里': '希尔顿嘉悦里',
    'Hilton Garden Inn': '希尔顿花园',
    '希尔顿花园': '希尔顿花园',
    'DoubleTree by Hilton': '希尔顿逸林',
    '希尔顿逸林': '希尔顿逸林',
    'Curio Collection by Hilton': '希尔顿格芮',
    '希尔顿格芮': '希尔顿格芮',
    'Hampton by Hilton': '希尔顿欢朋',
    '希尔顿欢朋': '希尔顿欢朋',
    'Home2 Suites by Hilton': '希尔顿惠庭',
    '希尔顿惠庭': '希尔顿惠庭',
    // 其他品牌
    'InterContinental': '洲际',
    '洲际': '洲际',
    'Four Seasons': '四季',
    '四季': '四季',
    'Hyatt': '凯悦',
    '凯悦': '凯悦',
    'Shangri-La': '香格里拉',
    '香格里拉': '香格里拉',
  };

  return brandMap[normalized] || normalized;
}

/**
 * 判断是否为5星品牌
 */
function isFiveStarBrand(brand: string | null): boolean {
  if (!brand) return false;
  const normalized = normalizeBrand(brand);
  // 检查标准化后的品牌名或原始品牌名
  return FIVE_STAR_BRANDS.includes(normalized || '') || FIVE_STAR_BRANDS.includes(brand);
}

/**
 * 判断是否为4星品牌
 */
function isFourStarBrand(brand: string | null): boolean {
  if (!brand) return false;
  const normalized = normalizeBrand(brand);
  return FOUR_STAR_BRANDS.includes(normalized || '') || FOUR_STAR_BRANDS.includes(brand);
}

/**
 * 从 CSV 文件导入酒店数据
 */
interface HotelRow {
  品牌?: string;
  brand?: string;
  名称?: string;
  name?: string;
  地址?: string;
  address?: string;
  城市?: string;
  city?: string;
  区县?: string;
  district?: string;
  纬度?: string;
  lat?: string;
  经度?: string;
  lng?: string;
  电话?: string;
  phone?: string;
  id?: string;
}

async function importHotelsFromCSV(csvFilePath: string, targetStarRating: number = 5) {
  console.log(`🚀 开始导入酒店数据（目标星级: ${targetStarRating}星）...\n`);

  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`文件不存在: ${csvFilePath}`);
  }

  console.log(`📂 读取文件: ${csvFilePath}\n`);

  const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as HotelRow[];

  console.log(`📊 解析到 ${records.length} 条记录\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let fiveStarCount = 0;

  const batchSize = 1000;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, records.length)})`);

    for (const row of batch) {
      try {
        // 获取品牌（支持中英文字段名）
        const brand = normalizeBrand(row.品牌 || row.brand || null);
        const name = row.名称 || row.name || '';
        const address = row.地址 || row.address || null;
        const city = row.城市 || row.city || null;
        const district = row.区县 || row.district || null;
        const lat = row.纬度 || row.lat ? parseFloat(row.纬度 || row.lat || '0') : null;
        const lng = row.经度 || row.lng ? parseFloat(row.经度 || row.lng || '0') : null;
        const phone = row.电话 || row.phone || null;
        const hotelId = row.id || null;

        // 验证必填字段
        if (!name || !name.trim()) {
          skipped++;
          continue;
        }

        // 如果指定了目标星级，检查品牌是否符合
        if (targetStarRating === 5 && !isFiveStarBrand(brand)) {
          skipped++;
          continue;
        }

        // 验证坐标
        if (lat !== null && (lat < -90 || lat > 90)) {
          console.warn(`⚠️  无效纬度: ${lat} (${name})`);
          continue;
        }
        if (lng !== null && (lng < -180 || lng > 180)) {
          console.warn(`⚠️  无效经度: ${lng} (${name})`);
          continue;
        }

        // 检查是否已存在
        const existing = await prisma.rawHotelData_Slim.findFirst({
          where: {
            OR: [
              { id: hotelId || undefined },
              {
                name: name.trim(),
                city: city || undefined,
              },
            ],
          },
        });

        if (existing) {
          // 如果已存在，更新品牌信息（如果原来没有品牌）
          if (!existing.brand && brand) {
            await prisma.rawHotelData_Slim.update({
              where: { id: existing.id },
              data: { brand },
            });
            console.log(`✅ 更新品牌: ${name} -> ${brand}`);
          }
          skipped++;
          continue;
        }

        // 插入数据
        await prisma.rawHotelData_Slim.create({
          data: {
            id: hotelId || `IMPORT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            brand: brand,
            address: address?.trim() || null,
            city: city?.trim() || null,
            district: district?.trim() || null,
            lat: lat && !isNaN(lat) ? lat : null,
            lng: lng && !isNaN(lng) ? lng : null,
            phone: phone?.trim() || null,
          },
        });

        imported++;
        if (isFiveStarBrand(brand)) {
          fiveStarCount++;
        }
      } catch (error: any) {
        errors++;
        console.error(`❌ 导入失败: ${row.名称 || row.name}`, error.message);
      }
    }

    const progress = ((i + batch.length) / records.length * 100).toFixed(1);
    console.log(`  进度: ${progress}% (已导入: ${imported}, 5星: ${fiveStarCount}, 跳过: ${skipped}, 错误: ${errors})\n`);
  }

  console.log('✅ 导入完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 总记录数: ${records.length}`);
  console.log(`  - 成功导入: ${imported}`);
  console.log(`  - 5星品牌: ${fiveStarCount}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 错误: ${errors}`);

  // 显示品牌统计
  const brandStats = await prisma.rawHotelData_Slim.groupBy({
    by: ['brand'],
    where: {
      brand: {
        in: FIVE_STAR_BRANDS,
      },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 10,
  });

  if (brandStats.length > 0) {
    console.log('\n📋 5星品牌统计（Top 10）:');
    brandStats.forEach((stat, i) => {
      console.log(`  ${i + 1}. ${stat.brand || '未知'}: ${stat._count.id} 家`);
    });
  }
}

/**
 * 主函数
 */
async function main() {
  const csvFilePath = process.argv[2];
  const starRating = process.argv[3] ? parseInt(process.argv[3]) : 5;

  if (!csvFilePath) {
    console.error('❌ 请提供 CSV 文件路径');
    console.log('\n使用方法:');
    console.log('  npx ts-node --project tsconfig.backend.json scripts/import-hotels-by-brand.ts <csv文件路径> [星级]');
    console.log('\n示例:');
    console.log('  npx ts-node --project tsconfig.backend.json scripts/import-hotels-by-brand.ts downloads/hotels.csv 5');
    process.exit(1);
  }

  try {
    await importHotelsFromCSV(csvFilePath, starRating);
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
