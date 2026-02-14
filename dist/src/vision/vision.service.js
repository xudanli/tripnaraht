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
    async analyzeImage(image, opts) {
        const requestId = (0, crypto_1.randomUUID)();
        try {
            let imageBuffer;
            if (typeof image === 'string') {
                this.logger.warn(`[${requestId}] URL image analysis not fully implemented, using OCR fallback`);
                return (0, standard_response_dto_1.successResponse)({
                    confidence: 0.3,
                });
            }
            else {
                imageBuffer = image;
            }
            if (!imageBuffer || imageBuffer.length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'image is required', { field: 'image' });
            }
            this.logger.log(`[${requestId}] Analyzing image: size=${imageBuffer.length}, lat=${opts === null || opts === void 0 ? void 0 : opts.lat}, lng=${opts === null || opts === void 0 ? void 0 : opts.lng}`);
            const result = {
                confidence: 0.5,
            };
            let ocrResult;
            try {
                ocrResult = await this.mockOcrProvider.extractText(imageBuffer, {
                    locale: (opts === null || opts === void 0 ? void 0 : opts.locale) || 'zh-CN',
                });
                result.sceneType = this.inferSceneType(ocrResult.fullText);
                result.detectedObjects = this.extractObjectsFromText(ocrResult.fullText);
                result.weatherConditions = this.inferWeatherFromText(ocrResult.fullText);
                result.crowdLevel = this.inferCrowdLevelFromText(ocrResult.fullText);
                result.accessibility = this.inferAccessibilityFromText(ocrResult.fullText);
                result.confidence = 0.6;
            }
            catch (error) {
                this.logger.warn(`[${requestId}] OCR analysis failed: ${error.message}`);
            }
            if ((opts === null || opts === void 0 ? void 0 : opts.lat) && (opts === null || opts === void 0 ? void 0 : opts.lng)) {
                result.location = {
                    lat: opts.lat,
                    lng: opts.lng,
                    confidence: 0.9,
                };
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`[${requestId}] Image analysis error: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '图像分析时发生错误', { requestId });
        }
    }
    inferSceneType(text) {
        const lowerText = text.toLowerCase();
        const naturalKeywords = ['山', '海', '湖', '森林', '瀑布', '峡谷', '冰川', '火山', '自然', '风景'];
        const urbanKeywords = ['城市', '建筑', '街道', '广场', '购物', '商业', '都市'];
        const culturalKeywords = ['博物馆', '教堂', '寺庙', '历史', '文化', '艺术', '古迹', '遗址'];
        const adventureKeywords = ['徒步', '登山', '攀岩', '漂流', '滑雪', '探险', '挑战', '难度'];
        const relaxationKeywords = ['海滩', '温泉', '度假', '休闲', '放松', 'spa', '按摩'];
        let naturalScore = 0;
        let urbanScore = 0;
        let culturalScore = 0;
        let adventureScore = 0;
        let relaxationScore = 0;
        for (const keyword of naturalKeywords) {
            if (lowerText.includes(keyword))
                naturalScore++;
        }
        for (const keyword of urbanKeywords) {
            if (lowerText.includes(keyword))
                urbanScore++;
        }
        for (const keyword of culturalKeywords) {
            if (lowerText.includes(keyword))
                culturalScore++;
        }
        for (const keyword of adventureKeywords) {
            if (lowerText.includes(keyword))
                adventureScore++;
        }
        for (const keyword of relaxationKeywords) {
            if (lowerText.includes(keyword))
                relaxationScore++;
        }
        const scores = [
            { type: 'NATURAL', score: naturalScore },
            { type: 'URBAN', score: urbanScore },
            { type: 'CULTURAL', score: culturalScore },
            { type: 'ADVENTURE', score: adventureScore },
            { type: 'RELAXATION', score: relaxationScore },
        ];
        scores.sort((a, b) => b.score - a.score);
        return scores[0].score > 0 ? scores[0].type : 'NATURAL';
    }
    extractObjectsFromText(text) {
        const lowerText = text.toLowerCase();
        const objects = [];
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
    inferWeatherFromText(text) {
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
        return 'SUNNY';
    }
    inferCrowdLevelFromText(text) {
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
        return 'MEDIUM';
    }
    inferAccessibilityFromText(text) {
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
        return 'MODERATE';
    }
};
exports.VisionService = VisionService;
exports.VisionService = VisionService = VisionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mock_ocr_provider_1.MockOcrProvider,
        mock_poi_provider_1.MockPoiProvider])
], VisionService);
//# sourceMappingURL=vision.service.js.map