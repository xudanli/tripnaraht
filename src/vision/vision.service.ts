// src/vision/vision.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { AssistantSuggestion, PoiCandidate } from '../assist/dto/action.dto';
import { MockOcrProvider } from '../providers/ocr/mock-ocr.provider';
import { MockPoiProvider } from '../providers/poi/mock-poi.provider';
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
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly keywordExtractor = new KeywordExtractor();

  constructor(
    // 暂时使用 Mock Provider，后续可替换为真实实现
    private readonly mockOcrProvider: MockOcrProvider,
    private readonly mockPoiProvider: MockPoiProvider
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

      this.logger.log(
        `[${requestId}] Processing image: size=${image.length}, lat=${opts.lat}, lng=${opts.lng}`
      );

      // 步骤 1: OCR 提取文字
      let ocrResult;
      try {
        ocrResult = await this.mockOcrProvider.extractText(image, {
          locale: opts.locale || 'zh-CN',
        });
      } catch (error: any) {
        this.logger.error(`[${requestId}] OCR error: ${error.message}`, error.stack);
        return errorResponse(
          ErrorCode.PROVIDER_ERROR,
          'OCR 提取文字失败',
          { provider: 'MockOcrProvider', originalError: error.message }
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

      // 步骤 3: POI 搜索（尝试多个候选名称）
      const allCandidates: PoiCandidate[] = [];
      try {
        for (const name of candidateNames) {
          if (name.trim().length > 0) {
            const results = await this.mockPoiProvider.textSearch({
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
          { provider: 'MockPoiProvider', originalError: error.message }
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
}
