#!/usr/bin/env tsx
/**
 * Physical Reality 数据索引脚本（修复版）
 * 使用字符串拼接方式插入数据，参考 index-all-markdown-files.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 使用 Python AI Service 生成 embedding（BGE-M3, 1024维）
class SimpleEmbeddingService {
  private httpClient: any;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      proxy: false,
      httpsAgent: new https.Agent({
        keepAlive: true,
        family: 4,
      }),
    });
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const response = await this.httpClient.post(
          '/api/v1/embeddings',
          {
            texts: batch,
            model: 'bge-m3',
            return_sparse: false,
          }
        );

        if (response.data && response.data.embeddings) {
          const embeddings = response.data.embeddings.map((e: any) => e.dense || e);
          results.push(...embeddings);
        } else {
          throw new Error('批量embedding返回格式错误');
        }
      } catch (error: any) {
        console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
        batch.forEach(() => {
          const zeroVector = new Array(1024).fill(0);
          results.push(zeroVector);
        });
      }
      
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }
}

const embeddingService = new SimpleEmbeddingService();

// 检测数据类型和区域
function detectDataType(filepath: string): { type: string; region: string } {
  const filename = path.basename(filepath);
  const dirname = path.dirname(filepath);
  
  // 检测数据类型
  let type = 'unknown';
  if (filepath.includes('road-status')) type = 'road_status';
  else if (filepath.includes('ferry-schedules')) type = 'ferry_schedules';
  else if (filepath.includes('weather-windows')) type = 'weather_windows';
  
  // 检测区域（从文件名或路径）
  let region = 'unknown';
  // 扩展区域列表，包括所有已知区域
  const knownRegions = [
    'iceland', 'greenland', 'svalbard', 'faroe', 'faroe-islands',
    'alps', 'argentina', 'lofoten', 'lofoten-islands',
    'new-zealand', 'new-zealand-south-island'
  ];
  
  // 先从文件名匹配（优先匹配更长的名称）
  const sortedRegions = knownRegions.sort((a, b) => b.length - a.length);
  for (const reg of sortedRegions) {
    if (filename.toLowerCase().includes(reg.toLowerCase())) {
      region = reg.toLowerCase();
      // 标准化区域名称
      if (region === 'faroe-islands') region = 'faroe';
      else if (region === 'lofoten-islands') region = 'lofoten';
      else if (region === 'new-zealand-south-island') region = 'new-zealand-south-island';
      break;
    }
  }
  
  // 如果文件名没匹配到，从路径推断
  if (region === 'unknown') {
    const pathParts = dirname.split(path.sep);
    for (const reg of sortedRegions) {
      const foundPart = pathParts.find(p => p.toLowerCase().includes(reg.toLowerCase()));
      if (foundPart) {
        region = reg.toLowerCase();
        // 标准化区域名称
        if (region === 'faroe-islands') region = 'faroe';
        else if (region === 'lofoten-islands') region = 'lofoten';
        else if (region === 'new-zealand-south-island') region = 'new-zealand-south-island';
        break;
      }
    }
  }
  
  // 如果还是没匹配到，使用默认值（但应该不会发生）
  if (region === 'unknown') {
    region = 'iceland'; // 默认值
  }
  
  return { type, region };
}

// 提取关键词（增强版）
function extractKeywords(data: any, type: string): string[] {
  const keywords: string[] = [];
  if (type === 'road_status') {
    if (data.roadId) keywords.push(data.roadId);
    if (data.roadName) keywords.push(data.roadName);
    if (data.roadNameEN) keywords.push(data.roadNameEN);
    keywords.push('道路状态', 'road status', 'F-road');
    // 提取车辆要求信息
    if (data.requirements) {
      if (data.requirements.vehicleType) {
        keywords.push(data.requirements.vehicleType);
        if (data.requirements.vehicleType === '4x4_required') {
          keywords.push('4x4', '四驱', '四轮驱动', '需要4x4', '必须4x4', '4x4车辆', '4x4 required');
        }
      }
      if (data.requirements.clearance) keywords.push(data.requirements.clearance);
      if (data.requirements.experience) keywords.push(data.requirements.experience);
      if (data.requirements.notes) {
        // 从notes中提取关键词
        const notes = data.requirements.notes.toLowerCase();
        if (notes.includes('4x4')) keywords.push('4x4', '四驱');
        if (notes.includes('车辆')) keywords.push('车辆', 'vehicle');
      }
    }
    // 提取状态信息
    if (data.status) keywords.push(data.status, data.status === 'seasonal' ? '季节性' : '');
    if (data.season?.openPeriod) keywords.push(data.season.openPeriod);
  } else if (type === 'ferry_schedules') {
    if (data.routeId) keywords.push(data.routeId);
    if (data.routeName) keywords.push(data.routeName);
    if (data.routeNameEN) keywords.push(data.routeNameEN);
    keywords.push('渡轮', 'ferry', '时刻表', 'schedule');
    // 提取预订信息
    if (data.booking) {
      if (data.booking.required) keywords.push('需要预订', 'booking required');
      if (data.booking.recommended) keywords.push('建议预订', 'booking recommended');
    }
  } else if (type === 'weather_windows') {
    if (data.regionId) keywords.push(data.regionId);
    if (data.regionName) keywords.push(data.regionName);
    if (data.regionNameEN) keywords.push(data.regionNameEN);
    keywords.push('天气', 'weather', '最佳旅行时间', 'best travel time', '天气窗口', 'weather window');
    // 提取最佳窗口信息
    if (data.bestWindows) {
      data.bestWindows.forEach((w: any) => {
        if (w.period) keywords.push(w.period);
        if (w.description) keywords.push(w.description);
      });
    }
  }
  return [...new Set(keywords)];
}

// 创建chunk内容（增强版）
function createChunkContent(data: any, type: string): string {
  let content = '';
  if (type === 'road_status') {
    // 道路ID和名称（突出显示）
    content = `道路ID: ${data.roadId}\n`;
    content += `道路名称: ${data.roadName || data.roadNameEN || data.roadId}\n`;
    if (data.roadNameEN && data.roadName !== data.roadNameEN) {
      content += `道路名称（英文）: ${data.roadNameEN}\n`;
    }
    // 状态信息
    if (data.status) content += `状态: ${data.status}\n`;
    if (data.currentStatus) content += `当前状态: ${data.currentStatus}\n`;
    // 开放季节（重要信息）
    if (data.season) {
      content += `开放季节: ${data.season.openPeriod || data.season.openMonths?.join(',')}\n`;
      if (data.season.typicalOpenDate) content += `通常开放时间: ${data.season.typicalOpenDate}\n`;
      if (data.season.typicalCloseDate) content += `通常关闭时间: ${data.season.typicalCloseDate}\n`;
    }
    // 车辆要求（重要信息，突出显示）
    if (data.requirements) {
      content += `车辆要求:\n`;
      if (data.requirements.vehicleType) {
        content += `  车辆类型: ${data.requirements.vehicleType}\n`;
        if (data.requirements.vehicleType === '4x4_required') {
          content += `  需要4x4车辆: 是\n`;
          content += `  必须4x4: 是\n`;
        }
      }
      if (data.requirements.clearance) content += `  离地间隙: ${data.requirements.clearance}\n`;
      if (data.requirements.experience) content += `  驾驶经验: ${data.requirements.experience}\n`;
      if (data.requirements.notes) content += `  备注: ${data.requirements.notes}\n`;
    }
    // 危险信息
    if (data.hazards && data.hazards.length > 0) {
      content += `危险:\n`;
      data.hazards.forEach((h: any) => {
        content += `  ${h.type}: ${h.description || h.severity}\n`;
      });
    }
  } else if (type === 'ferry_schedules') {
    // 路线ID和名称（突出显示）
    content = `路线ID: ${data.routeId}\n`;
    content += `路线名称: ${data.routeName || data.routeNameEN || data.routeId}\n`;
    if (data.routeNameEN && data.routeName !== data.routeNameEN) {
      content += `路线名称（英文）: ${data.routeNameEN}\n`;
    }
    // 出发和到达
    if (data.from) {
      content += `出发港口: ${data.from.name}\n`;
      if (data.from.nameEN) content += `出发港口（英文）: ${data.from.nameEN}\n`;
    }
    if (data.to) {
      content += `到达港口: ${data.to.name}\n`;
      if (data.to.nameEN) content += `到达港口（英文）: ${data.to.nameEN}\n`;
    }
    // 时刻表信息
    if (data.schedule) {
      if (data.schedule.summer) {
        content += `夏季时刻表: ${data.schedule.summer.period}\n`;
        if (data.schedule.summer.frequency) content += `班次频率: ${data.schedule.summer.frequency}\n`;
      }
      if (data.schedule.winter) {
        content += `冬季时刻表: ${data.schedule.winter.period}\n`;
        if (data.schedule.winter.frequency) content += `班次频率: ${data.schedule.winter.frequency}\n`;
      }
    }
    // 预订信息（重要信息）
    if (data.booking) {
      content += `预订要求:\n`;
      if (data.booking.required) content += `  需要预订: 是\n`;
      if (data.booking.recommended) content += `  建议预订: 是\n`;
      if (data.booking.advanceBooking) content += `  提前预订: ${data.booking.advanceBooking}\n`;
    }
  } else if (type === 'weather_windows') {
    // 区域ID和名称（突出显示）
    content = `区域ID: ${data.regionId}\n`;
    content += `区域名称: ${data.regionName || data.regionNameEN || data.regionId}\n`;
    if (data.regionNameEN && data.regionName !== data.regionNameEN) {
      content += `区域名称（英文）: ${data.regionNameEN}\n`;
    }
    // 最佳旅行窗口（重要信息）
    if (data.bestWindows) {
      content += `最佳旅行窗口:\n`;
      data.bestWindows.forEach((w: any) => {
        content += `  ${w.period || w.months?.join(',')}: ${w.description}\n`;
        if (w.temperature) content += `    温度: ${w.temperature.avg}°C\n`;
        if (w.precipitation) content += `    降雨: ${w.precipitation.avg}mm/月\n`;
      });
    }
    // 天气模式
    if (data.weatherPatterns) {
      content += `天气模式:\n`;
      Object.keys(data.weatherPatterns).forEach(season => {
        const pattern = data.weatherPatterns[season];
        content += `  ${season}: ${pattern.description}\n`;
      });
    }
    // 风险等级
    if (data.riskLevels && data.riskLevels.length > 0) {
      content += `风险等级:\n`;
      data.riskLevels.forEach((r: any) => {
        content += `  ${r.month}月: ${r.riskLevel}\n`;
        if (r.risks) content += `    风险: ${r.risks.join(', ')}\n`;
      });
    }
    // 极端天气事件
    if (data.extremeEvents && data.extremeEvents.length > 0) {
      content += `极端天气事件:\n`;
      data.extremeEvents.forEach((e: any) => {
        content += `  ${e.type}: ${e.description}\n`;
        if (e.typicalMonths) content += `    常见月份: ${e.typicalMonths.join(', ')}\n`;
      });
    }
  }
  return content.trim();
}

// 细粒度chunking
function chunkPhysicalRealityData(data: any, type: string): Array<{ content: string; keywords: string[]; metadata: any }> {
  const chunks: Array<{ content: string; keywords: string[]; metadata: any }> = [];
  const metadata = data.metadata || {};
  
  if (type === 'road_status' && data.roads) {
    data.roads.forEach((road: any) => {
      chunks.push({
        content: createChunkContent(road, type),
        keywords: extractKeywords(road, type),
        metadata: { ...metadata, roadId: road.roadId }
      });
    });
  } else if (type === 'ferry_schedules' && data.routes) {
    data.routes.forEach((route: any) => {
      chunks.push({
        content: createChunkContent(route, type),
        keywords: extractKeywords(route, type),
        metadata: { ...metadata, routeId: route.routeId }
      });
    });
  } else if (type === 'weather_windows' && data.regions) {
    data.regions.forEach((region: any) => {
      chunks.push({
        content: createChunkContent(region, type),
        keywords: extractKeywords(region, type),
        metadata: { ...metadata, regionId: region.regionId }
      });
    });
  }
  
  return chunks;
}

// 加载文件
function loadPhysicalRealityFiles(dirPath: string): Array<{ path: string; filename: string }> {
  const files: Array<{ path: string; filename: string }> = [];
  
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  
  function scanDir(currentPath: string) {
    const items = fs.readdirSync(currentPath);
    items.forEach(item => {
      const itemPath = path.join(currentPath, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory() && !item.includes('template')) {
        scanDir(itemPath);
      } else if (item.endsWith('.json') && !item.includes('template')) {
        files.push({ path: itemPath, filename: item });
      }
    });
  }
  
  scanDir(dirPath);
  return files;
}

// 主函数
async function indexPhysicalRealityData() {
  try {
    console.log('🚀 开始索引 Physical Reality 数据...\n');
    
    const dataDir = path.join(process.cwd(), 'data', 'physical-reality');
    const files = loadPhysicalRealityFiles(dataDir);
    
    if (files.length === 0) {
      console.log('⚠️  未找到任何数据文件');
      return;
    }
    
    console.log(`📁 找到 ${files.length} 个数据文件\n`);
    
    let totalChunks = 0;
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      try {
        console.log(`\n📄 处理文件: ${file.filename}`);
        
        const fileContent = fs.readFileSync(file.path, 'utf-8');
        const data = JSON.parse(fileContent);
        const { type, region } = detectDataType(file.path);
        console.log(`   类型: ${type}, 区域: ${region}`);
        
        const chunks = chunkPhysicalRealityData(data, type);
        console.log(`   生成 ${chunks.length} 个chunks`);
        
        if (chunks.length === 0) {
          failCount++;
          continue;
        }
        
        const metadata = data.metadata || {};
        const filename = `${region}-${type}-${path.basename(file.filename, '.json')}`;
        
        const existingFile = await prisma.knowledgeFile.findUnique({
          where: { filename },
        });
        
        if (existingFile) {
          console.log(`   🔄 文件已存在，删除旧chunks...`);
          await prisma.chunk.deleteMany({
            where: { fileId: existingFile.id },
          });
        }
        
        const knowledgeFile = await prisma.knowledgeFile.upsert({
          where: { filename },
          create: {
            filename,
            filepath: file.path,
            category: type,
            version: metadata.version || '1.0.0',
            language: metadata.language || 'zh-CN',
            credibilityScore: 0.95,
            dataSources: metadata.dataSource ? [metadata.dataSource] : [],
            lastUpdated: metadata.lastUpdated ? new Date(metadata.lastUpdated) : new Date(),
          },
          update: {
            filepath: file.path,
            version: metadata.version || '1.0.0',
            lastUpdated: metadata.lastUpdated ? new Date(metadata.lastUpdated) : new Date(),
          },
        });
        
        console.log(`   ✅ 文件记录: ${knowledgeFile.id}`);
        
        const contents = chunks.map(c => c.content);
        console.log(`   🔄 生成embeddings...`);
        const embeddings = await embeddingService.generateEmbeddingsBatch(contents);
        
        console.log(`   💾 插入chunks...`);
        const fileId = knowledgeFile.id;
        
        const values = chunks.map((chunk, idx) => {
          const embedding = embeddings[idx];
          const embeddingStr = `[${embedding.join(',')}]`;
          const contentEscaped = chunk.content.replace(/'/g, "''").substring(0, 50000);
          const keywordsStr = chunk.keywords.map(k => `'${k.replace(/'/g, "''")}'`).join(',');
          const metadataStr = JSON.stringify(chunk.metadata || {}).replace(/'/g, "''");
          const chunkId = `${filename}_${idx + 1}`;
          
          return `(
            gen_random_uuid(),
            '${chunkId.replace(/'/g, "''")}',
            '${contentEscaped}',
            '${embeddingStr}'::vector(1024),
            '${type}',
            NULL,
            ${0.95},
            ARRAY[${keywordsStr}],
            '${fileId}'::uuid,
            '${metadataStr}'::jsonb,
            NOW(),
            NOW()
          )`;
        }).join(',');
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO chunks (
            id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
          ) VALUES ${values}
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = EXCLUDED.content,
            keywords = EXCLUDED.keywords,
            credibility_score = EXCLUDED.credibility_score,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding,
            type = EXCLUDED.type
        `);
        
        totalChunks += chunks.length;
        successCount++;
        console.log(`   ✅ 完成: ${chunks.length} 个chunks已索引`);
        
      } catch (error: any) {
        console.error(`   ❌ 处理失败: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n\n📊 索引完成统计:`);
    console.log(`   总文件数: ${files.length}`);
    console.log(`   成功: ${successCount}`);
    console.log(`   失败: ${failCount}`);
    console.log(`   总chunks: ${totalChunks}`);
    
  } catch (error: any) {
    console.error('❌ 索引过程出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

indexPhysicalRealityData().catch(console.error);
