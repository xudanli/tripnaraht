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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var HallucinationDetectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HallucinationDetectionService = void 0;
const common_1 = require("@nestjs/common");
const source_annotation_service_1 = require("../../data-quality/services/source-annotation.service");
let HallucinationDetectionService = HallucinationDetectionService_1 = class HallucinationDetectionService {
    constructor(sourceAnnotationService) {
        this.sourceAnnotationService = sourceAnnotationService;
        this.logger = new common_1.Logger(HallucinationDetectionService_1.name);
        this.MINIMUM_RELIABILITY_THRESHOLD = 0.7;
    }
    async detectHallucinations(output, context) {
        this.logger.log('Starting hallucination detection (Step 8)');
        const factualClaims = this.extractFactualClaims(output);
        const verifiedClaims = await this.verifySources(factualClaims);
        const annotatedClaims = await this.annotateConfidence(verifiedClaims);
        const hallucinationMarked = await this.markHallucinations(annotatedClaims);
        const userNotification = await this.generateUserNotification(hallucinationMarked);
        const cleanedOutput = this.removeHallucinations(output, hallucinationMarked);
        const statistics = {
            totalClaims: factualClaims.length,
            verifiedClaims: verifiedClaims.filter(c => c.verified).length,
            hallucinationRisks: hallucinationMarked.filter(c => c.isHallucinationRisk).length,
            removedClaims: hallucinationMarked.filter(c => c.action === 'REMOVE').length,
        };
        this.logger.log(`Hallucination detection completed: ${statistics.hallucinationRisks} risks found, ${statistics.removedClaims} claims removed`);
        return {
            verifiedClaims,
            hallucinationRisks: hallucinationMarked.filter(c => c.isHallucinationRisk),
            userNotification,
            cleanedOutput,
            statistics,
        };
    }
    extractFactualClaims(output) {
        const claims = [];
        if (typeof output === 'string') {
            const sentences = this.splitIntoSentences(output);
            sentences.forEach((sentence, index) => {
                const claimType = this.classifyClaimType(sentence);
                if (claimType === 'FACT') {
                    claims.push({
                        text: sentence,
                        type: claimType,
                        position: {
                            start: output.indexOf(sentence),
                            end: output.indexOf(sentence) + sentence.length,
                        },
                        entities: this.extractEntities(sentence),
                    });
                }
            });
        }
        else if (typeof output === 'object' && output !== null) {
            this.extractClaimsFromObject(output, claims);
        }
        return claims;
    }
    async verifySources(claims) {
        return Promise.all(claims.map(async (claim) => {
            const sources = await this.searchReliableSources(claim);
            if (!sources || sources.length === 0) {
                return {
                    ...claim,
                    verified: false,
                    source: null,
                    confidence: 0,
                    verifiedAt: new Date(),
                };
            }
            const freshSources = sources.filter(s => !this.isOutdated(s));
            const reliableSource = freshSources.find(s => (s.confidence || 0) >= this.MINIMUM_RELIABILITY_THRESHOLD);
            return {
                ...claim,
                verified: !!reliableSource,
                source: reliableSource || null,
                confidence: (reliableSource === null || reliableSource === void 0 ? void 0 : reliableSource.confidence) || 0,
                verifiedAt: new Date(),
            };
        }));
    }
    async annotateConfidence(claims) {
        return claims.map(claim => {
            let confidenceLevel;
            if (claim.confidence > 0.95) {
                confidenceLevel = 'HIGH';
            }
            else if (claim.confidence > 0.7) {
                confidenceLevel = 'MEDIUM';
            }
            else if (claim.confidence > 0) {
                confidenceLevel = 'LOW';
            }
            else {
                confidenceLevel = 'NONE';
            }
            return {
                ...claim,
                confidenceLevel,
            };
        });
    }
    async markHallucinations(claims) {
        return claims.map(claim => {
            const isHallucinationRisk = claim.confidenceLevel === 'NONE' ||
                (claim.confidenceLevel === 'LOW' && !claim.verified);
            let action;
            if (isHallucinationRisk && claim.confidenceLevel === 'NONE') {
                action = 'REMOVE';
            }
            else if (isHallucinationRisk) {
                action = 'FLAG';
            }
            else {
                action = 'KEEP';
            }
            return {
                ...claim,
                isHallucinationRisk,
                action,
            };
        });
    }
    async generateUserNotification(claims) {
        const hallucinationRisks = claims.filter(c => c.isHallucinationRisk);
        if (hallucinationRisks.length === 0) {
            return {
                hasRisks: false,
                message: null,
            };
        }
        const removedClaims = hallucinationRisks.filter(c => c.action === 'REMOVE');
        const flaggedClaims = hallucinationRisks.filter(c => c.action === 'FLAG');
        let message = '';
        if (removedClaims.length > 0) {
            message += `以下信息无法验证来源，已从输出中移除：${removedClaims.map(c => c.text).join('、')}`;
        }
        if (flaggedClaims.length > 0) {
            if (message)
                message += '。';
            message += `以下信息置信度较低，请谨慎参考：${flaggedClaims.map(c => c.text).join('、')}`;
        }
        const lowConfidenceItems = claims
            .filter(c => c.confidenceLevel === 'LOW')
            .map(c => {
            var _a;
            return ({
                text: c.text,
                confidence: c.confidence,
                source: (_a = c.source) === null || _a === void 0 ? void 0 : _a.sourceName,
            });
        });
        return {
            hasRisks: true,
            message,
            lowConfidenceItems,
        };
    }
    splitIntoSentences(text) {
        return text
            .split(/[。！？.!?]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }
    classifyClaimType(text) {
        const lowerText = text.toLowerCase();
        const factKeywords = ['是', '有', '位于', '距离', '开放时间', '价格', '评分'];
        if (factKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'FACT';
        }
        const speculationKeywords = ['可能', '也许', '大概', '估计', '预计'];
        if (speculationKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'SPECULATION';
        }
        const recommendationKeywords = ['建议', '推荐', '应该', '最好', '值得'];
        if (recommendationKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'RECOMMENDATION';
        }
        const opinionKeywords = ['认为', '觉得', '感觉', '喜欢'];
        if (opinionKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'OPINION';
        }
        return 'FACT';
    }
    extractEntities(text) {
        const entities = [];
        const numbers = text.match(/\d+/g);
        if (numbers) {
            entities.push(...numbers);
        }
        const properNouns = text.match(/\b[A-Z][a-z]+\b/g);
        if (properNouns) {
            entities.push(...properNouns);
        }
        return entities;
    }
    extractClaimsFromObject(obj, claims, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'string') {
                const claimType = this.classifyClaimType(value);
                if (claimType === 'FACT') {
                    claims.push({
                        text: value,
                        type: claimType,
                        entities: this.extractEntities(value),
                        metadata: { field: fullKey },
                    });
                }
            }
            else if (typeof value === 'object' && value !== null) {
                this.extractClaimsFromObject(value, claims, fullKey);
            }
        }
    }
    async searchReliableSources(claim) {
        if (this.sourceAnnotationService) {
            try {
                const annotated = await this.sourceAnnotationService.annotateField('claim', {
                    text: claim.text,
                    entities: claim.entities,
                });
                if (annotated.source) {
                    return [annotated.source];
                }
            }
            catch (error) {
                this.logger.warn(`Failed to annotate claim source: ${error}`);
            }
        }
        return [];
    }
    isOutdated(source) {
        if (!source.timestamp) {
            return true;
        }
        const timestamp = new Date(source.timestamp).getTime();
        const now = Date.now();
        const ageHours = (now - timestamp) / (1000 * 60 * 60);
        const maxAgeHours = {
            WEATHER: 3,
            CROWD: 1,
            TRANSPORT: 24,
            POI: 168,
            DEFAULT: 24,
        };
        const sourceType = source.type || 'DEFAULT';
        const maxAge = maxAgeHours[sourceType] || maxAgeHours.DEFAULT;
        return ageHours > maxAge;
    }
    removeHallucinations(output, markedClaims) {
        if (typeof output === 'string') {
            let cleaned = output;
            const toRemove = markedClaims.filter(c => c.action === 'REMOVE');
            toRemove
                .sort((a, b) => { var _a, _b; return (((_a = b.position) === null || _a === void 0 ? void 0 : _a.start) || 0) - (((_b = a.position) === null || _b === void 0 ? void 0 : _b.start) || 0); })
                .forEach(claim => {
                if (claim.position) {
                    cleaned =
                        cleaned.slice(0, claim.position.start) + cleaned.slice(claim.position.end);
                }
                else {
                    cleaned = cleaned.replace(claim.text, '');
                }
            });
            return cleaned.trim();
        }
        else if (typeof output === 'object' && output !== null) {
            const cleaned = { ...output };
            const toRemove = markedClaims.filter(c => c.action === 'REMOVE');
            toRemove.forEach(claim => {
                var _a;
                if ((_a = claim.metadata) === null || _a === void 0 ? void 0 : _a.field) {
                    const fieldPath = claim.metadata.field.split('.');
                    let current = cleaned;
                    for (let i = 0; i < fieldPath.length - 1; i++) {
                        current = current[fieldPath[i]];
                        if (!current)
                            return;
                    }
                    delete current[fieldPath[fieldPath.length - 1]];
                }
            });
            return cleaned;
        }
        return output;
    }
};
exports.HallucinationDetectionService = HallucinationDetectionService;
exports.HallucinationDetectionService = HallucinationDetectionService = HallucinationDetectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [source_annotation_service_1.SourceAnnotationService])
], HallucinationDetectionService);
//# sourceMappingURL=hallucination-detection.service.js.map