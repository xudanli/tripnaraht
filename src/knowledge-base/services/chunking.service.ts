// src/knowledge-base/services/chunking.service.ts

import { Injectable } from '@nestjs/common';
import { KBFileData, Chunk } from '../interfaces/knowledge-base.interface';

@Injectable()
export class ChunkingService {
  /**
   * 策略1: 按对象分块
   */
  chunkByObject(kbFile: KBFileData, arrayPath: string): Chunk[] {
    const chunks: Chunk[] = [];

    const array = this.getNestedValue(kbFile.content, arrayPath);
    if (!Array.isArray(array)) return chunks;

    array.forEach((item, index) => {
      const itemId = item.rhythm_id || item.route_id || item.id || item.name || item.name_cn || `item_${index}`;
      const type = this.detectType(item);

      chunks.push({
        chunkId: `${kbFile.filename}_${itemId}_${index}`,
        // 使用新的文本提取方法，生成更有意义的内容
        content: this.extractTextContent(item, type),
        type,
        credibilityScore: kbFile.metadata.credibility_score,
        keywords: this.extractKeywords(item),
        section: arrayPath,
        metadata: {
          file: kbFile.filename,
          index,
          // 保留原始 JSON 在 metadata 中，以备需要时使用
          originalData: item,
        },
      });
    });

    return chunks;
  }

  /**
   * 策略2: 按章节分块
   */
  chunkBySection(kbFile: KBFileData, sections: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    const content = kbFile.content;

    sections.forEach((section) => {
      if (content[section]) {
        const sectionData = content[section];
        const keywords = [section];
        
        // 从章节内容中提取关键词
        if (typeof sectionData === 'object') {
          const extractedKeywords = this.extractKeywords(sectionData);
          keywords.push(...extractedKeywords);
        }

        chunks.push({
          chunkId: `${kbFile.filename}_${section}`,
          // 使用新的文本提取方法
          content: this.extractTextContent(sectionData, 'operational_guide'),
          type: 'operational_guide',
          credibilityScore: kbFile.metadata.credibility_score,
          keywords: [...new Set(keywords)],
          section,
          metadata: {
            file: kbFile.filename,
            originalData: sectionData,
          },
        });
      }
    });

    return chunks;
  }

  /**
   * 策略3: 按规则分块
   */
  chunkByRule(kbFile: KBFileData, rulesPath: string): Chunk[] {
    const chunks: Chunk[] = [];

    const rules = this.getNestedValue(kbFile.content, rulesPath);
    if (!Array.isArray(rules)) return chunks;

    rules.forEach((rule, index) => {
      const keywords = this.extractKeywords(rule);
      // 确保包含法律相关的关键词
      if (rule.law) keywords.push(rule.law);
      if (rule.name_en) keywords.push(rule.name_en);
      if (rule.prohibited && Array.isArray(rule.prohibited)) {
        keywords.push(...rule.prohibited.filter((p: any) => typeof p === 'string'));
      }

      chunks.push({
        chunkId: `${kbFile.filename}_rule_${rule.law_id || index}`,
        // 使用新的文本提取方法
        content: this.extractTextContent(rule, 'legal_rule'),
        type: 'legal_rule',
        credibilityScore: kbFile.metadata.credibility_score,
        keywords: [...new Set(keywords)],
        metadata: {
          file: kbFile.filename,
          severity: rule.penalty ? 'high' : 'medium',
          penalty: rule.penalty,
          originalData: rule,
        },
      });
    });

    return chunks;
  }

  /**
   * 自动选择分块策略
   */
  autoChunk(kbFile: KBFileData): Chunk[] {
    if (kbFile.filename.includes('rhythm')) {
      return this.chunkByObject(kbFile, 'rhythm_patterns');
    }

    if (kbFile.filename.includes('rental')) {
      return this.chunkBySection(kbFile, [
        'overview',
        'rental_companies',
        'vehicle_types',
        'insurance_breakdown',
        'pickup_process',
        'driving_rules',
        'return_process',
        'cost_planning',
      ]);
    }

    if (kbFile.filename.includes('rules')) {
      return this.chunkByRule(kbFile, 'environmental_laws.laws');
    }

    // 默认：整个文件作为一个chunk
    // 尝试从根对象提取关键词
    const keywords = this.extractKeywords(kbFile.content);
    keywords.push(kbFile.filename);

    return [
      {
        chunkId: `${kbFile.filename}_full`,
        // 使用新的文本提取方法
        content: this.extractTextContent(kbFile.content, 'general'),
        type: 'full',
        credibilityScore: kbFile.metadata.credibility_score,
        keywords: [...new Set(keywords)],
        metadata: {
          file: kbFile.filename,
          originalData: kbFile.content,
        },
      },
    ];
  }

  // 辅助方法
  private getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  private detectType(item: any): string {
    if (item.rhythm_id) return 'rhythm_pattern';
    if (item.route_id) return 'route';
    if (item.law_id) return 'legal_rule';
    if (item.hazard_id) return 'hazard';
    // 检测景点/POI类型
    if (item.attraction_name || item.poi_name || item.name_cn || (item.name && item.type)) {
      return 'poi';
    }
    // 检测住宿类型
    if (item.hotel_name || item.accommodation_name || (item.type && ['hotel', 'hostel', 'guesthouse'].includes(item.type.toLowerCase()))) {
      return 'accommodation';
    }
    // 检测餐厅类型
    if (item.restaurant_name || (item.type && ['restaurant', 'cafe', 'bar'].includes(item.type.toLowerCase()))) {
      return 'restaurant';
    }
    return 'general';
  }

  /**
   * 从 JSON 对象中提取关键词
   * 支持多种字段类型和嵌套结构
   */
  private extractKeywords(item: any): string[] {
    const keywords: string[] = [];

    // 1. 名称字段（中英文）
    const nameFields = ['name', 'name_cn', 'name_en', 'nameCN', 'nameEN', 'title', 'title_cn', 'title_en'];
    nameFields.forEach(field => {
      if (item[field] && typeof item[field] === 'string') {
        keywords.push(item[field]);
        // 如果是中文名称，提取关键词
        if (/[\u4e00-\u9fa5]/.test(item[field])) {
          const words = this.extractChineseWords(item[field]);
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
        const words = this.extractWordsFromText(item[field]);
        keywords.push(...words.slice(0, 10)); // 每个字段最多提取10个词
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

    // 6. 开放时间相关（提取关键词如"开门"、"营业"等）
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

    // 8. 从嵌套对象中提取
    if (item.metadata && typeof item.metadata === 'object') {
      if (item.metadata.name) keywords.push(item.metadata.name);
      if (item.metadata.tags && Array.isArray(item.metadata.tags)) {
        keywords.push(...item.metadata.tags.filter((t: any) => typeof t === 'string'));
      }
    }

    // 9. 从所有字符串值中提取关键词（深度遍历）
    const allStrings = this.extractAllStrings(item);
    allStrings.forEach(str => {
      if (str.length > 2 && str.length < 50) {
        const words = this.extractWordsFromText(str);
        keywords.push(...words.slice(0, 3)); // 每个字符串最多提取3个词
      }
    });

    // 去重、过滤和限制
    return [...new Set(keywords)]
      .filter(k => k && k.length >= 2 && k.length <= 50) // 过滤太短或太长的词
      .filter(k => !this.isStopWord(k)) // 过滤停用词
      .slice(0, 50); // 最多保留50个关键词
  }

  /**
   * 从文本中提取关键词（支持中英文）
   */
  private extractWordsFromText(text: string): string[] {
    if (!text || typeof text !== 'string') return [];

    const words: string[] = [];

    // 提取中文词（2-10个字符）
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
    words.push(...chineseWords);

    // 提取英文单词（2-20个字符）
    const englishWords = text.match(/[a-zA-Z]{2,20}/g) || [];
    words.push(...englishWords.map(w => w.toLowerCase()));

    // 提取中英文混合短语
    const mixedPhrases = text.match(/[\u4e00-\u9fa5]+[a-zA-Z]+|[a-zA-Z]+[\u4e00-\u9fa5]+/g) || [];
    words.push(...mixedPhrases);

    return words.filter(w => w.length >= 2);
  }

  /**
   * 从中文文本中提取关键词
   */
  private extractChineseWords(text: string): string[] {
    if (!text || typeof text !== 'string') return [];

    // 提取2-6个字符的中文词
    const words = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    return words.filter(w => !this.isStopWord(w));
  }

  /**
   * 从对象中提取所有字符串值（递归）
   */
  private extractAllStrings(obj: any, maxDepth: number = 3, currentDepth: number = 0): string[] {
    if (currentDepth >= maxDepth) return [];
    if (!obj || typeof obj !== 'object') return [];

    const strings: string[] = [];

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'string' && value.length > 0) {
          strings.push(value);
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string') {
              strings.push(item);
            } else if (typeof item === 'object') {
              strings.push(...this.extractAllStrings(item, maxDepth, currentDepth + 1));
            }
          });
        } else if (typeof value === 'object' && value !== null) {
          strings.push(...this.extractAllStrings(value, maxDepth, currentDepth + 1));
        }
      }
    }

    return strings;
  }

  /**
   * 判断是否为停用词
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      // 中文停用词
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      '那', '他', '她', '它', '们', '为', '以', '从', '与', '及', '或', '但', '而', '如果', '因为', '所以', '虽然', '但是', '然而', '而且', '并且',
      '这个', '那个', '这些', '那些', '什么', '怎么', '为什么', '哪里', '何时', '如何',
      // 英文停用词
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
      // 常见无意义词
      'null', 'undefined', 'true', 'false', 'object', 'array', 'string', 'number',
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * 提取有意义的文本内容（而不是完整的 JSON 字符串）
   * 将 JSON 对象转换为可读的文本格式
   */
  private extractTextContent(item: any, type?: string): string {
    if (!item || typeof item !== 'object') {
      return typeof item === 'string' ? item : JSON.stringify(item);
    }

    const parts: string[] = [];

    // 根据类型选择不同的提取策略
    if (type === 'rhythm_pattern' || item.rhythm_id) {
      // 节奏模式：提取名称、描述、特点
      if (item.rhythm_name) parts.push(`节奏名称: ${item.rhythm_name}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.features && Array.isArray(item.features)) {
        parts.push(`特点: ${item.features.join('、')}`);
      }
      if (item.suitable_for && Array.isArray(item.suitable_for)) {
        parts.push(`适合: ${item.suitable_for.join('、')}`);
      }
    } else if (type === 'legal_rule' || item.law_id) {
      // 法律规则：提取法律名称、禁止事项、处罚
      if (item.law) parts.push(`法律: ${item.law}`);
      if (item.name_en) parts.push(`英文名称: ${item.name_en}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.prohibited && Array.isArray(item.prohibited)) {
        parts.push(`禁止事项: ${item.prohibited.join('、')}`);
      }
      if (item.penalty) parts.push(`处罚: ${item.penalty}`);
    } else if (item.name || item.name_cn || item.name_en) {
      // 景点/POI：提取名称、描述、地址、开放时间等
      const name = item.name_cn || item.name || item.name_en || item.attraction_name || item.poi_name;
      if (name) parts.push(`名称: ${name}`);
      
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.overview) parts.push(`概述: ${item.overview}`);
      
      if (item.address) parts.push(`地址: ${item.address}`);
      if (item.location) {
        const loc = typeof item.location === 'string' 
          ? item.location 
          : [item.location.city, item.location.region, item.location.country].filter(Boolean).join(' ');
        if (loc) parts.push(`位置: ${loc}`);
      }
      
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
      // 通用提取：提取所有有意义的字段
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
      // 作为后备方案，返回格式化的 JSON（但限制长度）
      const jsonStr = JSON.stringify(item, null, 2);
      return jsonStr.length > 5000 ? jsonStr.substring(0, 5000) + '...' : jsonStr;
    }
  }
}
