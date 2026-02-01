#!/usr/bin/env tsx
/**
 * 验证冰岛租车公司POI数据导入结果
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛租车公司POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛租车公司（TRANSIT_HUB类别，且名称包含"租车"或"Rental"）
    const carRentals = await prisma.place.findMany({
      where: {
        category: PlaceCategory.TRANSIT_HUB,
        City: {
          countryCode: 'IS',
        },
        OR: [
          { nameCN: { contains: '租车' } },
          { nameEN: { contains: 'Rental' } },
          { nameEN: { contains: 'Car Rental' } },
          { nameEN: { contains: 'Car Rent' } },
        ],
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${carRentals.length} 个冰岛租车公司\n`);

    // 2. 验证每个租车公司的数据完整性
    let validCount = 0;
    let invalidCount = 0;
    const issues: Array<{ name: string; issues: string[] }> = [];

    for (const company of carRentals) {
      const companyIssues: string[] = [];

      // 检查必需字段
      if (!company.nameCN) companyIssues.push('缺少中文名称');
      if (!company.nameEN) companyIssues.push('缺少英文名称');
      if (!company.address) companyIssues.push('缺少地址');
      if (!company.cityId) companyIssues.push('缺少城市ID');

      // 检查坐标
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${company.id}
      `;
      
      if (locationQuery.length === 0 || !locationQuery[0].lng || !locationQuery[0].lat) {
        companyIssues.push('缺少坐标');
      } else {
        const { lng, lat } = locationQuery[0];
        // 冰岛大致范围：经度 -24.5 到 -13.5，纬度 63.3 到 66.5
        if (lng < -24.5 || lng > -13.5 || lat < 63.3 || lat > 66.5) {
          companyIssues.push(`坐标超出冰岛范围: (${lng}, ${lat})`);
        }
      }

      // 检查元数据（只对真正的租车公司进行严格检查）
      const metadata = company.metadata as any;
      const isCarRental = company.nameCN.includes('租车') || 
                          company.nameEN.includes('Rental') ||
                          company.nameEN.includes('Car Rental');
      
      if (isCarRental) {
        if (!metadata) {
          companyIssues.push('缺少元数据');
        } else {
          // 检查关键元数据字段
          if (!metadata.company_type) companyIssues.push('缺少公司类型');
          if (!metadata.avg_price_per_day) companyIssues.push('缺少价格信息');
          if (!metadata.vehicle_options) companyIssues.push('缺少车辆选项');
        }
      }

      if (companyIssues.length > 0) {
        invalidCount++;
        issues.push({
          name: company.nameCN,
          issues: companyIssues,
        });
      } else {
        validCount++;
      }
    }

    // 3. 显示验证结果
    console.log('📋 验证结果：');
    console.log(`  ✅ 有效: ${validCount}`);
    console.log(`  ❌ 无效: ${invalidCount}\n`);

    // 4. 显示详细信息
    console.log('📝 租车公司详细信息：\n');
    for (let i = 0; i < carRentals.length; i++) {
      const c = carRentals[i];
      const metadata = c.metadata as any;

      // 获取坐标
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${c.id}
      `;
      const location = locationQuery.length > 0 ? locationQuery[0] : null;

      console.log(`${i + 1}. ${c.nameCN} (${c.nameEN})`);
      console.log(`   ID: ${c.id}`);
      console.log(`   城市: ${c.City?.nameCN || c.City?.nameEN || '未知'}`);
      console.log(`   地址: ${c.address || '无'}`);
      console.log(`   评分: ${c.rating || '无'}`);
      console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
      console.log(`   Google Place ID: ${c.googlePlaceId || '无'}`);
      
      if (metadata) {
        console.log(`   公司类型: ${metadata.company_type || '无'}`);
        console.log(`   市场定位: ${metadata.market_segment || '无'}`);
        console.log(`   声誉: ${metadata.reputation || '无'}`);
        console.log(`   价格等级: ${metadata.priceLevel || '无'}`);
        
        if (metadata.avg_price_per_day) {
          const prices = metadata.avg_price_per_day;
          if (prices.economy_car) {
            console.log(`   经济型车: ${prices.economy_car.value} ${prices.economy_car.currency}/天`);
          }
          if (prices.suv_4wd) {
            console.log(`   SUV四驱: ${prices.suv_4wd.value} ${prices.suv_4wd.currency}/天`);
          }
        }
        
        if (metadata.locations) {
          const locationCount = Object.keys(metadata.locations).length;
          console.log(`   门店数量: ${locationCount}`);
        }
        
        if (metadata.insurance_options) {
          console.log(`   保险选项: ${metadata.insurance_options.length} 种`);
        }
      }

      console.log('');
    }

    // 5. 显示问题（如果有）
    if (issues.length > 0) {
      console.log('⚠️  发现的问题：\n');
      for (const issue of issues) {
        console.log(`  ${issue.name}:`);
        for (const problem of issue.issues) {
          console.log(`    - ${problem}`);
        }
        console.log('');
      }
    }

    // 6. 统计信息
    console.log('📊 统计信息：');
    const internationalCount = carRentals.filter(c => {
      const metadata = c.metadata as any;
      return metadata?.company_type === 'INTERNATIONAL_CHAIN' || 
             metadata?.company_type === 'INTERNATIONAL_BUDGET' ||
             metadata?.company_type === 'INTERNATIONAL_EUROPEAN';
    }).length;
    const localCount = carRentals.filter(c => {
      const metadata = c.metadata as any;
      return metadata?.company_type === 'LOCAL_ICELANDIC';
    }).length;
    console.log(`   国际品牌: ${internationalCount}`);
    console.log(`   本地品牌: ${localCount}`);

    const avgRating = carRentals
      .filter(c => c.rating !== null)
      .reduce((sum, c) => sum + (c.rating || 0), 0) / carRentals.filter(c => c.rating !== null).length;
    console.log(`   平均评分: ${avgRating.toFixed(2)}`);

    const cities = new Set(carRentals.map(c => c.City?.nameCN || c.City?.nameEN).filter(Boolean));
    console.log(`   覆盖城市: ${Array.from(cities).join(', ')}`);

  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
