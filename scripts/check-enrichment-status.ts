#!/usr/bin/env tsx
/**
 * 检查数据填充情况统计脚本
 * 
 * 使用方法：
 *   tsx scripts/check-enrichment-status.ts
 *   tsx scripts/check-enrichment-status.ts --file=data/iceland_poi_enriched.json.geojson
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    fid?: number;
    nafnFitju?: string | null;
    nameCN?: string | null;
    nameEN?: string | null;
    description?: string | null;
    category?: string | null;
    tags?: string[] | null;
    address?: string | null;
    enrichedMetadata?: any;
    [key: string]: any;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

interface EnrichmentStats {
  total: number;
  withNameIS: number;
  withNameCN: number;
  withNameEN: number;
  withDescription: number;
  withCategory: number;
  withTags: number;
  withAddress: number;
  withEnrichedMetadata: number;
  complete: number; // 有名称+描述+类别
  incomplete: number;
  placeholderNames: number; // 占位符名称
}

function parseArgs(): { file: string } {
  const args = process.argv.slice(2);
  let file = 'data/iceland_poi_enriched.json.geojson';
  
  // 支持 --file=xxx 和 --file xxx 两种格式
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--file=')) {
      file = arg.split('=')[1];
    } else if (arg === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    }
  }
  
  return { file };
}

function checkEnrichmentStatus(geojson: GeoJSON): EnrichmentStats {
  const stats: EnrichmentStats = {
    total: geojson.features.length,
    withNameIS: 0,
    withNameCN: 0,
    withNameEN: 0,
    withDescription: 0,
    withCategory: 0,
    withTags: 0,
    withAddress: 0,
    withEnrichedMetadata: 0,
    complete: 0,
    incomplete: 0,
    placeholderNames: 0,
  };

  for (const feature of geojson.features) {
    const props = feature.properties;
    
    // 检查各种字段
    if (props.nafnFitju && props.nafnFitju.trim() !== '') {
      stats.withNameIS++;
      if (props.nafnFitju.startsWith('未命名地点')) {
        stats.placeholderNames++;
      }
    }
    
    if (props.nameCN && props.nameCN.trim() !== '') {
      stats.withNameCN++;
      if (props.nameCN.startsWith('未命名地点')) {
        stats.placeholderNames++;
      }
    }
    
    if (props.nameEN && props.nameEN.trim() !== '') {
      stats.withNameEN++;
      if (props.nameEN.startsWith('未命名地点')) {
        stats.placeholderNames++;
      }
    }
    
    if (props.description && props.description.trim() !== '') {
      stats.withDescription++;
    }
    
    if (props.category && props.category.trim() !== '') {
      stats.withCategory++;
    }
    
    if (props.tags && Array.isArray(props.tags) && props.tags.length > 0) {
      stats.withTags++;
    }
    
    if (props.address && props.address.trim() !== '') {
      stats.withAddress++;
    }
    
    if (props.enrichedMetadata && Object.keys(props.enrichedMetadata).length > 0) {
      stats.withEnrichedMetadata++;
    }
    
    // 判断是否完整（有名称+描述+类别）
    const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
    const hasValidName = hasName && 
      !(props.nafnFitju?.startsWith('未命名地点') || 
        props.nameCN?.startsWith('未命名地点') || 
        props.nameEN?.startsWith('未命名地点'));
    const hasDescription = !!(props.description && props.description.trim() !== '');
    const hasCategory = !!(props.category && props.category.trim() !== '');
    
    if (hasValidName && hasDescription && hasCategory) {
      stats.complete++;
    } else {
      stats.incomplete++;
    }
  }

  return stats;
}

function formatPercentage(count: number, total: number): string {
  if (total === 0) return '0.00%';
  return `${((count / total) * 100).toFixed(2)}%`;
}

async function main() {
  const options = parseArgs();
  const filePath = path.resolve(process.cwd(), options.file);

  console.log('='.repeat(60));
  console.log('数据填充情况检查');
  console.log('='.repeat(60));
  console.log(`文件: ${options.file}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    console.log('\n提示：如果还没有运行填充脚本，请先运行：');
    console.log('  npm run script:enrich-iceland-poi');
    process.exit(1);
  }

  try {
    console.log('📖 读取文件...');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const geojson: GeoJSON = JSON.parse(fileContent);

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      console.error('❌ 无效的 GeoJSON 格式');
      process.exit(1);
    }

    console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);

    // 统计填充情况
    console.log('📊 分析填充情况...');
    const stats = checkEnrichmentStatus(geojson);

    // 显示统计结果
    console.log('\n' + '='.repeat(60));
    console.log('填充统计结果');
    console.log('='.repeat(60));
    console.log(`总计: ${stats.total}`);
    console.log('');
    
    console.log('名称字段:');
    console.log(`  - 冰岛语名称 (nafnFitju): ${stats.withNameIS} (${formatPercentage(stats.withNameIS, stats.total)})`);
    console.log(`  - 中文名称 (nameCN): ${stats.withNameCN} (${formatPercentage(stats.withNameCN, stats.total)})`);
    console.log(`  - 英文名称 (nameEN): ${stats.withNameEN} (${formatPercentage(stats.withNameEN, stats.total)})`);
    console.log(`  - 占位符名称: ${stats.placeholderNames} (${formatPercentage(stats.placeholderNames, stats.total)})`);
    console.log('');
    
    console.log('其他字段:');
    console.log(`  - 描述 (description): ${stats.withDescription} (${formatPercentage(stats.withDescription, stats.total)})`);
    console.log(`  - 类别 (category): ${stats.withCategory} (${formatPercentage(stats.withCategory, stats.total)})`);
    console.log(`  - 标签 (tags): ${stats.withTags} (${formatPercentage(stats.withTags, stats.total)})`);
    console.log(`  - 地址 (address): ${stats.withAddress} (${formatPercentage(stats.withAddress, stats.total)})`);
    console.log(`  - 填充元数据 (enrichedMetadata): ${stats.withEnrichedMetadata} (${formatPercentage(stats.withEnrichedMetadata, stats.total)})`);
    console.log('');
    
    console.log('完整性评估:');
    console.log(`  ✅ 完整数据（名称+描述+类别）: ${stats.complete} (${formatPercentage(stats.complete, stats.total)})`);
    console.log(`  ⚠️  不完整数据: ${stats.incomplete} (${formatPercentage(stats.incomplete, stats.total)})`);
    console.log('');

    // 显示一些示例
    if (stats.complete > 0) {
      console.log('📋 完整数据示例（前3条）:');
      let count = 0;
      for (const feature of geojson.features) {
        const props = feature.properties;
        const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
        const hasValidName = hasName && 
          !(props.nafnFitju?.startsWith('未命名地点') || 
            props.nameCN?.startsWith('未命名地点') || 
            props.nameEN?.startsWith('未命名地点'));
        const hasDescription = !!(props.description && props.description.trim() !== '');
        const hasCategory = !!(props.category && props.category.trim() !== '');
        
        if (hasValidName && hasDescription && hasCategory && count < 3) {
          console.log(`  ${count + 1}. ${props.nameCN || props.nameEN || props.nafnFitju}`);
          console.log(`     描述: ${props.description?.substring(0, 50)}...`);
          console.log(`     类别: ${props.category}`);
          count++;
        }
      }
      console.log('');
    }

    if (stats.incomplete > 0) {
      console.log('📋 不完整数据示例（前3条）:');
      let count = 0;
      for (const feature of geojson.features) {
        const props = feature.properties;
        const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
        const hasValidName = hasName && 
          !(props.nafnFitju?.startsWith('未命名地点') || 
            props.nameCN?.startsWith('未命名地点') || 
            props.nameEN?.startsWith('未命名地点'));
        const hasDescription = !!(props.description && props.description.trim() !== '');
        const hasCategory = !!(props.category && props.category.trim() !== '');
        
        if (!(hasValidName && hasDescription && hasCategory) && count < 3) {
          console.log(`  ${count + 1}. fid=${props.fid}`);
          console.log(`     名称: ${props.nameCN || props.nameEN || props.nafnFitju || '无'}`);
          console.log(`     描述: ${hasDescription ? '有' : '无'}`);
          console.log(`     类别: ${hasCategory ? props.category : '无'}`);
          count++;
        }
      }
      console.log('');
    }

    console.log('✅ 检查完成！');
  } catch (error: any) {
    console.error('\n❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
