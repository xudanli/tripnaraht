#!/usr/bin/env ts-node

/**
 * 导入单个城市的 DEM 数据
 * 
 * 使用方法：
 *   npm run import:dem:city -- --city "拉萨市" --tif "data/geographic/dem/china/cities/拉萨市.tif"
 *   npm run import:dem:city -- --city "拉萨市" --tif "path/to/拉萨市.tif" --drop-existing
 * 
 * 功能：
 * 1. 将城市名转换为表名（拼音）
 * 2. 导入 DEM 数据到独立的城市表
 * 3. 创建辅助函数（如果需要）
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * 将中文城市名转换为表名（拼音）
 * 简化版本：移除常见后缀，转换为小写拼音
 */
function cityNameToTableName(cityName: string): string {
  // 移除常见后缀
  let name = cityName
    .replace(/市$/, '')
    .replace(/地区$/, '')
    .replace(/自治州$/, '')
    .replace(/盟$/, '')
    .replace(/县$/, '')
    .replace(/区$/, '');
  
  // 简单的拼音映射（常用城市）
  const pinyinMap: Record<string, string> = {
    '拉萨': 'lasa',
    '日喀则': 'rikaze',
    '林芝': 'linzhi',
    '昌都': 'changdu',
    '那曲': 'naqu',
    '阿里': 'ali',
    '北京': 'beijing',
    '上海': 'shanghai',
    '天津': 'tianjin',
    '重庆': 'chongqing',
    '成都': 'chengdu',
    '杭州': 'hangzhou',
    '广州': 'guangzhou',
    '深圳': 'shenzhen',
    '西安': 'xian',
    '南京': 'nanjing',
    '武汉': 'wuhan',
    '苏州': 'suzhou',
    '青岛': 'qingdao',
    '大连': 'dalian',
    '厦门': 'xiamen',
    '昆明': 'kunming',
    '乌鲁木齐': 'wulumuqi',
    '呼和浩特': 'huhehaote',
    '银川': 'yinchuan',
    '西宁': 'xining',
    '兰州': 'lanzhou',
    '哈尔滨': 'haerbin',
    '长春': 'changchun',
    '沈阳': 'shenyang',
  };
  
  if (pinyinMap[name]) {
    return `geo_dem_city_${pinyinMap[name]}`;
  }
  
  // 如果没有映射，使用拼音库或简单转换
  // 这里使用简单的音译（实际应该使用 pinyin 库）
  const simplePinyin = name
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
    .replace(/\s+/g, '_');
  
  // 如果包含中文，提示用户提供拼音
  if (/[\u4e00-\u9fa5]/.test(name)) {
    console.warn(`⚠️  警告: 城市名 "${cityName}" 未找到拼音映射，将使用简化名称`);
    console.warn(`   建议在脚本中添加映射，或使用 --table 参数指定表名`);
  }
  
  return `geo_dem_city_${simplePinyin}`;
}

interface ImportOptions {
  cityName: string;
  tifPath: string;
  tableName?: string;
  dropExisting?: boolean;
  srid?: number;
}

/**
 * 导入城市 DEM 数据
 */
async function importCityDEM(options: ImportOptions): Promise<void> {
  const {
    cityName,
    tifPath,
    tableName: providedTableName,
    dropExisting = false,
    srid = 4326,
  } = options;

  // 确定表名
  const tableName = providedTableName || cityNameToTableName(cityName);

  console.log('\n🔄 开始导入城市 DEM 数据\n');
  console.log(`🏙️  城市: ${cityName}`);
  console.log(`📁 TIF 文件: ${tifPath}`);
  console.log(`📋 表名: ${tableName}`);
  console.log(`🗺️  SRID: ${srid}\n`);

  // 检查文件是否存在
  if (!fs.existsSync(tifPath)) {
    throw new Error(`TIF 文件不存在: ${tifPath}`);
  }

  // 获取数据库连接信息
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 环境变量未设置');
  }

  // 解析数据库连接信息
  const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!urlMatch) {
    throw new Error('无法解析 DATABASE_URL');
  }

  const [, user, password, host, port, database] = urlMatch;

  try {
    // 如果 dropExisting，先删除表
    if (dropExisting) {
      console.log('🗑️  删除现有表...');
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
        console.log('✅ 表已删除\n');
      } catch (error) {
        console.warn('⚠️  删除表时出错（可能不存在）:', error instanceof Error ? error.message : error);
      }
    }

    // 检查表是否已存在
    const tableCheck = await prisma.$queryRawUnsafe(`
      SELECT table_schema as schema_name, table_name
      FROM information_schema.tables
      WHERE table_name = '${tableName}';
    `) as Array<{ schema_name: string; table_name: string }>;

    if (tableCheck.length > 0 && !dropExisting) {
      console.log(`⚠️  表 ${tableName} 已存在，跳过导入。使用 --drop-existing 重新导入。\n`);
      return;
    }

    console.log('📥 使用 raster2pgsql 导入 DEM 数据...');
    console.log('   （这可能需要几分钟，取决于文件大小）\n');

    // 构建 raster2pgsql 命令
    const raster2pgsqlCmd = [
      'raster2pgsql',
      '-s', srid.toString(),
      '-I',  // 创建 GIST 索引
      '-C',  // 应用栅格约束
      '-t', '256x256',  // 瓦片大小
      '-F',  // 添加文件名列
      tifPath,
      tableName,
    ].join(' ');

    // 执行导入
    const psqlCmd = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database}`;
    const fullCmd = `${raster2pgsqlCmd} | ${psqlCmd}`;

    console.log('执行命令:', raster2pgsqlCmd);
    console.log('（输出已隐藏，请等待...）\n');

    try {
      execSync(fullCmd, {
        stdio: 'pipe',
        shell: '/bin/bash',
        env: {
          ...process.env,
          PGPASSWORD: password,
        },
      });
      console.log('✅ DEM 数据导入成功！\n');
    } catch (error) {
      console.error('\n❌ raster2pgsql 导入失败:', error instanceof Error ? error.message : error);
      throw error;
    }

    // 验证导入
    console.log('🔍 验证导入结果...');
    const schema = tableCheck.length > 0 ? tableCheck[0].schema_name : 'public';
    const fullTableName = schema !== 'public' ? `${schema}.${tableName}` : tableName;

    const countResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM ${fullTableName};
    `) as Array<{ count: bigint }>;
    const count = Number(countResult[0]?.count || 0);
    console.log(`✅ 已导入 ${count} 个栅格瓦片到 ${fullTableName}\n`);

    // 获取栅格元数据
    const metadataResult = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_Width(rast) as width,
        ST_Height(rast) as height,
        ST_SRID(rast) as srid,
        ST_ScaleX(rast) as scale_x,
        ST_ScaleY(rast) as scale_y,
        ST_UpperLeftX(rast) as upper_left_x,
        ST_UpperLeftY(rast) as upper_left_y
      FROM ${fullTableName}
      LIMIT 1;
    `) as Array<{
      width: number;
      height: number;
      srid: number;
      scale_x: number;
      scale_y: number;
      upper_left_x: number;
      upper_left_y: number;
    }>;

    if (metadataResult.length > 0) {
      const meta = metadataResult[0];
      console.log('📊 栅格元数据:');
      console.log(`   尺寸: ${meta.width} x ${meta.height}`);
      console.log(`   SRID: ${meta.srid}`);
      console.log(`   分辨率: ${Math.abs(meta.scale_x)}° x ${Math.abs(meta.scale_y)}°`);
      console.log(`   左上角: (${meta.upper_left_x}, ${meta.upper_left_y})\n`);
    }

    console.log('✅ 城市 DEM 数据导入完成！\n');
    console.log('💡 提示:');
    console.log(`   - 表名: ${tableName}`);
    console.log(`   - 查询示例: SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(91.1322, 29.6544), 4326))::INTEGER FROM ${tableName} WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(91.1322, 29.6544), 4326)) LIMIT 1;\n`);

  } catch (error) {
    console.error('\n❌ 导入失败:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let cityName = '';
  let tifPath = '';
  let tableName: string | undefined;
  let dropExisting = false;
  let srid = 4326;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--city' && args[i + 1]) {
      cityName = args[i + 1];
      i++;
    } else if (args[i] === '--tif' && args[i + 1]) {
      tifPath = args[i + 1];
      i++;
    } else if (args[i] === '--table' && args[i + 1]) {
      tableName = args[i + 1];
      i++;
    } else if (args[i] === '--srid' && args[i + 1]) {
      srid = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--drop-existing') {
      dropExisting = true;
    }
  }

  if (!cityName || !tifPath) {
    console.error('❌ 错误: 缺少必需参数');
    console.error('\n使用方法:');
    console.error('  npm run import:dem:city -- --city "拉萨市" --tif "data/geographic/dem/china/cities/拉萨市.tif"');
    console.error('  npm run import:dem:city -- --city "拉萨市" --tif <path> --table geo_dem_city_lasa --drop-existing');
    console.error('\n参数:');
    console.error('  --city <城市名>       城市名称（必需）');
    console.error('  --tif <文件路径>      TIF 文件路径（必需）');
    console.error('  --table <表名>        自定义表名（可选，默认自动生成）');
    console.error('  --srid <SRID>        坐标系统 ID（默认 4326）');
    console.error('  --drop-existing       删除现有表后重新导入');
    process.exit(1);
  }

  try {
    await importCityDEM({ cityName, tifPath, tableName, dropExisting, srid });
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

