// scripts/import-cities-from-csv.ts

/**
 * 从 CSV 文件导入城市数据到数据库
 * 
 * 使用方法:
 *   npm run import:cities:csv <CSV文件路径>
 * 
 * 示例:
 *   npm run import:cities:csv scripts/all_city.csv
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface CityData {
  name: string;
  nameCN?: string;
  nameEN?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  metadata?: any;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

function convertRowToCityData(headers: string[], row: string[]): CityData | null {
  const rowData: Record<string, string> = {};
  headers.forEach((header, idx) => {
    rowData[header] = row[idx] || '';
  });
  
  // 必需字段
  const name = rowData['NAME']?.trim();
  const countryCode = rowData['ISO_A2']?.trim().toUpperCase();
  
  if (!name || !countryCode || countryCode.length !== 2) {
    return null;
  }
  
  const cityData: CityData = {
    name,
    countryCode,
  };
  
  // 中文名称
  const nameCN = rowData['NAME_ZH'] || rowData['NAME_ZHT'];
  if (nameCN?.trim()) {
    cityData.nameCN = nameCN.trim();
  }
  
  // 英文名称
  const nameEN = rowData['NAME_EN'];
  if (nameEN?.trim()) {
    cityData.nameEN = nameEN.trim();
  }
  
  // 坐标
  const latStr = rowData['纬度']?.trim();
  const lngStr = rowData['经度']?.trim();
  if (latStr && lngStr) {
    try {
      cityData.latitude = parseFloat(latStr);
      cityData.longitude = parseFloat(lngStr);
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  // 时区
  const timezone = rowData['TIMEZONE'] || rowData['TIMEZO'];
  if (timezone?.trim() && timezone.length > 3) {
    cityData.timezone = timezone.trim();
  }
  
  // Metadata
  const metadata: any = {};
  
  // 外部ID
  if (rowData['WIKIDATAID']?.trim()) {
    metadata.wikidataId = rowData['WIKIDATAID'].trim();
  }
  if (rowData['GEONAMESID']?.trim()) {
    try {
      metadata.geonamesId = parseInt(rowData['GEONAMESID'].trim());
    } catch (e) {
      metadata.geonamesId = rowData['GEONAMESID'].trim();
    }
  }
  if (rowData['WOF_ID']?.trim()) {
    try {
      metadata.wofId = parseInt(rowData['WOF_ID'].trim());
    } catch (e) {
      metadata.wofId = rowData['WOF_ID'].trim();
    }
  }
  
  // 要素分类
  if (rowData['FEATURECLA']?.trim()) {
    metadata.featureClass = rowData['FEATURECLA'].trim();
  }
  
  // 其他语言名称
  const langMap: Record<string, string> = {
    'NAME_DE': 'nameDE',
    'NAME_ES': 'nameES',
    'NAME_FR': 'nameFR',
    'NAME_JA': 'nameJA',
    'NAME_KO': 'nameKO',
  };
  
  for (const [source, target] of Object.entries(langMap)) {
    if (rowData[source]?.trim()) {
      metadata[target] = rowData[source].trim();
    }
  }
  
  if (Object.keys(metadata).length > 0) {
    cityData.metadata = metadata;
  }
  
  return cityData;
}

async function importCitiesFromCSV(filePath: string): Promise<void> {
  console.log(`📂 读取文件: ${filePath}\n`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  let headers: string[] = [];
  let lineNumber = 0;
  const citiesData: CityData[] = [];
  let skipped = 0;
  
  console.log('🔄 解析 CSV 文件...\n');
  
  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      // 读取表头
      headers = parseCSVLine(line);
      console.log(`📊 找到 ${headers.length} 个字段\n`);
      continue;
    }
    
    const row = parseCSVLine(line);
    const cityData = convertRowToCityData(headers, row);
    
    if (cityData) {
      citiesData.push(cityData);
    } else {
      skipped++;
    }
    
    // 每 1000 行显示进度
    if (lineNumber % 1000 === 0) {
      process.stdout.write(`\r已解析: ${lineNumber} 行，有效数据: ${citiesData.length} 条`);
    }
  }
  
  console.log(`\n✅ 解析完成: ${lineNumber - 1} 行数据`);
  console.log(`✅ 有效数据: ${citiesData.length} 条`);
  console.log(`⏭️  跳过: ${skipped} 条\n`);
  
  if (citiesData.length === 0) {
    console.log('❌ 没有有效数据可导入');
    return;
  }
  
  // 导入数据库
  console.log('🔌 连接数据库...\n');
  console.log(`📊 开始导入 ${citiesData.length} 条数据...\n`);
  
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const batchSize = 500;
  
  for (let i = 0; i < citiesData.length; i++) {
    const city = citiesData[i];
    
    try {
      // 检查是否已存在
      const existing = await prisma.city.findFirst({
        where: {
          name: city.name,
          countryCode: city.countryCode,
        },
      });
      
      if (existing) {
        skippedCount++;
        if ((i + 1) % 100 === 0) {
          const progress = ((i + 1) / citiesData.length * 100).toFixed(1);
          console.log(`进度: ${i + 1}/${citiesData.length} (${progress}%) - 已存在: ${skippedCount}, 成功: ${successCount}, 错误: ${errorCount}`);
        }
        continue;
      }
      
      // 准备数据
      const createData: any = {
        name: city.name,
        countryCode: city.countryCode,
        nameCN: city.nameCN || null,
        nameEN: city.nameEN || null,
        timezone: city.timezone || null,
        metadata: city.metadata || null,
      };
      
      // 如果有坐标，使用 PostGIS
      if (city.latitude !== undefined && city.longitude !== undefined) {
        await prisma.$executeRaw`
          INSERT INTO "City" (name, "nameCN", "nameEN", "countryCode", location, timezone, metadata)
          VALUES (
            ${createData.name},
            ${createData.nameCN},
            ${createData.nameEN},
            ${createData.countryCode},
            ST_SetSRID(ST_MakePoint(${city.longitude}, ${city.latitude}), 4326),
            ${createData.timezone},
            ${createData.metadata ? JSON.stringify(createData.metadata) : null}::jsonb
          )
          RETURNING id
        `;
      } else {
        await prisma.city.create({
          data: createData as any,
        });
      }
      
      successCount++;
      
      // 每 batchSize 条显示进度
      if ((i + 1) % batchSize === 0) {
        await prisma.$executeRaw`COMMIT`;
        const progress = ((i + 1) / citiesData.length * 100).toFixed(1);
        console.log(`进度: ${i + 1}/${citiesData.length} (${progress}%) - 已存在: ${skippedCount}, 成功: ${successCount}, 错误: ${errorCount}`);
      } else if ((i + 1) % 100 === 0) {
        const progress = ((i + 1) / citiesData.length * 100).toFixed(1);
        console.log(`进度: ${i + 1}/${citiesData.length} (${progress}%) - 已存在: ${skippedCount}, 成功: ${successCount}, 错误: ${errorCount}`);
      }
      
    } catch (error: any) {
      errorCount++;
      console.error(`❌ 导入失败: ${city.name} (${city.countryCode}) - ${error?.message || String(error)}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 导入完成:');
  console.log(`  ✅ 成功创建: ${successCount}`);
  console.log(`  ⏭️  已存在（跳过）: ${skippedCount}`);
  console.log(`  ❌ 失败: ${errorCount}`);
  console.log('='.repeat(50) + '\n');
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('❌ 请提供 CSV 文件路径');
    console.error('\n使用方法:');
    console.error('  npm run import:cities:csv <CSV文件路径>');
    console.error('\n示例:');
    console.error('  npm run import:cities:csv scripts/all_city.csv');
    process.exit(1);
  }
  
  try {
    await importCitiesFromCSV(filePath);
  } catch (error: any) {
    console.error(`❌ 导入失败: ${error?.message || String(error)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

