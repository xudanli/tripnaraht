// scripts/seed-visa-requirements.ts
// 将抓取的签证信息导入数据库

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as countries from 'i18n-iso-countries';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 注册英文语言包（使用动态导入）
try {
  const enLocale = require('i18n-iso-countries/langs/en.json');
  countries.registerLocale(enLocale);
} catch (error) {
  console.warn('⚠️  无法加载英文语言包，将使用默认语言');
}

/**
 * 签证信息接口（与抓取脚本一致）
 */
interface VisaInfo {
  country: string;
  requirementRaw: string;
  status: 'VISA_FREE' | 'VISA_ON_ARRIVAL' | 'E_VISA' | 'VISA_REQUIRED';
  allowedStay?: string;
  notes?: string;
}

/**
 * 国家名映射表（处理特殊情况）
 * 
 * Wikipedia 的国家名可能与 ISO 标准不完全一致
 */
const countryNameMapping: Record<string, string> = {
  'United States': 'United States of America',
  'United Kingdom': 'United Kingdom', // 直接使用，i18n-iso-countries 支持
  'United Kingdom and Crown dependencies': 'United Kingdom', // Wikipedia 特殊名称
  'Russia': 'Russian Federation',
  'South Korea': 'Korea, Republic of',
  'North Korea': 'Korea, Democratic People\'s Republic of',
  'Czech Republic': 'Czechia',
  'Macedonia': 'North Macedonia',
  'Myanmar': 'Myanmar',
  'Palestine': 'Palestinian Territory',
  'Syria': 'Syrian Arab Republic',
  'Vietnam': 'Vietnam', // 直接使用，i18n-iso-countries 支持
  'Laos': 'Lao People\'s Democratic Republic',
  'Brunei': 'Brunei Darussalam',
  'East Timor': 'Timor-Leste',
  'Ivory Coast': 'Côte d\'Ivoire',
  'Cape Verde': 'Cabo Verde', // 注意：i18n-iso-countries 可能不支持，需要特殊处理
  'Micronesia': 'Micronesia, Federated States of',
  'Moldova': 'Moldova, Republic of',
  'São Tomé and Príncipe': 'Sao Tome and Principe',
  'Vatican City': 'Holy See (Vatican City State)',
};

/**
 * 主函数：导入签证信息
 */
async function main() {
  console.log('📥 开始导入签证信息...\n');
  
  const filePath = path.join(process.cwd(), 'visa_requirements.json');
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    console.error('   请先运行: npm run scrape:visa');
    process.exit(1);
  }
  
  const visaData: VisaInfo[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  console.log(`📋 读取到 ${visaData.length} 条签证信息\n`);
  
  let successCount = 0;
  let updateCount = 0;
  let createCount = 0;
  let notFoundCount = 0;
  const notFoundCountries: string[] = [];
  
  for (const item of visaData) {
    try {
      // 1. 国家名映射（处理特殊情况）
      let countryName = item.country;
      if (countryNameMapping[countryName]) {
        countryName = countryNameMapping[countryName];
      }
      
      // 2. 转换为 ISO 代码
      let countryCode = countries.getAlpha2Code(countryName, 'en');
      
      // 特殊处理：Cape Verde 和 North Korea（i18n-iso-countries 库可能不支持某些变体）
      if (!countryCode) {
        if (countryName === 'Cabo Verde' || countryName === 'Cape Verde' || item.country === 'Cape Verde') {
          countryCode = 'CV'; // 手动指定
        } else if (countryName === 'Korea, Democratic People\'s Republic of' || item.country === 'North Korea') {
          countryCode = 'KP'; // 手动指定
        }
      }
      
      if (!countryCode) {
        notFoundCount++;
        notFoundCountries.push(item.country);
        console.warn(`⚠️  未找到国家代码: ${item.country}`);
        continue;
      }
      
      // 3. 查询现有记录
      const existing = await prisma.countryProfile.findUnique({
        where: { isoCode: countryCode },
      });
      
      // 4. 构建签证信息对象（与现有结构兼容）
      // 先保留现有字段（如果存在，如 cost, link 等），然后覆盖新数据
      const existingVisaInfo = (existing?.visaForCN as any) || {};
      const visaInfo = {
        ...existingVisaInfo,
        // 覆盖状态和基本信息
        status: item.status,
        requirement: item.requirementRaw,
        allowedStay: item.allowedStay || null,
        notes: item.notes || null,
      };
      
      if (existing) {
        // 更新现有记录
        await prisma.countryProfile.update({
          where: { isoCode: countryCode },
          data: {
            visaForCN: visaInfo as any,
          },
        });
        updateCount++;
        console.log(`✅ 已更新: ${item.country} (${countryCode}) - ${item.status}`);
      } else {
        // 创建新记录（只有基本信息）
        await prisma.countryProfile.create({
          data: {
            isoCode: countryCode,
            nameCN: item.country, // 临时名称，后续可手动更新
            visaForCN: visaInfo as any,
          },
        });
        createCount++;
        console.log(`✨ 已创建: ${item.country} (${countryCode}) - ${item.status}`);
      }
      
      successCount++;
    } catch (error) {
      console.error(`❌ 处理 ${item.country} 失败:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log(`\n📊 统计:`);
  console.log(`  总计: ${visaData.length} 个国家`);
  console.log(`  成功: ${successCount} 个`);
  console.log(`  创建: ${createCount} 个`);
  console.log(`  更新: ${updateCount} 个`);
  console.log(`  未找到代码: ${notFoundCount} 个`);
  
  if (notFoundCountries.length > 0) {
    console.log(`\n⚠️  未找到 ISO 代码的国家:`);
    notFoundCountries.forEach(name => console.log(`    - ${name}`));
  }
  
  console.log(`\n✅ 签证信息导入完成！`);
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

