"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var VisionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisionService = void 0;
const common_1 = require("@nestjs/common");
const mock_ocr_provider_1 = require("../providers/ocr/mock-ocr.provider");
const mock_poi_provider_1 = require("../providers/poi/mock-poi.provider");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const suggestion_id_util_1 = require("../common/utils/suggestion-id.util");
const crypto_1 = require("crypto");
const keyword_extractor_util_1 = require("./utils/keyword-extractor.util");
let VisionService = VisionService_1 = class VisionService {
    constructor(mockOcrProvider, mockPoiProvider) {
        this.mockOcrProvider = mockOcrProvider;
        this.mockPoiProvider = mockPoiProvider;
        this.logger = new common_1.Logger(VisionService_1.name);
        this.keywordExtractor = new keyword_extractor_util_1.KeywordExtractor();
    }
    async poiRecommend(image, opts) {
        const requestId = (0, crypto_1.randomUUID)();
        try {
            if (!image || image.length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'image is required', { field: 'image' });
            }
            if (isNaN(opts.lat) || isNaN(opts.lng)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'lat and lng must be valid numbers', { field: 'lat/lng', lat: opts.lat, lng: opts.lng });
            }
            this.logger.log(`[${requestId}] Processing image: size=${image.length}, lat=${opts.lat}, lng=${opts.lng}`);
            let ocrResult;
            try {
                ocrResult = await this.mockOcrProvider.extractText(image, {
                    locale: opts.locale || 'zh-CN',
                });
            }
            catch (error) {
                this.logger.error(`[${requestId}] OCR error: ${error.message}`, error.stack);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.PROVIDER_ERROR, 'OCR 提取文字失败', { provider: 'MockOcrProvider', originalError: error.message });
            }
            const candidateNames = this.keywordExtractor.extractCandidateNames(ocrResult.lines, 5);
            if (candidateNames.length === 0) {
                this.logger.warn(`[${requestId}] No candidate names extracted from OCR text`);
                return (0, standard_response_dto_1.successResponse)({
                    ocrResult: {
                        fullText: ocrResult.fullText,
                        lines: ocrResult.lines,
                    },
                    candidates: [],
                    suggestions: [],
                });
            }
            const allCandidates = [];
            try {
                for (const name of candidateNames) {
                    if (name.trim().length > 0) {
                        const results = await this.mockPoiProvider.textSearch({
                            query: name,
                            lat: opts.lat,
                            lng: opts.lng,
                            radiusM: 1000,
                            language: opts.locale || 'zh-CN',
                        });
                        allCandidates.push(...results);
                    }
                }
            }
            catch (error) {
                this.logger.error(`[${requestId}] POI search error: ${error.message}`, error.stack);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.PROVIDER_ERROR, 'POI 搜索失败', { provider: 'MockPoiProvider', originalError: error.message });
            }
            const uniqueCandidates = this.deduplicateAndSortCandidates(allCandidates);
            const suggestions = uniqueCandidates.slice(0, 5).map((poi) => {
                const suggestionId = (0, suggestion_id_util_1.generateVisionSuggestionId)(poi.id, ocrResult.fullText);
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
            this.logger.log(`[${requestId}] Completed: candidates=${uniqueCandidates.length}, suggestions=${suggestions.length}`);
            return (0, standard_response_dto_1.successResponse)({
                ocrResult: {
                    fullText: ocrResult.fullText,
                    lines: ocrResult.lines,
                },
                candidates: uniqueCandidates.slice(0, 10),
                suggestions,
            });
        }
        catch (error) {
            this.logger.error(`[${requestId}] Unexpected error: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '处理图片时发生错误', { requestId });
        }
    }
    async extractText(image, opts) {
        const requestId = (0, crypto_1.randomUUID)();
        try {
            if (!image || image.length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'image is required', { field: 'image' });
            }
            this.logger.log(`[${requestId}] Extracting text from image: size=${image.length}`);
            let ocrResult;
            try {
                ocrResult = await this.mockOcrProvider.extractText(image, {
                    locale: (opts === null || opts === void 0 ? void 0 : opts.locale) || 'zh-CN',
                });
            }
            catch (error) {
                this.logger.error(`[${requestId}] OCR error: ${error.message}`, error.stack);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.PROVIDER_ERROR, 'OCR 提取文字失败', { provider: 'MockOcrProvider', originalError: error.message });
            }
            this.logger.log(`[${requestId}] OCR completed: lines=${ocrResult.lines.length}`);
            return (0, standard_response_dto_1.successResponse)({
                fullText: ocrResult.fullText,
                lines: ocrResult.lines,
            });
        }
        catch (error) {
            this.logger.error(`[${requestId}] Unexpected error: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '提取文字时发生错误', { requestId });
        }
    }
    deduplicateAndSortCandidates(candidates) {
        const uniqueMap = new Map();
        for (const candidate of candidates) {
            const existing = uniqueMap.get(candidate.id);
            if (!existing || (candidate.matchScore || 0) > (existing.matchScore || 0)) {
                uniqueMap.set(candidate.id, candidate);
            }
        }
        const unique = Array.from(uniqueMap.values());
        return unique.sort((a, b) => {
            const scoreA = a.matchScore || 0;
            const scoreB = b.matchScore || 0;
            if (Math.abs(scoreA - scoreB) > 0.1) {
                return scoreB - scoreA;
            }
            const distA = a.distanceM || Infinity;
            const distB = b.distanceM || Infinity;
            if (distA < 2000 && distB < 2000 && Math.abs(distA - distB) > 100) {
                return distA - distB;
            }
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            return ratingB - ratingA;
        });
    }
    calculateConfidence(poi, ocrText) {
        const text = ocrText.toLowerCase();
        const poiName = poi.name.toLowerCase();
        if (text.includes(poiName) || poiName.includes(text)) {
            return 'HIGH';
        }
        if (poi.rating && poi.rating >= 4.0 && poi.distanceM && poi.distanceM < 500) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
};
exports.VisionService = VisionService;
exports.VisionService = VisionService = VisionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mock_ocr_provider_1.MockOcrProvider,
        mock_poi_provider_1.MockPoiProvider])
], VisionService);
//# sourceMappingURL=vision.service.js.map