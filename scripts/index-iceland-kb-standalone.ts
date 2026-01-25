// scripts/index-iceland-kb-standalone.ts
// 独立的知识库索引脚本，不依赖 NestJS 应用上下文

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// 加载环境变量（如果 dotenv 不可用，直接使用 process.env）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不可用，使用 process.env（从系统环境变量读取）
}

// 初始化 OpenAI HTTP 客户端（使用代理）
function createOpenAIHttp(baseUrl: string) {
  const axios = require('axios');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
  
  const httpsAgent = new HttpsProxyAgent(proxyUrl);
  
  return axios.create({
    baseURL: baseUrl,
    httpsAgent,
    proxy: false, // 禁用 axios 内置代理，使用 httpsAgent
    timeout: 300000, // 增加到 300 秒 (5 分钟)
  });
}

// 简化的 Embedding 服务
class SimpleEmbeddingService {
  private openaiHttp: any;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 未配置');
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.openaiHttp = createOpenAIHttp(baseUrl);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openaiHttp.post(
        '/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      }

      throw new Error('OpenAI API 返回格式错误');
    } catch (error: any) {
      console.error('Embedding 生成失败:', error.message);
      throw error;
    }
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
        for (let j = 0; j < batch.length; j++) {
          const text = batch[j];
          const textIndex = i + j;
          
          try {
            const embedding = await this.generateEmbedding(text);
            results.push(embedding);
            
            // 显示进度
            if (results.length % 5 === 0) {
              console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
            }
          } catch (error: any) {
            console.error(`  ⚠️  文本 ${textIndex} 向量化失败:`, error.message);
            // 生成零向量作为降级
            const zeroVector = new Array(1536).fill(0);
            results.push(zeroVector);
          }
          
          // 避免 API 限流（批次间延迟）
          if (j < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // 批次间延迟
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results;
  }
}

// 简化的知识库加载器
function loadAllFiles(kbPath: string): Array<{
  filename: string;
  filepath: string;
  content: any;
  metadata: any;
}> {
  const files: Array<{
    filename: string;
    filepath: string;
    content: any;
    metadata: any;
  }> = [];

  const walkDir = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const content = JSON.parse(fileContent);

            files.push({
              filename: entry.name,
              filepath: fullPath,
              content,
              metadata: content.metadata || {
                version: '1.0.0',
                credibility_score: 0.8,
                language: 'zh-CN',
                data_sources: [],
                last_updated: new Date().toISOString(),
              },
            });

            console.log(`✅ 已加载: ${entry.name}`);
          } catch (error: any) {
            console.error(`❌ 加载失败 ${entry.name}:`, error.message);
            console.error(`   文件路径: ${fullPath}`);
            // 继续处理其他文件，不中断
          }
        }
    }
  };

  walkDir(kbPath);
  return files;
}

// 检测文件分类
function detectCategory(filename: string): string {
  if (filename.includes('rhythm') || filename.includes('persona') || filename.includes('feasibility')) {
    return 'decision_support';
  }
  if (filename.includes('rental') || filename.includes('packing')) {
    return 'practical_guides';
  }
  // compliance_rules: 法律法规、合规规则
  if (filename.includes('rules') || filename.includes('laws') || filename.includes('compliance')) {
    return 'compliance_rules';
  }
  if (filename.includes('risk') || filename.includes('hazard') || filename.includes('safety')) {
    return 'safety';
  }
  if (filename.includes('weather') || filename.includes('seasonal') || filename.includes('climate') || filename.includes('terrain')) {
    return 'geography_seasonal';
  }
  if (filename.includes('route') || filename.includes('ring-road') || filename.includes('circle') || 
      filename.includes('highlands') || filename.includes('westfjords') || filename.includes('snaefellsnes')) {
    return 'routes';
  }
  if (filename.includes('poi') || filename.includes('accommodation') || filename.includes('attraction') || filename.includes('service') || filename.includes('supplies')) {
    return 'pois';
  }
  if (filename.includes('accessibility')) {
    return 'accessibility';
  }
  return 'general';
}

// 改进的关键词提取函数（与 ChunkingService 保持一致）
function extractKeywords(item: any): string[] {
  const keywords: string[] = [];

  // 1. 名称字段（中英文）
  const nameFields = ['name', 'name_cn', 'name_en', 'nameCN', 'nameEN', 'title', 'title_cn', 'title_en'];
  nameFields.forEach(field => {
    if (item[field] && typeof item[field] === 'string') {
      keywords.push(item[field]);
      // 如果是中文名称，提取关键词
      if (/[\u4e00-\u9fa5]/.test(item[field])) {
        const words = item[field].match(/[\u4e00-\u9fa5]{2,6}/g) || [];
        keywords.push(...words);
      }
    }
  });

  // 2. 特定业务字段
  if (item.rhythm_name) keywords.push(item.rhythm_name);
  if (item.route_name) keywords.push(item.route_name);
  if (item.law) keywords.push(item.law);
  if (item.law_id) keywords.push(item.law_id);
  if (item.attraction_name) keywords.push(item.attraction_name);
  if (item.poi_name) keywords.push(item.poi_name);

  // 3. 描述和概述字段
  const descriptionFields = ['description', 'overview', 'summary', 'intro', 'introduction', 'content', 'details'];
  descriptionFields.forEach(field => {
    if (item[field] && typeof item[field] === 'string') {
      const text = item[field];
      // 提取中文词
      const chineseWords = text.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
      keywords.push(...chineseWords.slice(0, 10));
      // 提取英文单词
      const englishWords = text.match(/[a-zA-Z]{2,20}/g) || [];
      keywords.push(...englishWords.map(w => w.toLowerCase()).slice(0, 10));
    }
  });

  // 4. 标签和分类字段
  if (Array.isArray(item.tags)) {
    keywords.push(...item.tags.filter((t: any) => typeof t === 'string'));
  }
  if (Array.isArray(item.categories)) {
    keywords.push(...item.categories.filter((c: any) => typeof c === 'string'));
  }
  if (Array.isArray(item.highlights)) {
    item.highlights.forEach((h: any) => {
      if (typeof h === 'string') {
        keywords.push(h);
      } else if (h && typeof h === 'object' && h.keyword) {
        keywords.push(h.keyword);
      }
    });
  }

  // 5. 地址和位置信息
  if (item.address) keywords.push(item.address);
  if (item.location) {
    if (typeof item.location === 'string') {
      keywords.push(item.location);
    } else if (item.location.city) {
      keywords.push(item.location.city);
    }
    if (item.location.region) keywords.push(item.location.region);
    if (item.location.country) keywords.push(item.location.country);
  }

  // 6. 开放时间相关
  if (item.openingHours || item.opening_hours) {
    keywords.push('开放时间', '营业时间', 'opening hours');
  }
  if (item.ticketPrice || item.ticket_price) {
    keywords.push('门票', '价格', 'ticket');
  }

  // 7. 类型和分类
  if (item.type) keywords.push(item.type);
  if (item.category) keywords.push(item.category);
  if (item.subcategory) keywords.push(item.subcategory);

  // 去重、过滤和限制
  const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  return [...new Set(keywords)]
    .filter(k => k && k.length >= 2 && k.length <= 50)
    .filter(k => !stopWords.has(k.toLowerCase()))
    .slice(0, 50);
}

// 改进的文本内容提取函数（与 ChunkingService 保持一致）
function extractTextContent(item: any, type?: string): string {
  if (!item || typeof item !== 'object') {
    return typeof item === 'string' ? item : JSON.stringify(item);
  }

  const parts: string[] = [];

  // 根据类型选择不同的提取策略
  if (type === 'rhythm_pattern' || item.rhythm_id) {
    if (item.rhythm_name) parts.push(`节奏名称: ${item.rhythm_name}`);
    if (item.description) parts.push(`描述: ${item.description}`);
    if (item.features && Array.isArray(item.features)) {
      parts.push(`特点: ${item.features.join('、')}`);
    }
  } else if (type === 'legal_rule' || item.law_id) {
    if (item.law) parts.push(`法律: ${item.law}`);
    if (item.name_en) parts.push(`英文名称: ${item.name_en}`);
    if (item.description) parts.push(`描述: ${item.description}`);
    if (item.prohibited && Array.isArray(item.prohibited)) {
      parts.push(`禁止事项: ${item.prohibited.join('、')}`);
    }
    if (item.penalty) parts.push(`处罚: ${item.penalty}`);
  } else if (item.name || item.name_cn || item.name_en) {
    const name = item.name_cn || item.name || item.name_en || item.attraction_name || item.poi_name;
    if (name) parts.push(`名称: ${name}`);
    if (item.description) parts.push(`描述: ${item.description}`);
    if (item.overview) parts.push(`概述: ${item.overview}`);
    if (item.address) parts.push(`地址: ${item.address}`);
    if (item.openingHours || item.opening_hours) {
      const hours = item.openingHours || item.opening_hours;
      if (typeof hours === 'string') {
        parts.push(`开放时间: ${hours}`);
      } else if (hours && typeof hours === 'object') {
        if (hours.weekday) parts.push(`工作日: ${hours.weekday.open}-${hours.weekday.close}`);
        if (hours.weekend) parts.push(`周末: ${hours.weekend.open}-${hours.weekend.close}`);
        if (hours.note) parts.push(`备注: ${hours.note}`);
      }
    }
    if (item.ticketPrice || item.ticket_price) {
      const price = item.ticketPrice || item.ticket_price;
      if (typeof price === 'string') {
        parts.push(`门票: ${price}`);
      } else if (price && typeof price === 'object') {
        if (price.free) {
          parts.push('门票: 免费');
        } else {
          const prices = [];
          if (price.adult) prices.push(`成人: ${price.adult}${price.currency || ''}`);
          if (price.child) prices.push(`儿童: ${price.child}${price.currency || ''}`);
          if (prices.length > 0) parts.push(`门票: ${prices.join('、')}`);
        }
      }
    }
    if (item.highlights && Array.isArray(item.highlights)) {
      const highlights = item.highlights
        .map((h: any) => typeof h === 'string' ? h : h.keyword)
        .filter(Boolean)
        .join('、');
      if (highlights) parts.push(`亮点: ${highlights}`);
    }
    if (item.tags && Array.isArray(item.tags)) {
      parts.push(`标签: ${item.tags.join('、')}`);
    }
  } else {
    // 通用提取
    const importantFields = ['title', 'name', 'description', 'overview', 'summary', 'content', 'details', 'intro', 'introduction'];
    importantFields.forEach(field => {
      if (item[field] && typeof item[field] === 'string' && item[field].length > 0) {
        parts.push(`${field}: ${item[field]}`);
      }
    });
  }

  // 如果提取到了有意义的内容，返回组合文本；否则返回格式化的 JSON
  if (parts.length > 0) {
    return parts.join('\n');
  } else {
    const jsonStr = JSON.stringify(item, null, 2);
    return jsonStr.length > 5000 ? jsonStr.substring(0, 5000) + '...' : jsonStr;
  }
}

// 检测类型
function detectType(item: any): string {
  if (item.rhythm_id) return 'rhythm_pattern';
  if (item.route_id) return 'route';
  if (item.law_id) return 'legal_rule';
  if (item.hazard_id) return 'hazard';
  if (item.attraction_name || item.poi_name || item.name_cn || (item.name && item.type)) {
    return 'poi';
  }
  if (item.hotel_name || item.accommodation_name) {
    return 'accommodation';
  }
  if (item.restaurant_name || (item.type && ['restaurant', 'cafe', 'bar'].includes(item.type.toLowerCase()))) {
    return 'restaurant';
  }
  return 'general';
}

// 递归提取嵌套对象的可读文本
function extractNestedText(obj: any, depth: number = 0, maxDepth: number = 3): string {
  if (depth > maxDepth) return '';
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? obj : '';
  }
  
  const parts: string[] = [];
  
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (typeof item === 'object') {
        const text = extractNestedText(item, depth + 1, maxDepth);
        if (text) parts.push(text);
      }
    });
  } else {
    // 优先提取有意义的字段
    const priorityFields = ['name', 'name_cn', 'name_en', 'title', 'description', 'overview', 
      'summary', 'importance', 'content', 'details', 'intro', 'key_principles', 'common_complaints',
      'pros', 'cons', 'suitable_for', 'warnings', 'tips', 'notes'];
    
    priorityFields.forEach(field => {
      if (obj[field]) {
        const value = obj[field];
        if (typeof value === 'string') {
          parts.push(`${field}: ${value}`);
        } else if (Array.isArray(value)) {
          const items = value.filter(v => typeof v === 'string').join('、');
          if (items) parts.push(`${field}: ${items}`);
        }
      }
    });
    
    // 递归处理子对象
    Object.entries(obj).forEach(([key, value]) => {
      if (priorityFields.includes(key) || key === 'metadata') return;
      if (typeof value === 'object' && value !== null) {
        const text = extractNestedText(value, depth + 1, maxDepth);
        if (text && text.length > 20) {
          parts.push(`[${key}]: ${text}`);
        }
      }
    });
  }
  
  return parts.join('\n');
}

// 简化的分块服务（使用改进的逻辑）
function autoChunk(fileData: any): Array<{
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  section?: string;
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    credibilityScore: number;
    keywords: string[];
    section?: string;
    metadata?: any;
  }> = [];
  
  const credibility = fileData.metadata?.credibility_score || 0.8;

  // 策略1: rhythm-patterns.json
  if (fileData.filename.includes('rhythm')) {
    const patterns = fileData.content.rhythm_patterns || fileData.content.patterns || [];
    patterns.forEach((item: any, index: number) => {
      const itemId = item.rhythm_id || item.id || `item_${index}`;
      const type = detectType(item);
      chunks.push({
        chunkId: `${fileData.filename}_${itemId}_${index}`,
        content: extractTextContent(item, type),
        type,
        credibilityScore: credibility,
        keywords: extractKeywords(item),
        metadata: { file: fileData.filename, index },
      });
    });
    return chunks;
  }

  // 策略2: attractions.json / pois - 按景点分块
  if (fileData.filename.includes('attractions') || fileData.filename.includes('pois')) {
    const attractions = fileData.content.attractions || fileData.content.pois || [];
    attractions.forEach((item: any, index: number) => {
      const name = item.name_cn || item.name || item.attraction_name || `景点${index}`;
      const parts: string[] = [];
      parts.push(`景点名称: ${name}`);
      if (item.name_en) parts.push(`英文名: ${item.name_en}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.overview) parts.push(`概述: ${item.overview}`);
      if (item.address) parts.push(`地址: ${item.address}`);
      if (item.region) parts.push(`区域: ${item.region}`);
      if (item.type) parts.push(`类型: ${item.type}`);
      if (item.tags && Array.isArray(item.tags)) parts.push(`标签: ${item.tags.join('、')}`);
      if (item.highlights && Array.isArray(item.highlights)) {
        const hl = item.highlights.map((h: any) => typeof h === 'string' ? h : h.keyword).filter(Boolean);
        if (hl.length) parts.push(`亮点: ${hl.join('、')}`);
      }
      if (item.best_time) parts.push(`最佳时间: ${item.best_time}`);
      if (item.duration) parts.push(`建议游览时长: ${item.duration}`);
      if (item.openingHours || item.opening_hours) {
        const hours = item.openingHours || item.opening_hours;
        parts.push(`开放时间: ${typeof hours === 'string' ? hours : JSON.stringify(hours)}`);
      }
      if (item.ticketPrice || item.ticket_price) {
        const price = item.ticketPrice || item.ticket_price;
        parts.push(`门票: ${typeof price === 'string' ? price : JSON.stringify(price)}`);
      }
      
      chunks.push({
        chunkId: `${fileData.filename}_${item.id || index}`,
        content: parts.join('\n'),
        type: 'poi',
        credibilityScore: credibility,
        keywords: extractKeywords(item),
        section: item.region,
        metadata: { file: fileData.filename, poiId: item.id },
      });
    });
    return chunks.length > 0 ? chunks : createDefaultChunks(fileData, credibility);
  }

  // 策略3: routes/*.json - 路线信息
  if (fileData.filename.includes('ring-road') || fileData.filename.includes('golden') || 
      fileData.filename.includes('highlands') || fileData.filename.includes('westfjords') ||
      fileData.filename.includes('snaefellsnes')) {
    const content = fileData.content;
    const parts: string[] = [];
    
    // 提取路线基本信息
    if (content.route_name || content.name) parts.push(`路线名称: ${content.route_name || content.name}`);
    if (content.description) parts.push(`描述: ${content.description}`);
    if (content.overview) parts.push(`概述: ${content.overview}`);
    if (content.total_distance) parts.push(`总距离: ${content.total_distance}`);
    if (content.recommended_days) parts.push(`建议天数: ${content.recommended_days}`);
    if (content.difficulty) parts.push(`难度: ${content.difficulty}`);
    if (content.best_season) parts.push(`最佳季节: ${content.best_season}`);
    if (content.highlights && Array.isArray(content.highlights)) {
      parts.push(`亮点: ${content.highlights.join('、')}`);
    }
    if (content.warnings && Array.isArray(content.warnings)) {
      parts.push(`注意事项: ${content.warnings.join('、')}`);
    }
    
    // 提取嵌套的有用信息
    const nestedText = extractNestedText(content, 0, 2);
    if (nestedText && nestedText.length > 50) {
      parts.push(nestedText);
    }
    
    const keywords = extractKeywords(content);
    keywords.push(fileData.filename.replace('.json', ''), '路线', '冰岛');
    if (fileData.filename.includes('ring-road')) keywords.push('环岛', '一号公路', 'Ring Road');
    if (fileData.filename.includes('golden')) keywords.push('黄金圈', 'Golden Circle');
    
    chunks.push({
      chunkId: `${fileData.filename}_route`,
      content: parts.length > 0 ? parts.join('\n') : extractNestedText(content),
      type: 'route',
      credibilityScore: credibility,
      keywords: [...new Set(keywords)],
      metadata: { file: fileData.filename },
    });
    return chunks;
  }

  // 策略4: car-rental-guide.json - 按章节详细分块
  if (fileData.filename.includes('rental') || fileData.filename.includes('car')) {
    const content = fileData.content;
    const sectionConfigs = [
      { key: 'overview', title: '租车概述', type: 'rental_overview' },
      { key: 'rental_companies', title: '租车公司', type: 'rental_companies' },
      { key: 'vehicle_types', title: '车型选择', type: 'vehicle_types' },
      { key: 'insurance_breakdown', title: '保险详解', type: 'insurance' },
      { key: 'pickup_process', title: '取车流程', type: 'process' },
      { key: 'driving_rules', title: '驾驶规则', type: 'rules' },
      { key: 'return_process', title: '还车流程', type: 'process' },
      { key: 'cost_planning', title: '费用规划', type: 'cost' },
    ];
    
    sectionConfigs.forEach(({ key, title, type }) => {
      if (content[key]) {
        const sectionData = content[key];
        const text = extractNestedText(sectionData);
        if (text && text.length > 30) {
          const keywords = extractKeywords(sectionData);
          keywords.push('租车', '冰岛租车', title);
          if (key === 'insurance_breakdown') keywords.push('保险', '全险', 'CDW', 'SCDW', '砂石险');
          
          chunks.push({
            chunkId: `${fileData.filename}_${key}`,
            content: `${title}\n${text}`,
            type,
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            section: key,
            metadata: { file: fileData.filename },
          });
        }
      }
    });
    return chunks.length > 0 ? chunks : createDefaultChunks(fileData, credibility);
  }

  // 策略5: local-rules.json - 按规则分块
  if (fileData.filename.includes('rules') || fileData.filename.includes('laws')) {
    const rules = fileData.content.environmental_laws?.laws || 
                  fileData.content.laws || 
                  fileData.content.rules || 
                  [];
    if (Array.isArray(rules) && rules.length > 0) {
      rules.forEach((rule: any, index: number) => {
        const parts: string[] = [];
        if (rule.law) parts.push(`法律: ${rule.law}`);
        if (rule.name_en) parts.push(`英文名: ${rule.name_en}`);
        if (rule.description) parts.push(`描述: ${rule.description}`);
        if (rule.prohibited && Array.isArray(rule.prohibited)) {
          parts.push(`禁止事项: ${rule.prohibited.join('、')}`);
        }
        if (rule.penalty) parts.push(`处罚: ${rule.penalty}`);
        if (rule.tips) parts.push(`提示: ${rule.tips}`);
        
        const keywords = extractKeywords(rule);
        keywords.push('冰岛法规', '法律', '规定');
        
        chunks.push({
          chunkId: `${fileData.filename}_rule_${rule.law_id || index}`,
          content: parts.join('\n'),
          type: 'legal_rule',
          credibilityScore: credibility,
          keywords: [...new Set(keywords)],
          metadata: { file: fileData.filename, severity: rule.penalty ? 'high' : 'medium' },
        });
      });
      return chunks;
    }
  }

  // 策略6: 其他结构化文件 - 按顶级 key 分块
  const content = fileData.content;
  const topKeys = Object.keys(content).filter(k => k !== 'metadata');
  
  if (topKeys.length > 1 && topKeys.length <= 10) {
    topKeys.forEach(key => {
      const sectionData = content[key];
      if (sectionData && typeof sectionData === 'object') {
        const text = extractNestedText(sectionData);
        if (text && text.length > 50) {
          const keywords = extractKeywords(sectionData);
          keywords.push(fileData.filename.replace('.json', ''), key);
          
          chunks.push({
            chunkId: `${fileData.filename}_${key}`,
            content: `[${key}]\n${text}`,
            type: 'section',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            section: key,
            metadata: { file: fileData.filename },
          });
        }
      }
    });
    if (chunks.length > 0) return chunks;
  }

  // 默认策略
  return createDefaultChunks(fileData, credibility);
}

// 创建默认 chunk
function createDefaultChunks(fileData: any, credibility: number) {
  const text = extractNestedText(fileData.content);
  const keywords = extractKeywords(fileData.content);
  keywords.push(fileData.filename.replace('.json', ''));
  
  return [{
    chunkId: `${fileData.filename}_full`,
    content: text || JSON.stringify(fileData.content, null, 2).substring(0, 3000),
    type: 'full',
    credibilityScore: credibility,
    keywords: [...new Set(keywords)],
    metadata: { file: fileData.filename },
  }];
}

async function indexKnowledgeBase() {
  const prisma = new PrismaClient();
  const embeddingService = new SimpleEmbeddingService();

  try {
    console.log('🚀 开始索引冰岛知识库...\n');

    // 1. 确定知识库路径
    const kbPath = process.env.KB_PATH || './docs/iceland';
    console.log(`📁 知识库路径: ${kbPath}\n`);

    if (!fs.existsSync(kbPath)) {
      console.error(`❌ 知识库路径不存在: ${kbPath}`);
      console.log(`💡 请确认路径是否正确，或设置环境变量 KB_PATH`);
      console.log(`💡 当前工作目录: ${process.cwd()}`);
      console.log(`💡 尝试查找 docs/iceland 目录...`);
      
      // 尝试查找 docs/iceland
      const possiblePaths = [
        './docs/iceland',
        '../docs/iceland',
        path.join(process.cwd(), 'docs', 'iceland'),
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          console.log(`✅ 找到知识库路径: ${possiblePath}`);
          const kbPath = possiblePath;
          break;
        }
      }
      
      throw new Error(`知识库路径不存在: ${kbPath}`);
    }

    // 2. 加载所有文件
    console.log('📚 加载知识库文件...\n');
    const files = loadAllFiles(kbPath);
    console.log(`\n📊 总共加载 ${files.length} 个文件\n`);

    if (files.length === 0) {
      console.log('⚠️  没有找到任何 JSON 文件');
      return;
    }

    // 3. 处理每个文件
    for (const fileData of files) {
      console.log(`\n📝 处理文件: ${fileData.filename}`);

      try {
        // 3.1 保存文件记录
        const category = detectCategory(fileData.filename);
        const file = await prisma.knowledgeFile.upsert({
          where: { filename: fileData.filename },
          update: {
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
          create: {
            filename: fileData.filename,
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            language: fileData.metadata.language || 'zh-CN',
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
        });

        const fileId = file.id;
        console.log(`  ✅ 文件记录已保存: ${fileId}`);

        // 3.2 分块
        const chunks = autoChunk(fileData);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  跳过：没有生成任何chunks`);
          continue;
        }

        // 3.3 向量化
        console.log(`  🔢 开始向量化...`);
        const texts = chunks.map((c) => c.content);
        const embeddings = await embeddingService.generateEmbeddingsBatch(texts);
        console.log(`  ✅ 向量化完成`);

        // 3.4 批量插入
        console.log(`  💾 保存到数据库...`);
        const batchSize = 50;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchEmbeddings = embeddings.slice(i, i + batchSize);

          await prisma.$transaction(
            batch.map((chunk, idx) => {
              const embedding = batchEmbeddings[idx];
              return prisma.$executeRaw`
                INSERT INTO chunks (
                  id, chunk_id, content, embedding, type, credibility_score, 
                  keywords, file_id, section, metadata, created_at, updated_at
                )
                VALUES (
                  gen_random_uuid(),
                  ${chunk.chunkId},
                  ${chunk.content.substring(0, 50000)},
                  ${JSON.stringify(embedding)}::vector,
                  ${chunk.type},
                  ${chunk.credibilityScore},
                  ${chunk.keywords}::text[],
                  ${fileId}::uuid,
                  ${chunk.section || null},
                  ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
                  NOW(),
                  NOW()
                )
                ON CONFLICT (chunk_id) DO UPDATE SET
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding,
                  updated_at = NOW()
              `;
            })
          );
        }

        console.log(`  ✅ 文件索引完成`);
      } catch (error: any) {
        console.error(`  ❌ 文件处理失败:`, error.message);
        // 继续处理下一个文件
      }
    }

    console.log('\n✅ 知识库索引完成！\n');

    // 4. 统计信息
    const fileCount = await prisma.knowledgeFile.count();
    const chunkCount = await prisma.chunk.count();
    const chunkWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
    );

    console.log('📊 索引统计:');
    console.log(`  - 文件数: ${fileCount}`);
    console.log(`  - 分块数: ${chunkCount}`);
    console.log(`  - 有向量的分块: ${Number(chunkWithEmbedding[0]?.count || 0)}`);

  } catch (error: any) {
    console.error('\n❌ 索引失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 索引脚本执行失败:', error);
    process.exit(1);
  });
