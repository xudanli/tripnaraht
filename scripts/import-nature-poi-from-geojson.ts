// scripts/import-nature-poi-from-geojson.ts
/**
 * 从 GeoJSON 导入自然 POI 数据
 * 
 * 使用示例：
 * npm run import:nature-poi -- --file ./data/iceland-volcanoes.geojson --source iceland_nsi --country IS
 * 
 * 支持的参数：
 * --file: GeoJSON 文件路径（必需）
 * --source: 数据来源（iceland_lmi | iceland_nsi | manual，默认 manual）
 * --country: 国家代码（默认 IS）
 * --city-id: 城市 ID（可选）
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NaturePoiService } from '../src/places/services/nature-poi.service';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const sourceIndex = args.indexOf('--source');
  const countryIndex = args.indexOf('--country');
  const cityIdIndex = args.indexOf('--city-id');

  if (fileIndex === -1 || !args[fileIndex + 1]) {
    console.error('❌ 错误: 必须指定 --file 参数');
    console.log('\n使用示例:');
    console.log('  npm run import:nature-poi -- --file ./data/volcanoes.geojson --source iceland_nsi --country IS');
    process.exit(1);
  }

  const filePath = args[fileIndex + 1];
  const source = (sourceIndex !== -1 && args[sourceIndex + 1]) as 'iceland_lmi' | 'iceland_nsi' | 'manual' || 'manual';
  const countryCode = (countryIndex !== -1 && args[countryIndex + 1]) || 'IS';
  const cityId = cityIdIndex !== -1 && args[cityIdIndex + 1] ? parseInt(args[cityIdIndex + 1], 10) : undefined;

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 错误: 文件不存在: ${filePath}`);
    process.exit(1);
  }

  // 读取 GeoJSON 文件
  console.log(`📂 读取文件: ${filePath}`);
  let geojson: any;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    geojson = JSON.parse(fileContent);
  } catch (error: any) {
    console.error(`❌ 错误: 无法读取或解析 GeoJSON 文件: ${error.message}`);
    process.exit(1);
  }

  // 验证 GeoJSON 格式
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    console.error('❌ 错误: 无效的 GeoJSON 格式，必须是 FeatureCollection');
    process.exit(1);
  }

  console.log(`✅ 找到 ${geojson.features.length} 个要素`);
  console.log(`📊 数据源: ${source}`);
  console.log(`🌍 国家代码: ${countryCode}`);
  if (cityId) {
    console.log(`🏙️  城市 ID: ${cityId}`);
  }

  // 启动 NestJS 应用
  const app = await NestFactory.createApplicationContext(AppModule);
  const naturePoiService = app.get(NaturePoiService);

  // 导入数据
  console.log('\n🚀 开始导入...');
  const startTime = Date.now();

  try {
    const result = await naturePoiService.importFromGeoJSON(
      geojson,
      source,
      countryCode,
      cityId
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ 导入完成！');
    console.log(`⏱️  耗时: ${duration} 秒`);
    console.log(`\n📊 统计结果:`);
    console.log(`  总计: ${result.total}`);
    console.log(`  ✅ 成功创建: ${result.created}`);
    console.log(`  ⏭️  跳过（已存在）: ${result.skipped}`);
    console.log(`  ❌ 错误: ${result.errors}`);

    if (result.errors > 0) {
      console.log('\n⚠️  错误详情:');
      result.results
        .filter(r => r.status === 'error')
        .slice(0, 10) // 只显示前 10 个错误
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
      if (result.results.filter(r => r.status === 'error').length > 10) {
        console.log(`  ... 还有 ${result.results.filter(r => r.status === 'error').length - 10} 个错误`);
      }
    }

    // 保存结果到文件
    const resultPath = path.join(
      path.dirname(filePath),
      `import-result-${Date.now()}.json`
    );
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\n💾 详细结果已保存到: ${resultPath}`);
  } catch (error: any) {
    console.error(`\n❌ 导入失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error('❌ 未处理的错误:', error);
  process.exit(1);
});
