// scripts/import-cities-to-db.ts

/**
 * 导入全球城市数据到 City 表
 * 
 * 使用方法:
 *   npm run import:cities <数据文件路径>
 * 
 * 数据文件格式支持:
 *   - JSON 数组: [{ name: "北京", countryCode: "CN", adcode: "110000" }, ...]
 *   - JSON 对象数组: 同上
 * 
 * 示例:
 *   npm run import:cities cities.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CityData {
  name: string;        // 城市名称（必需，本地名称）
  nameCN?: string;     // 中文名称（可选）
  nameEN?: string;    // 英文名称（可选）
  countryCode: string; // 国家代码 ISO 3166-1 alpha-2（必需）
  latitude?: number;   // 纬度（可选）
  longitude?: number;  // 经度（可选）
  timezone?: string;   // 时区（可选，如 "Asia/Shanghai"）
  adcode?: string;     // 行政区划代码（可选，主要用于中国城市）
  metadata?: any;      // 扩展信息（可选，JSON 对象）
}

async function importCity(data: CityData): Promise<{ success: boolean; cityId?: number; error?: string }> {
  try {
    // 验证必需字段
    if (!data.name || !data.countryCode) {
      return {
        success: false,
        error: '缺少必需字段: name 或 countryCode',
      };
    }

    // 验证 countryCode 格式（2位大写字母）
    if (!/^[A-Z]{2}$/.test(data.countryCode)) {
      return {
        success: false,
        error: `无效的国家代码格式: ${data.countryCode} (应为2位大写字母，如 CN, US, FR)`,
      };
    }

    // 检查是否已存在（按 name + countryCode 去重）
    const existing = await prisma.city.findFirst({
      where: {
        name: data.name,
        countryCode: data.countryCode,
      },
    });

    if (existing) {
      console.log(`⏭️  已存在: ${data.name} (${data.countryCode}) - ID: ${existing.id}`);
      return {
        success: true,
        cityId: existing.id,
      };
    }

    // 准备创建数据
    const createData: any = {
      name: data.name,
      countryCode: data.countryCode,
      nameCN: data.nameCN || null,
      nameEN: data.nameEN || null,
      timezone: data.timezone || null,
      adcode: data.adcode || null,
      metadata: data.metadata || null,
    };

    // 如果有经纬度，设置 location（PostGIS Point）
    if (data.latitude !== undefined && data.longitude !== undefined) {
      // 使用原始 SQL 设置 PostGIS Point
      const result = await prisma.$queryRaw<Array<{ id: number; name: string; countryCode: string }>>`
        INSERT INTO "City" (name, "nameCN", "nameEN", "countryCode", location, timezone, adcode, metadata)
        VALUES (
          ${data.name},
          ${data.nameCN || null},
          ${data.nameEN || null},
          ${data.countryCode},
          ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326),
          ${data.timezone || null},
          ${data.adcode || null},
          ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb
        )
        RETURNING id, name, "countryCode"
      `;
      
      const createdCity = Array.isArray(result) ? result[0] : result;
      console.log(`✅ 已创建: ${data.name} (${data.countryCode}) - ID: ${createdCity.id}`);
      return {
        success: true,
        cityId: createdCity.id,
      };
    } else {
      // 没有坐标，直接创建
      const city = await prisma.city.create({
        data: createData as any,
      });

      console.log(`✅ 已创建: ${data.name} (${data.countryCode}) - ID: ${city.id}`);
      return {
        success: true,
        cityId: city.id,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

async function importFromFile(filePath: string): Promise<void> {
  console.log(`📂 读取文件: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  let cities: CityData[];

  try {
    const parsed = JSON.parse(fileContent);
    // 支持数组格式
    if (Array.isArray(parsed)) {
      cities = parsed;
    } else if (parsed.cities && Array.isArray(parsed.cities)) {
      cities = parsed.cities;
    } else {
      throw new Error('JSON 格式错误: 应为数组或包含 cities 数组的对象');
    }
  } catch (error: any) {
    console.error(`❌ JSON 解析失败: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 找到 ${cities.length} 条城市数据\n`);
  console.log('开始导入...\n');

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ city: string; error: string }> = [];

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const result = await importCity(city);

    if (result.success) {
      if (result.cityId) {
        successCount++;
      } else {
        skippedCount++;
      }
    } else {
      errorCount++;
      errors.push({
        city: `${city.name} (${city.countryCode})`,
        error: result.error || '未知错误',
      });
      console.error(`❌ 导入失败: ${city.name} (${city.countryCode}) - ${result.error}`);
    }

    // 每 100 条显示进度
    if ((i + 1) % 100 === 0) {
      console.log(`\n📈 进度: ${i + 1}/${cities.length}\n`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 导入统计:');
  console.log(`  ✅ 成功创建: ${successCount}`);
  console.log(`  ⏭️  已存在（跳过）: ${skippedCount}`);
  console.log(`  ❌ 失败: ${errorCount}`);
  console.log('='.repeat(50));

  if (errors.length > 0) {
    console.log('\n❌ 错误详情:');
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.city}: ${e.error}`);
    });
  }
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('❌ 请提供数据文件路径');
    console.error('\n使用方法:');
    console.error('  npm run import:cities <数据文件路径>');
    console.error('\n示例:');
    console.error('  npm run import:cities cities.json');
    console.error('\n数据文件格式 (JSON):');
    console.error(JSON.stringify([
      {
        name: '北京',
        nameCN: '北京',
        nameEN: 'Beijing',
        countryCode: 'CN',
        latitude: 39.9042,
        longitude: 116.4074,
        timezone: 'Asia/Shanghai',
        adcode: '110000',
      },
      {
        name: 'New York',
        nameCN: '纽约',
        nameEN: 'New York',
        countryCode: 'US',
        latitude: 40.7128,
        longitude: -74.0060,
        timezone: 'America/New_York',
      },
    ], null, 2));
    process.exit(1);
  }

  try {
    await importFromFile(filePath);
  } catch (error: any) {
    console.error(`❌ 导入失败: ${error?.message || String(error)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

