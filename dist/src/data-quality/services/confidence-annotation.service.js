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
var ConfidenceAnnotationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceAnnotationService = void 0;
const common_1 = require("@nestjs/common");
const source_annotation_service_1 = require("./source-annotation.service");
let ConfidenceAnnotationService = ConfidenceAnnotationService_1 = class ConfidenceAnnotationService {
    constructor(sourceAnnotationService) {
        this.sourceAnnotationService = sourceAnnotationService;
        this.logger = new common_1.Logger(ConfidenceAnnotationService_1.name);
        this.confidenceLevelDefinitions = {
            A: {
                level: 'A',
                name: '高可信度',
                confidenceRange: { min: 0.9, max: 1.0 },
                description: '信息高度可信，来自多个独立可靠来源，已充分验证',
                usageGuidance: '可以直接使用，无需额外验证',
            },
            B: {
                level: 'B',
                name: '可信',
                confidenceRange: { min: 0.7, max: 0.9 },
                description: '信息可信，来自官方或权威渠道，基本可靠',
                usageGuidance: '可以使用，但建议关注数据时效性',
            },
            C: {
                level: 'C',
                name: '中等可信度',
                confidenceRange: { min: 0.5, max: 0.7 },
                description: '信息中等可信，可能来自用户反馈或单一来源',
                usageGuidance: '谨慎使用，建议交叉验证',
            },
            D: {
                level: 'D',
                name: '低可信度',
                confidenceRange: { min: 0.0, max: 0.5 },
                description: '信息可信度较低，可能缺失、过期或未经验证',
                usageGuidance: '不建议直接使用，需要进一步验证',
            },
        };
    }
    async annotateAllWithConfidence(data, config) {
        this.logger.log('Starting confidence annotation for all information');
        const defaultConfig = {
            showLowConfidence: true,
            showLLMGenerated: false,
            minConfidenceThreshold: 0.0,
            requireSourceVerification: false,
            ...config,
        };
        const sourceAnnotationResult = await this.sourceAnnotationService.annotateAllInformation(data);
        const annotatedData = {};
        const statistics = {
            totalFields: 0,
            annotatedFields: 0,
            levelA: 0,
            levelB: 0,
            levelC: 0,
            levelD: 0,
            uncertainFields: 0,
            llmGeneratedFields: 0,
        };
        const confidenceScores = [];
        for (const [key, sourceAnnotated] of Object.entries(sourceAnnotationResult.annotatedData)) {
            statistics.totalFields++;
            try {
                const confidenceAnnotated = await this.enhanceWithConfidence(key, sourceAnnotated, defaultConfig);
                annotatedData[key] = confidenceAnnotated;
                statistics.annotatedFields++;
                const level = confidenceAnnotated.confidence.confidenceLevel;
                statistics[`level${level}`]++;
                if (confidenceAnnotated.confidence.uncertainty) {
                    statistics.uncertainFields++;
                }
                if (sourceAnnotated.source.verificationLevel === 'E_LLM_GENERATED') {
                    statistics.llmGeneratedFields++;
                }
                confidenceScores.push(confidenceAnnotated.confidence.confidenceScore);
            }
            catch (error) {
                this.logger.warn(`Failed to annotate confidence for field ${key}:`, error);
            }
        }
        const averageScore = confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0;
        const averageLevel = this.scoreToConfidenceLevel(averageScore);
        const lowestLevel = this.findLowestConfidenceLevel(annotatedData);
        this.logger.log(`Confidence annotation completed: ${statistics.annotatedFields}/${statistics.totalFields} fields annotated`);
        return {
            annotatedData,
            statistics,
            overallConfidence: {
                averageScore,
                averageLevel,
                lowestLevel,
            },
            annotatedAt: new Date(),
        };
    }
    async enhanceWithConfidence(fieldName, sourceAnnotated, config) {
        const source = sourceAnnotated.source;
        const confidenceScore = source.confidence;
        const confidenceLevel = this.scoreToConfidenceLevel(confidenceScore);
        const uncertainty = await this.detectUncertainty(fieldName, sourceAnnotated, confidenceScore);
        const confidenceReason = this.generateConfidenceReason(source, confidenceLevel, uncertainty);
        const userFriendlyDescription = this.generateUserFriendlyDescription(confidenceLevel, source, uncertainty);
        const enhancedConfidence = {
            confidenceLevel,
            confidenceScore,
            source,
            verificationLevel: source.verificationLevel,
            uncertainty,
            confidenceReason,
            userFriendlyDescription,
        };
        const shouldDisplay = this.shouldDisplayToUser(enhancedConfidence, config);
        const displaySuggestion = this.generateDisplaySuggestion(enhancedConfidence, config);
        return {
            value: sourceAnnotated.value,
            fieldName,
            confidence: enhancedConfidence,
            shouldDisplay,
            displaySuggestion,
        };
    }
    async detectUncertainty(fieldName, sourceAnnotated, confidenceScore) {
        const source = sourceAnnotated.source;
        if (source.verificationLevel === 'E_LLM_GENERATED') {
            return {
                type: 'LLM_GENERATED',
                degree: 0.7,
                reason: '此信息由AI生成，未经验证',
                impact: ['准确性不确定', '可能需要人工验证'],
                mitigation: ['建议交叉验证', '查看原始数据源'],
            };
        }
        if (sourceAnnotated.value === null || sourceAnnotated.value === undefined) {
            return {
                type: 'MISSING_DATA',
                degree: 1.0,
                reason: '数据缺失',
                impact: ['无法提供准确信息'],
                mitigation: ['尝试从其他来源获取', '使用估算值'],
            };
        }
        if (source.expiry) {
            const expiryTime = new Date(source.expiry).getTime();
            const now = Date.now();
            if (expiryTime < now) {
                const daysSinceExpiry = (now - expiryTime) / (1000 * 60 * 60 * 24);
                return {
                    type: 'OUTDATED_DATA',
                    degree: Math.min(1.0, daysSinceExpiry / 30),
                    reason: `数据已过期${Math.round(daysSinceExpiry)}天`,
                    impact: ['信息可能已过时', '准确性可能下降'],
                    mitigation: ['更新数据源', '验证当前状态'],
                };
            }
        }
        if (source.source === 'ESTIMATED' || source.type === 'ESTIMATED') {
            return {
                type: 'ESTIMATED_VALUE',
                degree: 0.6,
                reason: '此值为估算值，非实际测量',
                impact: ['可能存在误差'],
                mitigation: ['使用实际测量值', '了解估算方法'],
            };
        }
        if (confidenceScore < 0.5) {
            return {
                type: 'LOW_CONFIDENCE',
                degree: 1.0 - confidenceScore,
                reason: `置信度较低（${Math.round(confidenceScore * 100)}%）`,
                impact: ['信息可靠性较低'],
                mitigation: ['寻找更多来源', '交叉验证'],
            };
        }
        if (source.verificationLevel === 'D_PENDING') {
            return {
                type: 'PARTIAL_VERIFICATION',
                degree: 0.5,
                reason: '信息待验证',
                impact: ['未完全验证'],
                mitigation: ['等待验证完成', '使用已验证的替代信息'],
            };
        }
        return undefined;
    }
    scoreToConfidenceLevel(score) {
        if (score >= 0.9)
            return 'A';
        if (score >= 0.7)
            return 'B';
        if (score >= 0.5)
            return 'C';
        return 'D';
    }
    findLowestConfidenceLevel(annotatedData) {
        const levels = Object.values(annotatedData).map(d => d.confidence.confidenceLevel);
        if (levels.includes('D'))
            return 'D';
        if (levels.includes('C'))
            return 'C';
        if (levels.includes('B'))
            return 'B';
        return 'A';
    }
    generateConfidenceReason(source, level, uncertainty) {
        const reasons = [];
        const verificationReasonMap = {
            A_VERIFIED: '已通过多个独立来源验证',
            B_RELIABLE: '来自官方或权威渠道',
            C_USER_FEEDBACK: '基于用户反馈',
            D_PENDING: '待验证',
            E_LLM_GENERATED: '由AI生成',
        };
        reasons.push(verificationReasonMap[source.verificationLevel]);
        if (source.reliability === 'HIGH') {
            reasons.push('数据源可靠性高');
        }
        else if (source.reliability === 'LOW') {
            reasons.push('数据源可靠性较低');
        }
        if (source.crossValidationCount && source.crossValidationCount > 1) {
            reasons.push(`已通过${source.crossValidationCount}个来源交叉验证`);
        }
        if (uncertainty) {
            reasons.push(`存在不确定性：${uncertainty.reason}`);
        }
        return reasons.join('；');
    }
    generateUserFriendlyDescription(level, source, uncertainty) {
        const definition = this.confidenceLevelDefinitions[level];
        let description = `${definition.name}（${definition.description}）`;
        if (source.sourceName) {
            description += `，来源：${source.sourceName}`;
        }
        if (uncertainty) {
            description += `。注意：${uncertainty.reason}`;
        }
        return description;
    }
    shouldDisplayToUser(confidence, config) {
        if (confidence.confidenceScore < config.minConfidenceThreshold) {
            return false;
        }
        if (confidence.source.verificationLevel === 'E_LLM_GENERATED' &&
            !config.showLLMGenerated) {
            return false;
        }
        if (confidence.confidenceLevel === 'D' && !config.showLowConfidence) {
            return false;
        }
        if (config.requireSourceVerification &&
            confidence.verificationLevel === 'D_PENDING') {
            return false;
        }
        return true;
    }
    generateDisplaySuggestion(confidence, config) {
        const suggestion = {
            showConfidence: true,
            showSource: true,
            showUncertainty: !!confidence.uncertainty,
        };
        if (confidence.confidenceLevel === 'D' || confidence.confidenceScore < 0.5) {
            suggestion.warningMessage = `此信息置信度较低（${confidence.confidenceLevel}级），请谨慎使用`;
        }
        if (confidence.uncertainty) {
            suggestion.warningMessage = confidence.uncertainty.reason;
        }
        return suggestion;
    }
    getConfidenceLevelDefinition(level) {
        return this.confidenceLevelDefinitions[level];
    }
    getAllConfidenceLevelDefinitions() {
        return this.confidenceLevelDefinitions;
    }
    formatConfidenceAnnotation(confidence) {
        const emojiMap = {
            A: '🟢',
            B: '🟡',
            C: '🟠',
            D: '🔴',
        };
        const definition = this.confidenceLevelDefinitions[confidence.confidenceLevel];
        const emoji = emojiMap[confidence.confidenceLevel];
        let formatted = `${emoji} **${confidence.confidenceLevel}级（${definition.name}）**\n`;
        formatted += `置信度：${Math.round(confidence.confidenceScore * 100)}%\n`;
        formatted += `来源：${confidence.source.sourceName}\n`;
        formatted += `说明：${confidence.userFriendlyDescription}\n`;
        if (confidence.uncertainty) {
            formatted += `\n⚠️ **不确定性**：${confidence.uncertainty.reason}\n`;
            if (confidence.uncertainty.mitigation && confidence.uncertainty.mitigation.length > 0) {
                formatted += `缓解措施：${confidence.uncertainty.mitigation.join('、')}\n`;
            }
        }
        return formatted;
    }
};
exports.ConfidenceAnnotationService = ConfidenceAnnotationService;
exports.ConfidenceAnnotationService = ConfidenceAnnotationService = ConfidenceAnnotationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [source_annotation_service_1.SourceAnnotationService])
], ConfidenceAnnotationService);
//# sourceMappingURL=confidence-annotation.service.js.map