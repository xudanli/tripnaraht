"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SourceAnnotationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceAnnotationService = void 0;
const common_1 = require("@nestjs/common");
let SourceAnnotationService = SourceAnnotationService_1 = class SourceAnnotationService {
    constructor() {
        this.logger = new common_1.Logger(SourceAnnotationService_1.name);
    }
    async annotateAllInformation(data) {
        this.logger.log('Starting source annotation for all information');
        const annotatedData = {};
        const statistics = {
            totalFields: 0,
            annotatedFields: 0,
            verifiedFields: 0,
            llmGeneratedFields: 0,
            pendingFields: 0,
        };
        for (const [key, value] of Object.entries(data)) {
            statistics.totalFields++;
            try {
                const annotated = await this.annotateField(key, value);
                annotatedData[key] = annotated;
                statistics.annotatedFields++;
                if (annotated.source.verificationLevel === 'A_VERIFIED') {
                    statistics.verifiedFields++;
                }
                else if (annotated.source.verificationLevel === 'E_LLM_GENERATED') {
                    statistics.llmGeneratedFields++;
                }
                else if (annotated.source.verificationLevel === 'D_PENDING') {
                    statistics.pendingFields++;
                }
            }
            catch (error) {
                this.logger.warn(`Failed to annotate field ${key}:`, error);
            }
        }
        this.logger.log(`Source annotation completed: ${statistics.annotatedFields}/${statistics.totalFields} fields annotated`);
        return {
            annotatedData,
            statistics,
            annotatedAt: new Date(),
        };
    }
    async annotateField(fieldName, value) {
        const source = await this.inferSource(fieldName, value);
        const confidence = await this.calculateConfidence(fieldName, value, source);
        const verificationLevel = await this.determineVerificationLevel(fieldName, value, source, confidence);
        const isFactual = this.isFactualInformation(fieldName, value, source);
        const extendedSource = {
            ...source,
            confidence,
            verificationLevel,
            isFactual,
            lastVerifiedAt: new Date().toISOString(),
        };
        return {
            value,
            fieldName,
            source: extendedSource,
        };
    }
    async inferSource(fieldName, value) {
        const lowerFieldName = fieldName.toLowerCase();
        if (lowerFieldName.includes('elevation') || lowerFieldName.includes('slope') || lowerFieldName.includes('dem')) {
            return {
                type: 'DEM',
                timestamp: new Date().toISOString(),
                reliability: 'HIGH',
                source: 'API',
                sourceName: 'DEM地形数据API',
                sourceUrl: 'https://api.dem.example.com',
                crossValidationCount: 1,
            };
        }
        if (lowerFieldName.includes('transport') || lowerFieldName.includes('route') || lowerFieldName.includes('transit')) {
            return {
                type: 'TRANSPORT',
                timestamp: new Date().toISOString(),
                reliability: 'HIGH',
                source: 'API',
                sourceName: '交通路线API',
                sourceUrl: 'https://api.transport.example.com',
                crossValidationCount: 1,
            };
        }
        if (lowerFieldName.includes('poi') || lowerFieldName.includes('place') || lowerFieldName.includes('attraction')) {
            return {
                type: 'POI',
                timestamp: new Date().toISOString(),
                reliability: 'MEDIUM',
                source: 'API',
                sourceName: 'POI数据API',
                sourceUrl: 'https://api.poi.example.com',
                crossValidationCount: 1,
            };
        }
        if (lowerFieldName.includes('weather') || lowerFieldName.includes('temperature') || lowerFieldName.includes('precipitation')) {
            return {
                type: 'WEATHER',
                timestamp: new Date().toISOString(),
                expiry: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
                reliability: 'HIGH',
                source: 'API',
                sourceName: '中央气象台',
                sourceUrl: 'https://api.weather.example.com',
                crossValidationCount: 1,
            };
        }
        if (lowerFieldName.includes('opening') || lowerFieldName.includes('hours') || lowerFieldName.includes('schedule')) {
            return {
                type: 'OPENING_HOURS',
                timestamp: new Date().toISOString(),
                reliability: 'MEDIUM',
                source: 'API',
                sourceName: 'POI开放时间API',
                sourceUrl: 'https://api.opening-hours.example.com',
                crossValidationCount: 1,
            };
        }
        if (lowerFieldName.includes('user') || lowerFieldName.includes('input') || lowerFieldName.includes('preference')) {
            return {
                type: 'USER_INPUT',
                timestamp: new Date().toISOString(),
                reliability: 'HIGH',
                source: 'USER_INPUT',
                sourceName: '用户输入',
                crossValidationCount: 0,
            };
        }
        if (value && typeof value === 'object' && '_llmGenerated' in value) {
            return {
                type: 'LLM_GENERATED',
                timestamp: new Date().toISOString(),
                reliability: 'LOW',
                source: 'LLM_GENERATED',
                sourceName: 'LLM生成内容',
                crossValidationCount: 0,
            };
        }
        if (lowerFieldName.includes('estimated') || lowerFieldName.includes('estimate') || lowerFieldName.includes('approx')) {
            return {
                type: 'ESTIMATED',
                timestamp: new Date().toISOString(),
                reliability: 'LOW',
                source: 'ESTIMATED',
                sourceName: '系统估算',
                crossValidationCount: 0,
            };
        }
        if (lowerFieldName.includes('default') || value === null || value === undefined) {
            return {
                type: 'DEFAULT',
                timestamp: new Date().toISOString(),
                reliability: 'LOW',
                source: 'DEFAULT',
                sourceName: '系统默认值',
                crossValidationCount: 0,
            };
        }
        return {
            type: 'OTHER',
            timestamp: new Date().toISOString(),
            reliability: 'MEDIUM',
            source: 'DATABASE',
            sourceName: '数据库',
            crossValidationCount: 0,
        };
    }
    async calculateConfidence(fieldName, value, source) {
        let confidence = 0.5;
        switch (source.reliability) {
            case 'HIGH':
                confidence += 0.3;
                break;
            case 'MEDIUM':
                confidence += 0.1;
                break;
            case 'LOW':
                confidence -= 0.2;
                break;
        }
        switch (source.source) {
            case 'API':
                confidence += 0.2;
                break;
            case 'DATABASE':
                confidence += 0.1;
                break;
            case 'CACHE':
                confidence += 0.05;
                break;
            case 'USER_INPUT':
                confidence += 0.15;
                break;
            case 'ESTIMATED':
                confidence -= 0.2;
                break;
            case 'DEFAULT':
                confidence -= 0.3;
                break;
            case 'LLM_GENERATED':
                confidence -= 0.4;
                break;
        }
        if (source.crossValidationCount && source.crossValidationCount > 0) {
            confidence += Math.min(0.2, source.crossValidationCount * 0.05);
        }
        if (source.expiry) {
            const expiryTime = new Date(source.expiry).getTime();
            const now = Date.now();
            const timeUntilExpiry = expiryTime - now;
            if (timeUntilExpiry > 0) {
                confidence += 0.1;
            }
            else {
                confidence -= 0.2;
            }
        }
        return Math.max(0, Math.min(1, confidence));
    }
    async determineVerificationLevel(fieldName, value, source, confidence) {
        if (source.source === 'LLM_GENERATED' || source.type === 'LLM_GENERATED') {
            return 'E_LLM_GENERATED';
        }
        if (source.crossValidationCount && source.crossValidationCount >= 2 && confidence > 0.9) {
            return 'A_VERIFIED';
        }
        if ((source.reliability === 'HIGH' && source.source === 'API') ||
            (confidence > 0.7 && source.reliability === 'HIGH')) {
            return 'B_RELIABLE';
        }
        if (source.source === 'USER_INPUT') {
            return 'C_USER_FEEDBACK';
        }
        return 'D_PENDING';
    }
    isFactualInformation(fieldName, value, source) {
        if (source.source === 'LLM_GENERATED' || source.type === 'LLM_GENERATED') {
            return false;
        }
        if (source.source === 'ESTIMATED' || source.source === 'DEFAULT') {
            return false;
        }
        return true;
    }
    markAsLLMGenerated(data) {
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            return {
                ...data,
                _llmGenerated: true,
                _llmGeneratedAt: new Date().toISOString(),
            };
        }
        return data;
    }
    isLLMGenerated(data) {
        return data && typeof data === 'object' && '_llmGenerated' in data;
    }
};
exports.SourceAnnotationService = SourceAnnotationService;
exports.SourceAnnotationService = SourceAnnotationService = SourceAnnotationService_1 = __decorate([
    (0, common_1.Injectable)()
], SourceAnnotationService);
//# sourceMappingURL=source-annotation.service.js.map