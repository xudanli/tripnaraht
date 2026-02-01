#!/usr/bin/env tsx
/**
 * 验证冰岛超市POI数据导入结果
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛超市POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛超市（SHOPPING类别，且名称包含超市相关关键词）
    const supermarkets = await prisma.place.findMany({
      where: {
        category: PlaceCategory.SHOPPING,
        City: {
          countryCode: 'IS',
        },
        OR: [
          { nameCN: { contains: '超市' } },
          { nameCN: { contains: 'Bónus' } },
          { nameCN: { contains: 'Krónan' } },
          { nameCN: { contains: 'Hagkaup' } },
          { nameCN: { contains: '10-11' } },
          { nameEN: { contains: 'Bónus' } },
          { nameEN: { contains: 'Krónan' } },
          { nameEN: { contains: 'Hagkaup' } },
          { nameEN: { contains: '10-11' } },
        ],
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${supermarkets.length} 个冰岛超市\n`);

    // 2. 验证每个超市的数据完整性
    let validCount = 0;
    let invalidCount = 0;
    const issues: Array<{ name: string; issues: string[] }> = [];

    for (const supermarket of supermarkets) {
      const supermarketIssues: string[] = [];

      // 检查必需字段
      if (!supermarket.nameCN) supermarketIssues.push('缺少中文名称');
      if (!supermarket.nameEN) supermarketIssues.push('缺少英文名称');
      if (!supermarket.address) supermarketIssues.push('缺少地址');
      if (!supermarket.cityId) supermarketIssues.push('缺少城市ID');

      // 检查坐标
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${supermarket.id}
      `;
      
      if (locationQuery.length === 0 || !locationQuery[0].lng || !locationQuery[0].lat) {
        supermarketIssues.push('缺少坐标');
      } else {
        const { lng, lat } = locationQuery[0];
        // 冰岛大致范围：经度 -24.5 到 -13.5，纬度 63.3 到 66.5
        if (lng < -24.5 || lng > -13.5 || lat < 63.3 || lat > 66.5) {
          supermarketIssues.push(`坐标超出冰岛范围: (${lng}, ${lat})`);
        }
      }

      // 检查元数据
      const metadata = supermarket.metadata as any;
      if (!metadata) {
        supermarketIssues.push('缺少元数据');
      } else {
        // 检查关键元数据字段
        if (!metadata.chain_name_cn && !metadata.chain_name_en) {
          supermarketIssues.push('缺少超市链名称');
        }
        if (!metadata.priceLevel && !metadata.price_comparison) {
          supermarketIssues.push('缺少价格信息');
        }
      }

      if (supermarketIssues.length > 0) {
        invalidCount++;
        issues.push({
          name: supermarket.nameCN,
          issues: supermarketIssues,
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
    console.log('📝 超市详细信息：\n');
    for (let i = 0; i < supermarkets.length; i++) {
      const s = supermarkets[i];
      const metadata = s.metadata as any;

      // 获取坐标
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${s.id}
      `;
      const location = locationQuery.length > 0 ? locationQuery[0] : null;

      console.log(`${i + 1}. ${s.nameCN} (${s.nameEN})`);
      console.log(`   ID: ${s.id}`);
      console.log(`   城市: ${s.City?.nameCN || s.City?.nameEN || '未知'}`);
      console.log(`   地址: ${s.address || '无'}`);
      console.log(`   评分: ${s.rating || '无'}`);
      console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
      
      if (metadata) {
        console.log(`   超市链: ${metadata.chain_name_cn || metadata.chain_name_en || '无'}`);
        console.log(`   类别: ${metadata.category || '无'}`);
        console.log(`   价格等级: ${metadata.priceLevel || '无'}`);
        
        if (metadata.openingHours) {
          const hours = metadata.openingHours;
          if (hours.text) {
            console.log(`   营业时间: ${hours.text}`);
          } else if (hours.mon) {
            console.log(`   营业时间: ${hours.mon} (工作日)`);
          }
        }
        
        if (metadata.price_comparison) {
          const prices = metadata.price_comparison;
          if (prices.avg_basket_cost_daily) {
            console.log(`   日均购物成本: ${prices.avg_basket_cost_daily}`);
          }
        }
        
        if (metadata.highlights) {
          console.log(`   亮点: ${metadata.highlights}`);
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
    
    // 按超市链分组
    const chainGroups: Record<string, number> = {};
    supermarkets.forEach(s => {
      const metadata = s.metadata as any;
      const chainName = metadata?.chain_name_cn || metadata?.chain_name_en || '未知';
      chainGroups[chainName] = (chainGroups[chainName] || 0) + 1;
    });
    
    console.log('   按超市链分组:');
    Object.entries(chainGroups).forEach(([chain, count]) => {
      console.log(`     ${chain}: ${count} 个分店`);
    });

    const avgRating = supermarkets
      .filter(s => s.rating !== null)
      .reduce((sum, s) => sum + (s.rating || 0), 0) / supermarkets.filter(s => s.rating !== null).length;
    console.log(`   平均评分: ${avgRating.toFixed(2)}`);

    const cities = new Set(supermarkets.map(s => s.City?.nameCN || s.City?.nameEN).filter(Boolean));
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
