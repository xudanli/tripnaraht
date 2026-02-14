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
var DataArchitectureService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataArchitectureService = void 0;
const common_1 = require("@nestjs/common");
const data_quality_framework_service_1 = require("../../data-quality/services/data-quality-framework.service");
const data_conflict_resolution_service_1 = require("../../data-fusion/services/data-conflict-resolution.service");
let DataArchitectureService = DataArchitectureService_1 = class DataArchitectureService {
    constructor(dataQualityFramework, dataConflictResolution) {
        this.dataQualityFramework = dataQualityFramework;
        this.dataConflictResolution = dataConflictResolution;
        this.logger = new common_1.Logger(DataArchitectureService_1.name);
    }
    async executeDataFlow(sources, config) {
        const startTime = Date.now();
        const flowConfig = {
            enableQualityCheck: (config === null || config === void 0 ? void 0 : config.enableQualityCheck) !== false,
            enableFusion: (config === null || config === void 0 ? void 0 : config.enableFusion) !== false,
            enableFeatureEngineering: (config === null || config === void 0 ? void 0 : config.enableFeatureEngineering) !== false,
            qualityThreshold: (config === null || config === void 0 ? void 0 : config.qualityThreshold) || 0.7,
            fusionStrategy: (config === null || config === void 0 ? void 0 : config.fusionStrategy) || 'RELIABILITY_WEIGHTED',
            layerConfigs: (config === null || config === void 0 ? void 0 : config.layerConfigs) || {
                USER_INTERACTION: {},
                DECISION_SUPPORT: {},
                PROCESSING_FUSION: {},
                STORAGE_COLLECTION: {},
            },
        };
        this.logger.debug(`Executing data flow through 4 layers with ${sources.length} sources`);
        const errors = [];
        const layerTimes = {
            STORAGE_COLLECTION: 0,
            PROCESSING_FUSION: 0,
            DECISION_SUPPORT: 0,
            USER_INTERACTION: 0,
        };
        const qualityScores = {
            STORAGE_COLLECTION: 0,
            PROCESSING_FUSION: 0,
            DECISION_SUPPORT: 0,
            USER_INTERACTION: 0,
        };
        try {
            const layer1Start = Date.now();
            const rawData = await this.collectAndStore(sources, flowConfig.layerConfigs.STORAGE_COLLECTION);
            layerTimes.STORAGE_COLLECTION = Date.now() - layer1Start;
            qualityScores.STORAGE_COLLECTION = this.calculateLayerQuality(rawData);
            const layer2Start = Date.now();
            let processedData;
            if (flowConfig.enableFusion || flowConfig.enableFeatureEngineering) {
                processedData = await this.processAndFuse(rawData, flowConfig);
                layerTimes.PROCESSING_FUSION = Date.now() - layer2Start;
                qualityScores.PROCESSING_FUSION = processedData.quality.overallScore;
            }
            const layer3Start = Date.now();
            let decisionData;
            if (processedData) {
                decisionData = await this.prepareDecisionData(processedData, flowConfig.layerConfigs.DECISION_SUPPORT);
                layerTimes.DECISION_SUPPORT = Date.now() - layer3Start;
                qualityScores.DECISION_SUPPORT = this.calculateDecisionDataQuality(decisionData);
            }
            const layer4Start = Date.now();
            let uiData;
            if (decisionData) {
                uiData = await this.prepareUIData(decisionData, flowConfig.layerConfigs.USER_INTERACTION);
                layerTimes.USER_INTERACTION = Date.now() - layer4Start;
                qualityScores.USER_INTERACTION = uiData.metadata.dataQuality.overallScore;
            }
            const totalTime = Date.now() - startTime;
            return {
                rawData,
                processedData,
                decisionData,
                uiData,
                flowMetrics: {
                    totalTime,
                    layerTimes,
                    qualityScores,
                },
                errors: errors.length > 0 ? errors : undefined,
            };
        }
        catch (error) {
            this.logger.error(`Data flow execution failed: ${error.message}`, error.stack);
            errors.push({
                layer: 'PROCESSING_FUSION',
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            return {
                rawData: [],
                flowMetrics: {
                    totalTime: Date.now() - startTime,
                    layerTimes,
                    qualityScores,
                },
                errors,
            };
        }
    }
    async collectAndStore(sources, config) {
        this.logger.debug(`Layer 1: Collecting and storing data from ${sources.length} sources`);
        const rawData = sources.map(source => ({
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            data: source.data,
            timestamp: source.timestamp || new Date().toISOString(),
            metadata: {
                sourceType: this.inferSourceType(source.sourceId),
                reliability: 0.7,
                freshness: 1.0,
                format: this.inferDataFormat(source.data),
            },
        }));
        return rawData;
    }
    async processAndFuse(rawData, config) {
        var _a;
        this.logger.debug(`Layer 2: Processing and fusing ${rawData.length} raw data sources`);
        const dataSourceConfigs = rawData.map(rd => ({
            sourceId: rd.sourceId,
            sourceName: rd.sourceName,
            data: rd.data,
            reliability: rd.metadata.reliability,
            priority: 1,
            timestamp: rd.timestamp,
            sourceInfo: {
                sourceId: rd.sourceId,
                sourceName: rd.sourceName,
                sourceType: rd.metadata.sourceType === 'API' ? 'api' :
                    rd.metadata.sourceType === 'DATABASE' ? 'database' :
                        rd.metadata.sourceType === 'USER_INPUT' ? 'user_input' :
                            rd.metadata.sourceType === 'FILE' ? 'cache' :
                                'external',
                timestamp: rd.timestamp,
            },
        }));
        let fusedData;
        let fusionStrategy = config.fusionStrategy;
        let features = {};
        if (rawData.length > 1 && config.enableFusion) {
            const fusionResult = await this.dataConflictResolution.fuse(dataSourceConfigs, {
                defaultStrategy: fusionStrategy,
                enableConflictDetection: true,
            });
            fusedData = fusionResult.fusedData.value;
            fusionStrategy = fusionResult.fusedData.strategy;
        }
        else {
            fusedData = ((_a = rawData[0]) === null || _a === void 0 ? void 0 : _a.data) || {};
        }
        if (config.enableFeatureEngineering) {
            features = this.performFeatureEngineering(fusedData, rawData);
        }
        const qualityAssessment = await this.dataQualityFramework.assessOverallQuality(fusedData, {
            dataSources: rawData.map(rd => ({
                source: rd.sourceId,
                data: rd.data,
                timestamp: rd.timestamp,
            })),
            sourceInfo: Object.fromEntries(rawData.map(rd => [rd.sourceId, {
                    sourceId: rd.sourceId,
                    sourceName: rd.sourceName,
                    sourceType: rd.metadata.sourceType === 'API' ? 'api' :
                        rd.metadata.sourceType === 'DATABASE' ? 'database' :
                            rd.metadata.sourceType === 'USER_INPUT' ? 'user_input' :
                                rd.metadata.sourceType === 'FILE' ? 'cache' :
                                    'external',
                    timestamp: rd.timestamp,
                }])),
        });
        return {
            data: fusedData,
            features,
            quality: {
                completeness: qualityAssessment.completeness.currentValue,
                accuracy: qualityAssessment.accuracy.currentValue,
                consistency: qualityAssessment.consistency.currentValue,
                timeliness: qualityAssessment.timeliness.currentValue,
                traceability: qualityAssessment.traceability.currentValue,
                overallScore: qualityAssessment.overallScore,
            },
            metadata: {
                processedAt: new Date().toISOString(),
                processingSteps: [
                    { step: 'data_collection', method: 'collectAndStore' },
                    { step: 'data_fusion', method: fusionStrategy },
                    { step: 'feature_engineering', method: 'performFeatureEngineering' },
                    { step: 'quality_assessment', method: 'assessOverallQuality' },
                ],
                sourceData: rawData,
                fusionStrategy,
            },
        };
    }
    async prepareDecisionData(processedData, config) {
        this.logger.debug('Layer 3: Preparing decision support data');
        const context = {
            ...processedData.data,
            features: processedData.features,
            quality: processedData.quality,
        };
        const options = this.generateDecisionOptions(processedData);
        const recommendations = this.generateRecommendations(processedData);
        return {
            context,
            options,
            recommendations,
            metadata: {
                preparedAt: new Date().toISOString(),
                decisionContext: {
                    dataQuality: processedData.quality.overallScore,
                    dataSources: processedData.metadata.sourceData.map(sd => sd.sourceId),
                },
                dataSources: processedData.metadata.sourceData.map(sd => sd.sourceId),
            },
        };
    }
    async prepareUIData(decisionData, config) {
        this.logger.debug('Layer 4: Preparing UI data');
        const displayData = this.formatDisplayData(decisionData);
        const explanations = this.generateThreeLayerExplanations(decisionData);
        const interactions = this.generateInteractions(decisionData);
        const qualityLevel = this.determineQualityLevel(decisionData.metadata.decisionContext.dataQuality);
        return {
            displayData,
            explanations,
            interactions,
            metadata: {
                preparedAt: new Date().toISOString(),
                userContext: {},
                dataQuality: {
                    overallScore: decisionData.metadata.decisionContext.dataQuality,
                    qualityLevel,
                },
            },
        };
    }
    inferSourceType(sourceId) {
        if (sourceId.includes('api') || sourceId.includes('API'))
            return 'API';
        if (sourceId.includes('db') || sourceId.includes('database'))
            return 'DATABASE';
        if (sourceId.includes('file'))
            return 'FILE';
        if (sourceId.includes('stream'))
            return 'STREAM';
        if (sourceId.includes('user'))
            return 'USER_INPUT';
        return 'API';
    }
    inferDataFormat(data) {
        if (Array.isArray(data))
            return 'ARRAY';
        if (typeof data === 'object')
            return 'JSON';
        if (typeof data === 'string')
            return 'STRING';
        if (typeof data === 'number')
            return 'NUMBER';
        return 'UNKNOWN';
    }
    performFeatureEngineering(data, rawData) {
        const features = {};
        if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'number') {
                    features[`${key}_normalized`] = this.normalize(value);
                }
                else if (typeof value === 'string') {
                    features[`${key}_length`] = value.length;
                }
            }
        }
        features.dataSourceCount = rawData.length;
        features.avgReliability = rawData.reduce((sum, rd) => sum + rd.metadata.reliability, 0) / rawData.length;
        features.dataFreshness = rawData.map(rd => {
            const age = (Date.now() - new Date(rd.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            return Math.max(0, 1 - age / 30);
        }).reduce((sum, f) => sum + f, 0) / rawData.length;
        return features;
    }
    normalize(value) {
        return Math.max(0, Math.min(1, value / 100));
    }
    generateDecisionOptions(processedData) {
        const options = [];
        if (processedData.quality.overallScore >= 0.8) {
            options.push({
                id: 'high_quality',
                label: '高质量数据',
                data: processedData.data,
                quality: processedData.quality.overallScore,
            });
        }
        if (processedData.quality.overallScore >= 0.6) {
            options.push({
                id: 'medium_quality',
                label: '中等质量数据',
                data: processedData.data,
                quality: processedData.quality.overallScore,
            });
        }
        return options;
    }
    generateRecommendations(processedData) {
        const recommendations = [];
        if (processedData.quality.overallScore >= 0.9) {
            recommendations.push({
                type: 'RECOMMENDATION',
                content: '数据质量优秀，可以放心使用',
                confidence: 0.9,
                evidence: ['数据完整性高', '数据准确性高', '数据时效性好'],
            });
        }
        else if (processedData.quality.overallScore >= 0.7) {
            recommendations.push({
                type: 'RECOMMENDATION',
                content: '数据质量良好，建议使用',
                confidence: 0.7,
                evidence: ['数据质量基本达标'],
            });
        }
        else if (processedData.quality.overallScore < 0.5) {
            recommendations.push({
                type: 'WARNING',
                content: '数据质量不足，建议谨慎使用或补充数据',
                confidence: 0.8,
                evidence: ['数据质量低于阈值'],
            });
        }
        return recommendations;
    }
    formatDisplayData(decisionData) {
        return {
            context: decisionData.context,
            options: decisionData.options.map(opt => ({
                id: opt.id,
                label: opt.label,
                quality: opt.quality,
            })),
            recommendations: decisionData.recommendations.map(rec => ({
                type: rec.type,
                content: rec.content,
                confidence: rec.confidence,
            })),
        };
    }
    generateThreeLayerExplanations(decisionData) {
        const explanations = [];
        if (decisionData.recommendations.length > 0) {
            const mainRec = decisionData.recommendations[0];
            explanations.push({
                level: 'CONCLUSION',
                content: mainRec.content,
                confidence: mainRec.confidence,
            });
        }
        explanations.push({
            level: 'REASON',
            content: `基于 ${decisionData.options.length} 个数据选项的分析，数据质量得分为 ${decisionData.metadata.decisionContext.dataQuality.toFixed(2)}`,
        });
        explanations.push({
            level: 'EVIDENCE',
            content: `数据来源：${decisionData.metadata.dataSources.join('、')}`,
        });
        return explanations;
    }
    generateInteractions(decisionData) {
        const interactions = [];
        interactions.push({
            type: 'CONFIRMATION',
            label: '确认使用此数据',
        });
        if (decisionData.options.length > 1) {
            interactions.push({
                type: 'SELECTION',
                label: '选择数据选项',
                options: decisionData.options.map(opt => opt.label),
            });
        }
        interactions.push({
            type: 'FEEDBACK',
            label: '提供反馈',
        });
        return interactions;
    }
    determineQualityLevel(score) {
        if (score >= 0.9)
            return 'EXCELLENT';
        if (score >= 0.75)
            return 'GOOD';
        if (score >= 0.6)
            return 'FAIR';
        if (score >= 0.4)
            return 'POOR';
        return 'CRITICAL';
    }
    calculateLayerQuality(rawData) {
        if (rawData.length === 0)
            return 0;
        return rawData.reduce((sum, rd) => sum + rd.metadata.reliability, 0) / rawData.length;
    }
    calculateDecisionDataQuality(decisionData) {
        if (decisionData.recommendations.length === 0)
            return 0.5;
        const avgConfidence = decisionData.recommendations.reduce((sum, rec) => sum + rec.confidence, 0) / decisionData.recommendations.length;
        const avgOptionQuality = decisionData.options.length > 0
            ? decisionData.options.reduce((sum, opt) => sum + opt.quality, 0) / decisionData.options.length
            : 0.5;
        return (avgConfidence + avgOptionQuality) / 2;
    }
};
exports.DataArchitectureService = DataArchitectureService;
exports.DataArchitectureService = DataArchitectureService = DataArchitectureService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_quality_framework_service_1.DataQualityFrameworkService,
        data_conflict_resolution_service_1.DataConflictResolutionService])
], DataArchitectureService);
//# sourceMappingURL=data-architecture.service.js.map