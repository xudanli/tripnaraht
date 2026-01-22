#!/usr/bin/env tsx
/**
 * 使用 DeepSeek API 根据经纬度匹配并填充完整的地点数据
 * 
 * 功能：
 * 1. 读取 GeoJSON 文件
 * 2. 对于每个地点，根据经纬度调用 DeepSeek API
 * 3. AI 根据坐标生成或补充完整的地点信息（名称、描述、类别等）
 * 4. 填充回 GeoJSON 数据
 * 
 * 使用方法：
 *   tsx scripts/enrich-iceland-poi-with-deepseek.ts
 *   tsx scripts/enrich-iceland-poi-with-deepseek.ts --input=data/iceland_poi_cleaned.json.geojson --output=data/iceland_poi_enriched.json.geojson
 *   tsx scripts/enrich-iceland-poi-with-deepseek.ts --batch=10 --delay=1000
 *   tsx scripts/enrich-iceland-poi-with-deepseek.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dns from 'node:dns';
import dotenv from 'dotenv';

dotenv.config();

// 强制 IPv4 优先
dns.setDefaultResultOrder('ipv4first');

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    fid?: number;
    nafnFitju?: string | null;
    gerdGosgig?: string;
    fitjuflokkar?: number;
    [key: string]: any;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  name?: string;
  crs?: any;
  features: GeoJSONFeature[];
}

interface EnrichmentResult {
  nameCN?: string;
  nameEN?: string;
  nameIS?: string; // 冰岛语名称
  description?: string;
  category?: string;
  tags?: string[];
  address?: string;
  metadata?: Record<string, any>;
}

interface EnrichmentStats {
  total: number;
  processed: number;
  enriched: number;
  skipped: number;
  errors: number;
  results: Array<{
    fid?: number;
    status: 'enriched' | 'skipped' | 'error';
    error?: string;
  }>;
}

function parseArgs(): {
  input: string;
  output: string;
  batchSize: number;
  delay: number;
  dryRun: boolean;
  limit?: number;
  skipExisting: boolean;
  noProxy: boolean;
} {
  const args = process.argv.slice(2);
  const options: {
    input: string;
    output: string;
    batchSize: number;
    delay: number;
    dryRun: boolean;
    limit?: number;
    skipExisting: boolean;
    noProxy: boolean;
  } = {
    input: 'data/iceland_poi.json.geojson', // 默认使用原始文件
    output: 'data/iceland_poi_enriched.json.geojson',
    batchSize: 5,
    delay: 2000, // 2秒延迟，避免API限流
    dryRun: false,
    skipExisting: true, // 跳过已有完整数据的记录
    noProxy: false, // 禁用代理
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      options.input = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--batch' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--delay' && args[i + 1]) {
      options.delay = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-skip-existing') {
      options.skipExisting = false;
    } else if (arg === '--no-proxy') {
      options.noProxy = true;
    }
  }

  return options;
}

/**
 * 创建 DeepSeek API 客户端
 */
function createDeepSeekClient(noProxy: boolean = false): AxiosInstance {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 环境变量未配置');
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const proxyUrl = noProxy ? null : (process.env.HTTPS_PROXY || process.env.https_proxy || 
                   process.env.ALL_PROXY || process.env.all_proxy);

  let httpsAgent: https.Agent | HttpsProxyAgent<string>;
  if (proxyUrl && !noProxy) {
    try {
      console.log(`  使用代理: ${proxyUrl}`);
      httpsAgent = new HttpsProxyAgent<string>(proxyUrl);
    } catch (error) {
      console.warn(`  ⚠️  代理配置失败，使用直接连接: ${error instanceof Error ? error.message : String(error)}`);
      httpsAgent = new https.Agent({
        keepAlive: true,
        timeout: 60000,
        family: 4,
      });
    }
  } else {
    if (noProxy) {
      console.log(`  直接连接（已禁用代理）`);
    }
    httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: 60000,
      family: 4,
    });
  }

  return axios.create({
    baseURL,
    timeout: 60000,
    proxy: false,
    httpsAgent,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });
}

/**
 * 检查是否已有完整数据
 */
/**
 * 检查是否已有完整数据
 * 
 * 判断标准：
 * 1. 必须有有效的名称（冰岛语、中文或英文）
 * 2. 名称不能是自动生成的占位符（如"未命名地点"）
 * 3. 如果有描述信息，说明数据已经被填充过
 * 4. 如果有 enrichedMetadata，说明已经通过 DeepSeek 填充过
 */
function hasCompleteData(feature: GeoJSONFeature): boolean {
  const props = feature.properties;
  
  // 检查是否有有效的名称（至少一个）
  const hasValidName = !!(
    (props.nafnFitju && props.nafnFitju.trim() !== '' && !props.nafnFitju.startsWith('未命名地点')) ||
    (props.nameCN && props.nameCN.trim() !== '' && !props.nameCN.startsWith('未命名地点')) ||
    (props.nameEN && props.nameEN.trim() !== '' && !props.nameEN.startsWith('未命名地点'))
  );
  
  if (!hasValidName) {
    return false;
  }
  
  // 如果已经有描述信息，说明数据已经被填充过
  if (props.description && props.description.trim() !== '') {
    return true;
  }
  
  // 如果已经有 enrichedMetadata，说明已经通过 DeepSeek 填充过
  if (props.enrichedMetadata && Object.keys(props.enrichedMetadata).length > 0) {
    return true;
  }
  
  // 如果有中文或英文名称，且不是占位符，也认为是完整的
  if ((props.nameCN && !props.nameCN.startsWith('未命名地点')) ||
      (props.nameEN && !props.nameEN.startsWith('未命名地点'))) {
    return true;
  }
  
  // 只有冰岛语名称，且不是占位符
  return props.nafnFitju && 
         props.nafnFitju.trim() !== '' && 
         !props.nafnFitju.startsWith('未命名地点');
}

/**
 * 构建提示词
 */
function buildPrompt(feature: GeoJSONFeature): string {
  const [lng, lat] = feature.geometry.coordinates;
  const existingName = feature.properties.nafnFitju;
  const type = feature.properties.gerdGosgig || 'unknown';
  const fid = feature.properties.fid;

  return `你是一个冰岛地理和旅游专家。请根据以下坐标信息，提供完整的地点信息。

坐标：经度 ${lng.toFixed(6)}, 纬度 ${lat.toFixed(6)}
${existingName ? `现有名称（冰岛语）：${existingName}` : ''}
${type !== 'unknown' ? `类型：${type}` : ''}
${fid ? `ID：${fid}` : ''}

请以 JSON 格式返回以下信息：
{
  "nameCN": "中文名称（如果已知，否则根据坐标推断）",
  "nameEN": "英文名称（如果已知，否则根据坐标推断）",
  "nameIS": "冰岛语名称（如果已知，否则根据坐标推断）",
  "description": "地点描述（100-200字，包括地理位置、特征、历史背景等）",
  "category": "类别（volcano/lava_field/geothermal/crater/other）",
  "tags": ["标签1", "标签2"],
  "address": "详细地址（如果有）",
  "metadata": {
    "elevation": "海拔（如果有）",
    "accessibility": "可达性说明",
    "bestSeason": "最佳访问季节",
    "safetyNotes": "安全提示（如果有）"
  }
}

要求：
1. 如果现有名称不为空，优先使用现有名称
2. 描述要准确、详细，基于冰岛的地理特征
3. 类别要准确
4. 只返回 JSON，不要其他文本`;
}

/**
 * 调用 DeepSeek API 获取地点信息
 */
async function enrichWithDeepSeek(
  feature: GeoJSONFeature,
  client: AxiosInstance
): Promise<EnrichmentResult> {
  const prompt = buildPrompt(feature);
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  try {
    const response = await client.post('/chat/completions', {
      model,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的冰岛地理和旅游信息专家。始终以有效的 JSON 格式返回结果，不要包含任何其他文本。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek API 返回空内容');
    }

    // 解析 JSON 响应
    let result: EnrichmentResult;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // 尝试提取 JSON（如果响应包含其他文本）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`无法解析 JSON 响应: ${content.substring(0, 100)}`);
      }
    }

    return result;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `DeepSeek API 错误 (${error.response.status}): ${error.response.data?.error?.message || '未知错误'}`
      );
    }
    throw error;
  }
}

/**
 * 填充 feature 的 properties
 */
function enrichFeature(
  feature: GeoJSONFeature,
  enrichment: EnrichmentResult
): GeoJSONFeature {
  const enriched = { ...feature };
  const props = { ...enriched.properties };

  // 填充名称（优先使用现有名称）
  if (enrichment.nameIS && !props.nafnFitju) {
    props.nafnFitju = enrichment.nameIS;
  }
  if (enrichment.nameCN) {
    props.nameCN = enrichment.nameCN;
  }
  if (enrichment.nameEN) {
    props.nameEN = enrichment.nameEN;
  }

  // 填充描述
  if (enrichment.description) {
    props.description = enrichment.description;
  }

  // 填充类别
  if (enrichment.category) {
    props.category = enrichment.category;
  }

  // 填充标签
  if (enrichment.tags && enrichment.tags.length > 0) {
    props.tags = enrichment.tags;
  }

  // 填充地址
  if (enrichment.address) {
    props.address = enrichment.address;
  }

  // 合并 metadata
  if (enrichment.metadata) {
    props.enrichedMetadata = {
      ...props.enrichedMetadata,
      ...enrichment.metadata,
      enrichedAt: new Date().toISOString(),
      enrichedBy: 'deepseek',
    };
  }

  enriched.properties = props;
  return enriched;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 批量处理并填充数据
 */
async function enrichGeoJSON(
  geojson: GeoJSON,
  options: ReturnType<typeof parseArgs>
): Promise<{ enriched: GeoJSON; stats: EnrichmentStats }> {
  const stats: EnrichmentStats = {
    total: geojson.features.length,
    processed: 0,
    enriched: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  const enrichedFeatures: GeoJSONFeature[] = [];
  let client = createDeepSeekClient(options.noProxy);
  let proxyFailed = false;
  let firstProxyError = true; // 标记是否第一次遇到代理错误

  // 限制处理数量
  const featuresToProcess = options.limit
    ? geojson.features.slice(0, options.limit)
    : geojson.features;

  console.log(`\n准备处理 ${featuresToProcess.length} 个 features...`);

  // 按批次处理
  for (let i = 0; i < featuresToProcess.length; i += options.batchSize) {
    const batch = featuresToProcess.slice(i, i + options.batchSize);
    const batchNum = Math.floor(i / options.batchSize) + 1;
    const totalBatches = Math.ceil(featuresToProcess.length / options.batchSize);

    console.log(`\n处理批次 ${batchNum}/${totalBatches} (${batch.length} 条)`);

    for (const feature of batch) {
      try {
        // 检查是否跳过
        if (options.skipExisting && hasCompleteData(feature)) {
          enrichedFeatures.push(feature);
          stats.skipped++;
          stats.processed++;
          stats.results.push({
            fid: feature.properties.fid,
            status: 'skipped',
          });
          if (stats.skipped % 10 === 0) {
            console.log(`  ⏭️  已跳过 ${stats.skipped} 条（已有完整数据）`);
          }
          continue;
        }

        if (options.dryRun) {
          console.log(`  [预览] 将处理 fid=${feature.properties.fid}`);
          enrichedFeatures.push(feature);
          stats.enriched++;
          stats.processed++;
          stats.results.push({
            fid: feature.properties.fid,
            status: 'enriched',
          });
          continue;
        }

        // 调用 DeepSeek API
        let enrichment: EnrichmentResult;
        try {
          enrichment = await enrichWithDeepSeek(feature, client);
        } catch (error: any) {
          // 如果是代理连接错误，尝试切换到直接连接
          const isProxyError = error.code === 'ECONNREFUSED' || 
                              error.message?.includes('ECONNREFUSED') ||
                              error.message?.includes('127.0.0.1:9090');
          
          if (isProxyError && !proxyFailed && !options.noProxy && firstProxyError) {
            console.warn(`\n  ⚠️  检测到代理连接失败，切换到直接连接...`);
            proxyFailed = true;
            firstProxyError = false;
            client = createDeepSeekClient(true); // 创建不使用代理的客户端
            
            // 重试当前请求
            try {
              enrichment = await enrichWithDeepSeek(feature, client);
            } catch (retryError: any) {
              throw retryError; // 如果直接连接也失败，抛出错误
            }
          } else {
            throw error;
          }
        }
        
        // 填充数据
        const enriched = enrichFeature(feature, enrichment);
        enrichedFeatures.push(enriched);

        stats.enriched++;
        stats.processed++;
        stats.results.push({
          fid: feature.properties.fid,
          status: 'enriched',
        });

        console.log(`  ✅ 已填充: ${enriched.properties.nameCN || enriched.properties.nafnFitju || 'N/A'}`);
      } catch (error: any) {
        console.error(`  ❌ 处理失败 (fid: ${feature.properties.fid}):`, error.message);
        enrichedFeatures.push(feature); // 保留原始数据
        stats.errors++;
        stats.processed++;
        stats.results.push({
          fid: feature.properties.fid,
          status: 'error',
          error: error.message,
        });
      }
    }

    // 批次间延迟
    if (i + options.batchSize < featuresToProcess.length && !options.dryRun) {
      console.log(`  等待 ${options.delay}ms 后继续...`);
      await sleep(options.delay);
    }
  }

  const enriched: GeoJSON = {
    ...geojson,
    features: enrichedFeatures,
  };

  return { enriched, stats };
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('冰岛 POI 数据 DeepSeek 填充脚本');
  console.log('='.repeat(60));
  console.log(`输入文件: ${options.input}`);
  console.log(`输出文件: ${options.output}`);
  console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会调用 API）' : '✅ 填充模式'}`);
  console.log(`批次大小: ${options.batchSize}`);
  console.log(`批次延迟: ${options.delay}ms`);
  console.log(`跳过已有数据: ${options.skipExisting ? '是' : '否'}`);
  console.log(`禁用代理: ${options.noProxy ? '是' : '否'}`);
  if (options.limit) {
    console.log(`处理限制: ${options.limit} 条`);
  }
  console.log('');

  // 检查 API Key
  if (!options.dryRun && !process.env.DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY 环境变量未配置');
    process.exit(1);
  }

  try {
    // 1. 读取 GeoJSON 文件
    const inputPath = path.resolve(process.cwd(), options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ 文件不存在: ${inputPath}`);
      process.exit(1);
    }

    console.log('📖 读取 GeoJSON 文件...');
    const fileContent = fs.readFileSync(inputPath, 'utf-8');
    const geojson: GeoJSON = JSON.parse(fileContent);

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      console.error('❌ 无效的 GeoJSON 格式：必须是 FeatureCollection');
      process.exit(1);
    }

    console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);

    // 2. 填充数据
    const { enriched, stats } = await enrichGeoJSON(geojson, options);

    // 3. 显示统计信息
    console.log('\n' + '='.repeat(60));
    console.log('填充结果统计');
    console.log('='.repeat(60));
    console.log(`总计: ${stats.total}`);
    console.log(`✅ 已填充: ${stats.enriched}`);
    console.log(`⏭️  跳过: ${stats.skipped}`);
    console.log(`❌ 错误: ${stats.errors}`);

    if (stats.errors > 0) {
      console.log('\n错误详情（前10条）:');
      stats.results
        .filter(r => r.status === 'error')
        .slice(0, 10)
        .forEach(r => {
          console.log(`  - fid ${r.fid}: ${r.error}`);
        });
    }

    // 4. 保存填充后的数据
    if (!options.dryRun) {
      const outputPath = path.resolve(process.cwd(), options.output);
      const outputDir = path.dirname(outputPath);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`\n💾 保存填充后的数据到: ${outputPath}`);
      fs.writeFileSync(
        outputPath,
        JSON.stringify(enriched, null, 2),
        'utf-8'
      );
      console.log('✅ 保存成功！');
    } else {
      console.log('\n🔍 预览模式：未保存文件');
    }

    console.log('\n✅ 处理完成！');
  } catch (error: any) {
    console.error('\n❌ 处理失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
