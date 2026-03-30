// src/vision/vision.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantSuggestion, PoiCandidate } from '../assist/dto/action.dto';
import { MockOcrProvider } from '../providers/ocr/mock-ocr.provider';
import { GoogleOcrProvider } from '../providers/ocr/google-ocr.provider';
import { DeepSeekOcrProvider } from '../providers/ocr/deepseek-ocr.provider';
import { MockPoiProvider } from '../providers/poi/mock-poi.provider';
import { GooglePoiProvider } from '../providers/poi/google-poi.provider';
import {
  successResponse,
  errorResponse,
  ErrorCode,
  StandardResponse,
} from '../common/dto/standard-response.dto';
import { generateVisionSuggestionId } from '../common/utils/suggestion-id.util';
import { randomUUID } from 'crypto';
import { KeywordExtractor } from './utils/keyword-extractor.util';

/**
 * 视觉识别服务
 *
 * 处理拍照识别场景：OCR 提取文字 → POI 搜索 → 返回候选和建议
 *
 * OCR 优先级：DeepSeek-OCR > Google Vision > Mock
 * - DEEPSEEK_OCR_API_KEY 或 DEEPSEEK_API_KEY: DeepSeek-OCR
 * - GOOGLE_VISION_API_KEY: Google Vision
 *
 * POI: GOOGLE_PLACES_API_KEY 启用真实 POI，否则 Mock
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly keywordExtractor = new KeywordExtractor();

  constructor(
    private readonly mockOcrProvider: MockOcrProvider,
    private readonly mockPoiProvider: MockPoiProvider,
    @Optional() private readonly googleOcrProvider?: GoogleOcrProvider,
    @Optional() private readonly deepseekOcrProvider?: DeepSeekOcrProvider,
    @Optional() private readonly googlePoiProvider?: GooglePoiProvider,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * 拍照识别 POI 推荐
   * 
   * @param image 图片 Buffer
   * @param opts 选项（位置、语言等）
   * @returns 统一格式的响应：OCR 结果、POI 候选列表和建议
   */
  async poiRecommend(
    image: Buffer,
    opts: {
      lat: number;
      lng: number;
      locale?: string;
    }
  ): Promise<StandardResponse<{
    ocrResult: { fullText: string; lines: string[] };
    candidates: PoiCandidate[];
    suggestions: AssistantSuggestion[];
  }>> {
    const requestId = randomUUID();
    
    try {
      // 验证输入
      if (!image || image.length === 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'image is required',
          { field: 'image' }
        );
      }

      if (isNaN(opts.lat) || isNaN(opts.lng)) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'lat and lng must be valid numbers',
          { field: 'lat/lng', lat: opts.lat, lng: opts.lng }
        );
      }

      const useDeepSeekOcr =
        !!(this.configService?.get<string>('DEEPSEEK_OCR_API_KEY') ||
          this.configService?.get<string>('DEEPSEEK_API_KEY')) &&
        !!this.deepseekOcrProvider;
      const useGoogleOcr =
        !!this.configService?.get<string>('GOOGLE_VISION_API_KEY') &&
        !!this.googleOcrProvider;
      const _useRealOcr = useDeepSeekOcr || useGoogleOcr;
      const useRealPoi =
        !!this.configService?.get<string>('GOOGLE_PLACES_API_KEY') &&
        !!this.googlePoiProvider;

      const ocrProviderName = useDeepSeekOcr
        ? 'DeepSeek'
        : useGoogleOcr
          ? 'Google'
          : 'Mock';

      this.logger.log(
        `[${requestId}] Processing image: size=${image.length}, lat=${opts.lat}, lng=${opts.lng}, ocr=${ocrProviderName}, poi=${useRealPoi ? 'Google' : 'Mock'}`
      );

      // 步骤 1: OCR 提取文字（优先 DeepSeek > Google > Mock）
      let ocrResult;
      try {
        const ocrProvider = useDeepSeekOcr
          ? this.deepseekOcrProvider!
          : useGoogleOcr
            ? this.googleOcrProvider!
            : this.mockOcrProvider;
        ocrResult = await ocrProvider.extractText(image, {
          locale: opts.locale || 'zh-CN',
        });
      } catch (error: any) {
        this.logger.error(`[${requestId}] OCR error: ${error.message}`, error.stack);
        return errorResponse(
          ErrorCode.PROVIDER_ERROR,
          'OCR 提取文字失败',
          {
            provider: ocrProviderName + 'OcrProvider',
            originalError: error.message,
          }
        );
      }

      // 步骤 2: 从 OCR 文本中提取可能的店名/关键词（优化版：过滤价格/营业时间）
      const candidateNames = this.keywordExtractor.extractCandidateNames(
        ocrResult.lines,
        5
      );

      if (candidateNames.length === 0) {
        this.logger.warn(`[${requestId}] No candidate names extracted from OCR text`);
        // 不算错误，返回空结果
        return successResponse({
          ocrResult: {
            fullText: ocrResult.fullText,
            lines: ocrResult.lines,
          },
          candidates: [],
          suggestions: [],
        });
      }

      // 步骤 3: POI 搜索（有 GOOGLE_PLACES_API_KEY 时使用真实 POI 搜索）
      const allCandidates: PoiCandidate[] = [];
      try {
        const poiProvider = useRealPoi ? this.googlePoiProvider! : this.mockPoiProvider;
        for (const name of candidateNames) {
          if (name.trim().length > 0) {
            const results = await poiProvider.textSearch({
              query: name,
              lat: opts.lat,
              lng: opts.lng,
              radiusM: 1000, // 1km 范围内
              language: opts.locale || 'zh-CN',
            });
            allCandidates.push(...results);
          }
        }
      } catch (error: any) {
        this.logger.error(`[${requestId}] POI search error: ${error.message}`, error.stack);
        return errorResponse(
          ErrorCode.PROVIDER_ERROR,
          'POI 搜索失败',
          { provider: useRealPoi ? 'GooglePoiProvider' : 'MockPoiProvider', originalError: error.message }
        );
      }

      // 步骤 4: 去重和排序（按匹配度、距离、评分）
      const uniqueCandidates = this.deduplicateAndSortCandidates(allCandidates);

      // 步骤 5: 生成建议（每个候选 POI 生成一个"加入行程"建议）
      const suggestions: AssistantSuggestion[] = uniqueCandidates.slice(0, 5).map((poi) => {
        const suggestionId = generateVisionSuggestionId(poi.id, ocrResult.fullText);
        this.logger.log(`[${requestId}] Generated suggestion: id=${suggestionId}, poiId=${poi.id}`);
        
        return {
          id: suggestionId,
          title: poi.name,
          description: poi.address
            ? `${poi.address}${poi.distanceM ? ` · ${Math.round(poi.distanceM)}米` : ''}${poi.rating ? ` · ⭐ ${poi.rating}` : ''}`
            : undefined,
          confidence: this.calculateConfidence(poi, ocrResult.fullText),
          action: {
            type: 'ADD_POI_TO_SCHEDULE',
            poiId: poi.id,
          },
          poiInfo: {
            id: poi.id,
            name: poi.name,
            lat: poi.lat,
            lng: poi.lng,
            distanceM: poi.distanceM,
            rating: poi.rating,
            isOpenNow: poi.isOpenNow,
            matchScore: poi.matchScore,
          },
        };
      });

      this.logger.log(
        `[${requestId}] Completed: candidates=${uniqueCandidates.length}, suggestions=${suggestions.length}`
      );

      return successResponse({
        ocrResult: {
          fullText: ocrResult.fullText,
          lines: ocrResult.lines,
        },
        candidates: uniqueCandidates.slice(0, 10), // 返回 Top 10
        suggestions,
      });
    } catch (error: any) {
      this.logger.error(`[${requestId}] Unexpected error: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '处理图片时发生错误',
        { requestId }
      );
    }
  }


  /**
   * 从图片中提取文字（OCR）
   * 
   * @param image 图片 Buffer
   * @param opts 选项（语言等）
   * @returns OCR 提取的文字结果
   */
  async extractText(
    image: Buffer,
    opts?: {
      locale?: string;
    }
  ): Promise<StandardResponse<{
    fullText: string;
    lines: string[];
  }>> {
    const requestId = randomUUID();
    
    try {
      // 验证输入
      if (!image || image.length === 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'image is required',
          { field: 'image' }
        );
      }

      const useDeepSeekOcr =
        !!(this.configService?.get<string>('DEEPSEEK_OCR_API_KEY') ||
          this.configService?.get<string>('DEEPSEEK_API_KEY')) &&
        !!this.deepseekOcrProvider;
      const useGoogleOcr =
        !!this.configService?.get<string>('GOOGLE_VISION_API_KEY') &&
        !!this.googleOcrProvider;
      const ocrProviderName = useDeepSeekOcr
        ? 'DeepSeek'
        : useGoogleOcr
          ? 'Google'
          : 'Mock';

      this.logger.log(
        `[${requestId}] Extracting text from image: size=${image.length}, ocr=${ocrProviderName}`
      );

      // OCR 提取文字
      let ocrResult;
      try {
        const ocrProvider = useDeepSeekOcr
          ? this.deepseekOcrProvider!
          : useGoogleOcr
            ? this.googleOcrProvider!
            : this.mockOcrProvider;
        ocrResult = await ocrProvider.extractText(image, {
          locale: opts?.locale || 'zh-CN',
        });
      } catch (error: any) {
        this.logger.error(`[${requestId}] OCR error: ${error.message}`, error.stack);
        return errorResponse(
          ErrorCode.PROVIDER_ERROR,
          'OCR 提取文字失败',
          { provider: 'MockOcrProvider', originalError: error.message }
        );
      }

      this.logger.log(
        `[${requestId}] OCR completed: lines=${ocrResult.lines.length}`
      );

      return successResponse({
        fullText: ocrResult.fullText,
        lines: ocrResult.lines,
      });
    } catch (error: any) {
      this.logger.error(`[${requestId}] Unexpected error: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '提取文字时发生错误',
        { requestId }
      );
    }
  }

  /**
   * 去重并排序候选 POI
   * 
   * 排序规则：
   * 1. matchScore（文本匹配度）
   * 2. distanceM（距离）
   * 3. rating（评分）
   */
  private deduplicateAndSortCandidates(candidates: PoiCandidate[]): PoiCandidate[] {
    // 按 ID 去重
    const uniqueMap = new Map<string, PoiCandidate>();
    for (const candidate of candidates) {
      const existing = uniqueMap.get(candidate.id);
      if (!existing || (candidate.matchScore || 0) > (existing.matchScore || 0)) {
        uniqueMap.set(candidate.id, candidate);
      }
    }

    const unique = Array.from(uniqueMap.values());

    // 排序
    return unique.sort((a, b) => {
      // 1. matchScore（降序）
      const scoreA = a.matchScore || 0;
      const scoreB = b.matchScore || 0;
      if (Math.abs(scoreA - scoreB) > 0.1) {
        return scoreB - scoreA;
      }

      // 2. distanceM（升序，但只考虑在合理范围内的）
      const distA = a.distanceM || Infinity;
      const distB = b.distanceM || Infinity;
      if (distA < 2000 && distB < 2000 && Math.abs(distA - distB) > 100) {
        return distA - distB;
      }

      // 3. rating（降序）
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      return ratingB - ratingA;
    });
  }

  /**
   * 计算建议的置信度
   */
  private calculateConfidence(poi: PoiCandidate, ocrText: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const text = ocrText.toLowerCase();
    const poiName = poi.name.toLowerCase();

    // 文本匹配度高 → HIGH
    if (text.includes(poiName) || poiName.includes(text)) {
      return 'HIGH';
    }

    // 有评分且距离近 → MEDIUM
    if (poi.rating && poi.rating >= 4.0 && poi.distanceM && poi.distanceM < 500) {
      return 'MEDIUM';
    }

    // 其他 → LOW
    return 'LOW';
  }

  /**
   * 分析图像（场景识别、对象检测、天气识别）
   * 
   * 用于Phase 5: 多模态世界感知
   * 
   * @param image 图片 Buffer 或 URL
   * @param opts 选项（位置、语言等）
   * @returns 图像分析结果
   */
  async analyzeImage(
    image: Buffer | string,
    opts?: {
      lat?: number;
      lng?: number;
      locale?: string;
    }
  ): Promise<StandardResponse<{
    sceneType?: 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
    detectedObjects?: string[];
    weatherConditions?: 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY';
    crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    accessibility?: 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING';
    location?: {
      lat: number;
      lng: number;
      confidence: number;
    };
    confidence: number;
  }>> {
    const requestId = randomUUID();
    
    try {
      // 验证输入
      let imageBuffer: Buffer;
      if (typeof image === 'string') {
        // 如果是URL，需要下载图片（简化处理，实际应该使用HTTP客户端）
        this.logger.warn(`[${requestId}] URL image analysis not fully implemented, using OCR fallback`);
        // 暂时返回基础结果
        return successResponse({
          confidence: 0.3,
        });
      } else {
        imageBuffer = image;
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'image is required',
          { field: 'image' }
        );
      }

      this.logger.log(
        `[${requestId}] Analyzing image: size=${imageBuffer.length}, lat=${opts?.lat}, lng=${opts?.lng}`
      );

      const result: {
        sceneType?: 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
        detectedObjects?: string[];
        weatherConditions?: 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY';
        crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        accessibility?: 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING';
        location?: {
          lat: number;
          lng: number;
          confidence: number;
        };
        confidence: number;
      } = {
        confidence: 0.5,
      };

      // 1. OCR提取文字（用于场景推断）
      const useDeepSeekOcr =
        !!(this.configService?.get<string>('DEEPSEEK_OCR_API_KEY') ||
          this.configService?.get<string>('DEEPSEEK_API_KEY')) &&
        !!this.deepseekOcrProvider;
      const useGoogleOcr =
        !!this.configService?.get<string>('GOOGLE_VISION_API_KEY') &&
        !!this.googleOcrProvider;
      let ocrResult;
      try {
        const ocrProvider = useDeepSeekOcr
          ? this.deepseekOcrProvider!
          : useGoogleOcr
            ? this.googleOcrProvider!
            : this.mockOcrProvider;
        ocrResult = await ocrProvider.extractText(imageBuffer, {
          locale: opts?.locale || 'zh-CN',
        });
        
        // 基于OCR文本推断场景类型
        result.sceneType = this.inferSceneType(ocrResult.fullText);
        
        // 提取检测到的对象（从OCR文本中）
        result.detectedObjects = this.extractObjectsFromText(ocrResult.fullText);
        
        // 推断天气条件
        result.weatherConditions = this.inferWeatherFromText(ocrResult.fullText);
        
        // 推断人群密度
        result.crowdLevel = this.inferCrowdLevelFromText(ocrResult.fullText);
        
        // 推断可访问性
        result.accessibility = this.inferAccessibilityFromText(ocrResult.fullText);
        
        result.confidence = 0.6; // OCR分析置信度
      } catch (error: any) {
        this.logger.warn(`[${requestId}] OCR analysis failed: ${error.message}`);
      }

      // 2. 如果有位置信息，添加到结果中
      if (opts?.lat && opts?.lng) {
        result.location = {
          lat: opts.lat,
          lng: opts.lng,
          confidence: 0.9, // GPS位置置信度高
        };
      }

      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`[${requestId}] Image analysis error: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '图像分析时发生错误',
        { requestId }
      );
    }
  }

  /**
   * 从文本推断场景类型
   */
  private inferSceneType(text: string): 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION' {
    const lowerText = text.toLowerCase();
    
    // 自然风光关键词
    const naturalKeywords = ['山', '海', '湖', '森林', '瀑布', '峡谷', '冰川', '火山', '自然', '风景'];
    // 城市关键词
    const urbanKeywords = ['城市', '建筑', '街道', '广场', '购物', '商业', '都市'];
    // 文化关键词
    const culturalKeywords = ['博物馆', '教堂', '寺庙', '历史', '文化', '艺术', '古迹', '遗址'];
    // 冒险关键词
    const adventureKeywords = ['徒步', '登山', '攀岩', '漂流', '滑雪', '探险', '挑战', '难度'];
    // 休闲关键词
    const relaxationKeywords = ['海滩', '温泉', '度假', '休闲', '放松', 'spa', '按摩'];

    let naturalScore = 0;
    let urbanScore = 0;
    let culturalScore = 0;
    let adventureScore = 0;
    let relaxationScore = 0;

    for (const keyword of naturalKeywords) {
      if (lowerText.includes(keyword)) naturalScore++;
    }
    for (const keyword of urbanKeywords) {
      if (lowerText.includes(keyword)) urbanScore++;
    }
    for (const keyword of culturalKeywords) {
      if (lowerText.includes(keyword)) culturalScore++;
    }
    for (const keyword of adventureKeywords) {
      if (lowerText.includes(keyword)) adventureScore++;
    }
    for (const keyword of relaxationKeywords) {
      if (lowerText.includes(keyword)) relaxationScore++;
    }

    const scores = [
      { type: 'NATURAL' as const, score: naturalScore },
      { type: 'URBAN' as const, score: urbanScore },
      { type: 'CULTURAL' as const, score: culturalScore },
      { type: 'ADVENTURE' as const, score: adventureScore },
      { type: 'RELAXATION' as const, score: relaxationScore },
    ];

    scores.sort((a, b) => b.score - a.score);
    
    return scores[0].score > 0 ? scores[0].type : 'NATURAL'; // 默认自然
  }

  /**
   * 从文本提取检测到的对象
   */
  private extractObjectsFromText(text: string): string[] {
    const lowerText = text.toLowerCase();
    const objects: string[] = [];
    
    const commonObjects = [
      '人', '车', '船', '飞机', '建筑', '树', '花', '动物', '鸟', '鱼',
      '山', '海', '湖', '桥', '路', '标志', '广告', '菜单', '路牌',
    ];

    for (const obj of commonObjects) {
      if (lowerText.includes(obj)) {
        objects.push(obj);
      }
    }

    return objects;
  }

  /**
   * 从文本推断天气条件
   */
  private inferWeatherFromText(text: string): 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY' {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('雪') || lowerText.includes('snow')) {
      return 'SNOWY';
    }
    if (lowerText.includes('雨') || lowerText.includes('rain')) {
      return 'RAINY';
    }
    if (lowerText.includes('云') || lowerText.includes('cloud') || lowerText.includes('阴')) {
      return 'CLOUDY';
    }
    if (lowerText.includes('晴') || lowerText.includes('sun') || lowerText.includes('阳光')) {
      return 'SUNNY';
    }
    
    return 'SUNNY'; // 默认晴天
  }

  /**
   * 从文本推断人群密度
   */
  private inferCrowdLevelFromText(text: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('拥挤') || lowerText.includes('人多') || lowerText.includes('繁忙') || lowerText.includes('crowded')) {
      return 'HIGH';
    }
    if (lowerText.includes('适中') || lowerText.includes('一般') || lowerText.includes('moderate')) {
      return 'MEDIUM';
    }
    if (lowerText.includes('空旷') || lowerText.includes('人少') || lowerText.includes('安静') || lowerText.includes('quiet')) {
      return 'LOW';
    }
    
    return 'MEDIUM'; // 默认中等
  }

  /**
   * 从文本推断可访问性
   */
  private inferAccessibilityFromText(text: string): 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING' {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('困难') || lowerText.includes('难') || lowerText.includes('挑战') || lowerText.includes('challenging')) {
      return 'CHALLENGING';
    }
    if (lowerText.includes('中等') || lowerText.includes('适中') || lowerText.includes('moderate')) {
      return 'MODERATE';
    }
    if (lowerText.includes('容易') || lowerText.includes('简单') || lowerText.includes('accessible') || lowerText.includes('easy')) {
      return 'ACCESSIBLE';
    }
    
    return 'MODERATE'; // 默认中等
  }
}
