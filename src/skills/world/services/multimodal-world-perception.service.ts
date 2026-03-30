/**
 * 多模态世界感知服务
 * 
 * 负责处理多模态数据（图像、视频、文本），包括：
 * - 处理用户上传的照片（提取地理信息、场景识别）
 * - 处理用户评论和游记（情感分析、关键词提取）
 * - 将这些信息整合到世界模型中
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VisionService } from '../../../vision/vision.service';
import { ImageDirectService } from '../../../mcp/image-direct.service';

/**
 * 图像分析结果
 */
export interface ImageAnalysisResult {
  imageUrl: string;
  location?: {
    lat: number;
    lng: number;
    confidence: number;
  };
  sceneType?: 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
  detectedObjects?: string[];
  weatherConditions?: 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY';
  crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  accessibility?: 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING';
  timestamp?: Date;
  confidence: number;
}

/**
 * 文本分析结果
 */
export interface TextAnalysisResult {
  text: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  keywords: string[];
  topics: string[];
  difficultyMentioned?: 'EASY' | 'MODERATE' | 'HARD';
  weatherMentioned?: string[];
  riskFactors?: string[];
  recommendations?: string[];
  confidence: number;
}

/**
 * 多模态感知结果
 */
export interface MultimodalPerceptionResult {
  poiId?: string;
  routeDirectionId?: string;
  images: ImageAnalysisResult[];
  texts: TextAnalysisResult[];
  aggregatedInsights: {
    averageSentiment: number; // -1 to 1
    commonKeywords: string[];
    commonTopics: string[];
    difficultyConsensus?: 'EASY' | 'MODERATE' | 'HARD';
    weatherPatterns?: string[];
    riskFactors?: string[];
  };
  confidence: number;
}

@Injectable()
export class MultimodalWorldPerceptionService {
  private readonly logger = new Logger(MultimodalWorldPerceptionService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private visionService?: VisionService,
    @Optional() private imageDirectService?: ImageDirectService,
  ) {}

  /**
   * 分析图像（提取地理信息、场景识别）
   */
  async analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
    this.logger.log(`[MultimodalPerception] 分析图像: ${imageUrl}`);

    try {
      const result: ImageAnalysisResult = {
        imageUrl,
        confidence: 0.5, // 默认置信度
      };

      // 1. 使用VisionService分析图像（如果有）
      if (this.visionService) {
        try {
          // 下载图片（简化处理，实际应该使用HTTP客户端）
          // 这里假设imageUrl可以直接访问，或者已经转换为Buffer
          // 实际实现中需要根据imageUrl下载图片
          const visionResponse = await this.visionService.analyzeImage(imageUrl, {
            locale: 'zh-CN',
          });
          
          if (visionResponse.success && visionResponse.data) {
            const visionData = visionResponse.data;
            result.detectedObjects = visionData.detectedObjects;
            result.sceneType = visionData.sceneType;
            result.weatherConditions = visionData.weatherConditions;
            result.crowdLevel = visionData.crowdLevel;
            result.accessibility = visionData.accessibility;
            
            if (visionData.location) {
              result.location = {
                lat: visionData.location.lat,
                lng: visionData.location.lng,
                confidence: visionData.location.confidence || 0.5,
              };
            }
            
            // 更新置信度
            result.confidence = Math.max(result.confidence, visionData.confidence);
          }
        } catch (error: any) {
          this.logger.warn(
            `[MultimodalPerception] VisionService分析失败: ${error.message}`,
          );
        }
      }

      // 2. 使用ImageDirectService提取地理信息（如果有）
      if (this.imageDirectService) {
        try {
          // TODO: 实现地理信息提取逻辑
          // const geoResult = await this.imageDirectService.extractLocation(imageUrl);
          // if (geoResult) {
          //   result.location = {
          //     lat: geoResult.lat,
          //     lng: geoResult.lng,
          //     confidence: geoResult.confidence,
          //   };
          // }
        } catch (error: any) {
          this.logger.warn(
            `[MultimodalPerception] ImageDirectService提取地理信息失败: ${error.message}`,
          );
        }
      }

      // 3. 从数据库查询图像元数据（如果有）
      const imageMetadata = await this.getImageMetadata(imageUrl);
      if (imageMetadata) {
        if (imageMetadata.location) {
          result.location = {
            lat: imageMetadata.location.lat,
            lng: imageMetadata.location.lng,
            confidence: 0.8, // 数据库元数据置信度
          };
        }
        if (imageMetadata.timestamp) {
          result.timestamp = imageMetadata.timestamp;
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(
        `[MultimodalPerception] 分析图像失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回基础结果
      return {
        imageUrl,
        confidence: 0.3,
      };
    }
  }

  /**
   * 分析文本（情感分析、关键词提取）
   */
  async analyzeText(text: string): Promise<TextAnalysisResult> {
    this.logger.log(`[MultimodalPerception] 分析文本: length=${text.length}`);

    try {
      const result: TextAnalysisResult = {
        text,
        sentiment: 'NEUTRAL',
        keywords: [],
        topics: [],
        confidence: 0.5,
      };

      // 1. 情感分析（简单实现）
      result.sentiment = this.analyzeSentiment(text);

      // 2. 关键词提取（简单实现）
      result.keywords = this.extractKeywords(text);

      // 3. 主题提取（简单实现）
      result.topics = this.extractTopics(text);

      // 4. 提取难度信息
      result.difficultyMentioned = this.extractDifficulty(text);

      // 5. 提取天气信息
      result.weatherMentioned = this.extractWeather(text);

      // 6. 提取风险因素
      result.riskFactors = this.extractRiskFactors(text);

      // 7. 提取推荐信息
      result.recommendations = this.extractRecommendations(text);

      return result;
    } catch (error: any) {
      this.logger.error(
        `[MultimodalPerception] 分析文本失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回基础结果
      return {
        text,
        sentiment: 'NEUTRAL',
        keywords: [],
        topics: [],
        confidence: 0.3,
      };
    }
  }

  /**
   * 整合多模态感知结果
   */
  async aggregatePerceptionResults(
    poiId?: string,
    routeDirectionId?: string,
  ): Promise<MultimodalPerceptionResult> {
    this.logger.log(
      `[MultimodalPerception] 整合多模态感知结果: poiId=${poiId}, routeDirectionId=${routeDirectionId}`,
    );

    try {
      const images: ImageAnalysisResult[] = [];
      const texts: TextAnalysisResult[] = [];

      // 1. 获取POI相关的图像和文本
      if (poiId) {
        const poiImages = await this.getPoiImages(poiId);
        for (const imageUrl of poiImages) {
          const analysis = await this.analyzeImage(imageUrl);
          images.push(analysis);
        }

        const poiTexts = await this.getPoiTexts(poiId);
        for (const text of poiTexts) {
          const analysis = await this.analyzeText(text);
          texts.push(analysis);
        }
      }

      // 2. 获取RouteDirection相关的文本
      if (routeDirectionId) {
        const routeTexts = await this.getRouteDirectionTexts(routeDirectionId);
        for (const text of routeTexts) {
          const analysis = await this.analyzeText(text);
          texts.push(analysis);
        }
      }

      // 3. 聚合洞察
      const aggregatedInsights = this.aggregateInsights(images, texts);

      return {
        poiId,
        routeDirectionId,
        images,
        texts,
        aggregatedInsights,
        confidence: this.calculateOverallConfidence(images, texts),
      };
    } catch (error: any) {
      this.logger.error(
        `[MultimodalPerception] 整合多模态感知结果失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回空结果
      return {
        poiId,
        routeDirectionId,
        images: [],
        texts: [],
        aggregatedInsights: {
          averageSentiment: 0,
          commonKeywords: [],
          commonTopics: [],
        },
        confidence: 0.3,
      };
    }
  }

  /**
   * 从数据库获取图像元数据
   */
  private async getImageMetadata(_imageUrl: string): Promise<{
    location?: { lat: number; lng: number };
    timestamp?: Date;
  } | null> {
    // TODO: 从数据库查询图像元数据
    // 可以从Place.metadata.images中查找
    return null;
  }

  /**
   * 获取POI相关的图像URL
   */
  private async getPoiImages(poiId: string): Promise<string[]> {
    const place = await this.prisma.place.findUnique({
      where: { id: parseInt(poiId) },
      select: { metadata: true },
    });

    if (!place || !place.metadata) {
      return [];
    }

    const metadata = place.metadata as any;
    const images = metadata.images || [];
    return images.map((img: any) => img.url).filter(Boolean);
  }

  /**
   * 获取POI相关的文本（评论、游记）
   */
  private async getPoiTexts(_poiId: string): Promise<string[]> {
    // TODO: 从数据库查询POI相关的评论和游记
    // 可以从reviews表或user_feedback表中查询
    return [];
  }

  /**
   * 获取RouteDirection相关的文本（游记、反馈）
   */
  private async getRouteDirectionTexts(
    _routeDirectionId: string,
  ): Promise<string[]> {
    // TODO: 从数据库查询RouteDirection相关的游记和反馈
    // 可以从user_feedback表中查询
    return [];
  }

  /**
   * 情感分析（增强版）
   * 
   * 使用更全面的词典和规则进行情感分析
   */
  private analyzeSentiment(text: string): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' {
    const lowerText = text.toLowerCase();
    
    // 扩展的积极词汇（带权重）
    const positiveWords: Array<{ word: string; weight: number }> = [
      { word: '好', weight: 1 },
      { word: '棒', weight: 2 },
      { word: '美', weight: 2 },
      { word: '推荐', weight: 2 },
      { word: '值得', weight: 2 },
      { word: '喜欢', weight: 1 },
      { word: '满意', weight: 1 },
      { word: '完美', weight: 3 },
      { word: '惊艳', weight: 3 },
      { word: '震撼', weight: 2 },
      { word: '必去', weight: 2 },
      { word: '难忘', weight: 2 },
      { word: '超值', weight: 2 },
      { word: '绝美', weight: 3 },
      { word: '壮观', weight: 2 },
      { word: 'amazing', weight: 2 },
      { word: 'wonderful', weight: 2 },
      { word: 'beautiful', weight: 2 },
      { word: 'excellent', weight: 2 },
      { word: 'great', weight: 1 },
      { word: 'fantastic', weight: 2 },
      { word: 'awesome', weight: 2 },
    ];
    
    // 扩展的消极词汇（带权重）
    const negativeWords: Array<{ word: string; weight: number }> = [
      { word: '差', weight: 1 },
      { word: '糟糕', weight: 2 },
      { word: '失望', weight: 2 },
      { word: '不推荐', weight: 3 },
      { word: '不值得', weight: 2 },
      { word: '讨厌', weight: 2 },
      { word: '不满意', weight: 2 },
      { word: '后悔', weight: 2 },
      { word: '浪费', weight: 2 },
      { word: '坑', weight: 2 },
      { word: '差评', weight: 2 },
      { word: '糟糕', weight: 2 },
      { word: 'terrible', weight: 2 },
      { word: 'bad', weight: 1 },
      { word: 'disappointed', weight: 2 },
      { word: 'awful', weight: 2 },
      { word: 'horrible', weight: 2 },
      { word: 'not worth', weight: 2 },
    ];
    
    // 否定词（会反转情感）
    const negationWords = ['不', '没', '非', '无', 'not', 'no', 'never', 'none'];
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    // 检查积极词汇
    for (const { word, weight } of positiveWords) {
      const index = lowerText.indexOf(word);
      if (index !== -1) {
        // 检查前面是否有否定词
        const beforeWord = lowerText.substring(Math.max(0, index - 10), index);
        const hasNegation = negationWords.some(neg => beforeWord.includes(neg));
        
        if (hasNegation) {
          negativeScore += weight;
        } else {
          positiveScore += weight;
        }
      }
    }
    
    // 检查消极词汇
    for (const { word, weight } of negativeWords) {
      const index = lowerText.indexOf(word);
      if (index !== -1) {
        // 检查前面是否有否定词
        const beforeWord = lowerText.substring(Math.max(0, index - 10), index);
        const hasNegation = negationWords.some(neg => beforeWord.includes(neg));
        
        if (hasNegation) {
          positiveScore += weight;
        } else {
          negativeScore += weight;
        }
      }
    }
    
    // 判断情感
    if (positiveScore > negativeScore * 1.2) {
      return 'POSITIVE';
    } else if (negativeScore > positiveScore * 1.2) {
      return 'NEGATIVE';
    } else {
      return 'NEUTRAL';
    }
  }

  /**
   * 提取关键词（增强版）
   * 
   * 使用TF-IDF思想和更智能的提取方法
   */
  private extractKeywords(text: string): string[] {
    const lowerText = text.toLowerCase();

    // 扩展的旅游关键词库（分类）
    const keywordCategories: Record<string, string[]> = {
      // 自然景观
      natural: ['风景', '美景', '壮观', '震撼', '绝美', '自然', '山', '海', '湖', '瀑布', '峡谷', '冰川', '火山'],
      // 活动类型
      activities: ['徒步', '登山', '攀岩', '漂流', '滑雪', '自驾', '骑行', '露营', '观鸟', '摄影', '潜水'],
      // 评价词汇
      evaluation: ['推荐', '值得', '必去', '打卡', '难忘', '超值', '完美', '惊艳'],
      // 实用信息
      practical: ['难度', '天气', '路况', '交通', '住宿', '餐饮', '门票', '开放时间', '营业时间'],
      // 情感词汇
      emotion: ['喜欢', '满意', '惊喜', '感动', '兴奋', '放松', '享受'],
      // 英文关键词
      english: ['scenic', 'beautiful', 'amazing', 'recommend', 'worth', 'must-visit', 'hiking', 'driving', 'photography'],
    };
    
    // 提取关键词（去重）
    const foundKeywords = new Set<string>();
    
    for (const category of Object.values(keywordCategories)) {
      for (const keyword of category) {
        if (lowerText.includes(keyword.toLowerCase())) {
          foundKeywords.add(keyword);
        }
      }
    }
    
    // 提取地名（简单规则：包含常见地名后缀）
    const locationSuffixes = ['山', '湖', '海', '岛', '谷', '瀑布', '公园', '博物馆', '教堂', '寺', '庙'];
    for (const suffix of locationSuffixes) {
      const regex = new RegExp(`[\\u4e00-\\u9fa5]+${suffix}`, 'g');
      const matches = text.match(regex);
      if (matches) {
        matches.forEach(match => foundKeywords.add(match));
      }
    }
    
    // 提取数字+单位（如"3小时"、"5公里"）
    const numberUnitPattern = /\d+\s*(小时|分钟|公里|米|天|日)/g;
    const numberMatches = text.match(numberUnitPattern);
    if (numberMatches) {
      numberMatches.forEach(match => foundKeywords.add(match));
    }
    
    return Array.from(foundKeywords).slice(0, 20); // 最多返回20个关键词
  }

  /**
   * 提取主题（简单实现）
   */
  private extractTopics(text: string): string[] {
    // TODO: 实现更复杂的主题提取逻辑
    const topics: string[] = [];
    const commonTopics = [
      '自然风光',
      '历史文化',
      '美食',
      '冒险',
      '休闲',
      '摄影',
      '徒步',
      '自驾',
    ];

    // 简单匹配
    for (const topic of commonTopics) {
      if (text.includes(topic)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * 提取难度信息
   */
  private extractDifficulty(
    text: string,
  ): 'EASY' | 'MODERATE' | 'HARD' | undefined {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('简单') || lowerText.includes('容易')) {
      return 'EASY';
    } else if (lowerText.includes('困难') || lowerText.includes('难')) {
      return 'HARD';
    } else if (lowerText.includes('中等') || lowerText.includes('适中')) {
      return 'MODERATE';
    }
    return undefined;
  }

  /**
   * 提取天气信息
   */
  private extractWeather(text: string): string[] {
    const weatherKeywords: string[] = [];
    const weatherTerms = ['晴天', '雨天', '雪天', '大风', '雾', '云'];

    for (const term of weatherTerms) {
      if (text.includes(term)) {
        weatherKeywords.push(term);
      }
    }

    return weatherKeywords;
  }

  /**
   * 提取风险因素
   */
  private extractRiskFactors(text: string): string[] {
    const riskFactors: string[] = [];
    const riskKeywords = ['危险', '风险', '注意', '小心', '安全'];

    for (const keyword of riskKeywords) {
      if (text.includes(keyword)) {
        riskFactors.push(keyword);
      }
    }

    return riskFactors;
  }

  /**
   * 提取推荐信息
   */
  private extractRecommendations(text: string): string[] {
    const recommendations: string[] = [];
    const recommendationPatterns = [
      /建议(.+)/g,
      /推荐(.+)/g,
      /最好(.+)/g,
      /应该(.+)/g,
    ];

    for (const pattern of recommendationPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          recommendations.push(match[1].trim());
        }
      }
    }

    return recommendations;
  }

  /**
   * 聚合洞察
   */
  private aggregateInsights(
    images: ImageAnalysisResult[],
    texts: TextAnalysisResult[],
  ): MultimodalPerceptionResult['aggregatedInsights'] {
    // 1. 计算平均情感
    const sentiments = texts.map((t) =>
      t.sentiment === 'POSITIVE' ? 1 : t.sentiment === 'NEGATIVE' ? -1 : 0,
    ) as number[];
    const averageSentiment =
      sentiments.length > 0
        ? sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length
        : 0;

    // 2. 提取常见关键词
    const allKeywords = texts.flatMap((t) => t.keywords);
    const keywordCounts = new Map<string, number>();
    for (const keyword of allKeywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
    const commonKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword]) => keyword);

    // 3. 提取常见主题
    const allTopics = texts.flatMap((t) => t.topics);
    const topicCounts = new Map<string, number>();
    for (const topic of allTopics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    const commonTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    // 4. 难度共识
    const difficulties = texts
      .map((t) => t.difficultyMentioned)
      .filter(Boolean) as string[];
    const difficultyConsensus = this.getConsensus(difficulties) as
      | 'EASY'
      | 'MODERATE'
      | 'HARD'
      | undefined;

    // 5. 天气模式
    const weatherPatterns = Array.from(
      new Set(texts.flatMap((t) => t.weatherMentioned || [])),
    );

    // 6. 风险因素
    const riskFactors = Array.from(
      new Set(texts.flatMap((t) => t.riskFactors || [])),
    );

    return {
      averageSentiment,
      commonKeywords,
      commonTopics,
      difficultyConsensus,
      weatherPatterns: weatherPatterns.length > 0 ? weatherPatterns : undefined,
      riskFactors: riskFactors.length > 0 ? riskFactors : undefined,
    };
  }

  /**
   * 获取共识（多数投票）
   */
  private getConsensus(values: string[]): string | undefined {
    if (values.length === 0) {
      return undefined;
    }

    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  /**
   * 计算总体置信度
   */
  private calculateOverallConfidence(
    images: ImageAnalysisResult[],
    texts: TextAnalysisResult[],
  ): number {
    const imageConfidences = images.map((i) => i.confidence);
    const textConfidences = texts.map((t) => t.confidence);

    const allConfidences = [...imageConfidences, ...textConfidences];
    if (allConfidences.length === 0) {
      return 0.3; // 默认置信度
    }

    const averageConfidence =
      allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;

    // 如果有更多数据，提高置信度
    const dataVolumeBonus = Math.min(
      0.2,
      (allConfidences.length / 10) * 0.1,
    );

    return Math.min(1.0, averageConfidence + dataVolumeBonus);
  }
}
