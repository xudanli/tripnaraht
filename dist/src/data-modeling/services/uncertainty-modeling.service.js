"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UncertaintyModelingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UncertaintyModelingService = void 0;
const common_1 = require("@nestjs/common");
let UncertaintyModelingService = UncertaintyModelingService_1 = class UncertaintyModelingService {
    constructor() {
        this.logger = new common_1.Logger(UncertaintyModelingService_1.name);
    }
    createUncertaintyModel(sourceType, bestEstimate, historicalData, dataSource) {
        this.logger.log(`Creating uncertainty model for ${sourceType} with estimate ${bestEstimate}`);
        const { lowerBound, upperBound } = this.calculateBounds(bestEstimate, historicalData);
        const confidence = this.calculateConfidence(historicalData, dataSource);
        const uncertaintyLevel = this.determineUncertaintyLevel(lowerBound, upperBound, bestEstimate);
        const sourceInfo = dataSource || {
            type: this.mapSourceTypeToDataSourceType(sourceType),
            timestamp: new Date().toISOString(),
            reliability: this.mapUncertaintyLevelToReliability(uncertaintyLevel),
            source: 'API',
            sourceName: this.getSourceName(sourceType),
            confidence,
            verificationLevel: 'B_RELIABLE',
            isFactual: true,
        };
        return {
            sourceType,
            bestEstimate,
            lowerBound,
            upperBound,
            confidence,
            dataSource: sourceInfo,
            uncertaintyLevel,
            distributionType: this.inferDistributionType(sourceType, historicalData),
            distributionParams: this.calculateDistributionParams(bestEstimate, lowerBound, upperBound),
        };
    }
    analyzeScenarios(route, uncertainties) {
        this.logger.log(`Analyzing scenarios with ${uncertainties.length} uncertainties`);
        const baseCase = this.calculateBaseCase(route, uncertainties);
        const bestCase = this.calculateBestCase(route, uncertainties);
        const worstCase = this.calculateWorstCase(route, uncertainties);
        const upsidePotential = bestCase.risk - baseCase.risk;
        const downsideRisk = worstCase.risk - baseCase.risk;
        return {
            bestCase,
            baseCase,
            worstCase,
            upsidePotential,
            downsideRisk,
        };
    }
    presentUncertainty(uncertainty) {
        const confidencePercent = (uncertainty.confidence * 100).toFixed(0);
        const range = `${uncertainty.lowerBound}到${uncertainty.upperBound}`;
        const levelLabel = this.getUncertaintyLevelLabel(uncertainty.uncertaintyLevel);
        return {
            what: `这个数据的准确性有${confidencePercent}%的把握`,
            range: `实际值可能在${range}之间`,
            explanation: this.generateUncertaintyExplanation(uncertainty),
            visualization: this.generateUncertaintyVisualization(uncertainty),
            levelLabel,
            suggestion: this.generateSuggestion(uncertainty),
        };
    }
    calculateBounds(bestEstimate, historicalData) {
        if (!historicalData || historicalData.length === 0) {
            const defaultUncertainty = 0.2;
            return {
                lowerBound: bestEstimate * (1 - defaultUncertainty),
                upperBound: bestEstimate * (1 + defaultUncertainty),
            };
        }
        const sorted = [...historicalData].sort((a, b) => a - b);
        const lowerIndex = Math.floor(sorted.length * 0.05);
        const upperIndex = Math.ceil(sorted.length * 0.95) - 1;
        return {
            lowerBound: sorted[lowerIndex] || bestEstimate * 0.8,
            upperBound: sorted[upperIndex] || bestEstimate * 1.2,
        };
    }
    calculateConfidence(historicalData, dataSource) {
        let confidence = 0.5;
        if (historicalData && historicalData.length > 0) {
            const sampleSize = historicalData.length;
            confidence += Math.min(0.3, sampleSize / 100);
        }
        if (dataSource) {
            switch (dataSource.reliability) {
                case 'HIGH':
                    confidence += 0.2;
                    break;
                case 'MEDIUM':
                    confidence += 0.1;
                    break;
                case 'LOW':
                    confidence -= 0.1;
                    break;
            }
            switch (dataSource.verificationLevel) {
                case 'A_VERIFIED':
                    confidence += 0.15;
                    break;
                case 'B_RELIABLE':
                    confidence += 0.1;
                    break;
                case 'C_USER_FEEDBACK':
                    confidence += 0.05;
                    break;
                case 'D_PENDING':
                    confidence -= 0.1;
                    break;
                case 'E_LLM_GENERATED':
                    confidence -= 0.2;
                    break;
            }
        }
        return Math.max(0, Math.min(1, confidence));
    }
    determineUncertaintyLevel(lowerBound, upperBound, bestEstimate) {
        if (bestEstimate === 0) {
            return 'HIGH';
        }
        const range = upperBound - lowerBound;
        const relativeUncertainty = range / Math.abs(bestEstimate);
        if (relativeUncertainty < 0.1) {
            return 'LOW';
        }
        else if (relativeUncertainty < 0.3) {
            return 'MEDIUM';
        }
        else {
            return 'HIGH';
        }
    }
    inferDistributionType(sourceType, historicalData) {
        if (!historicalData || historicalData.length < 3) {
            return 'TRIANGULAR';
        }
        const mean = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
        const variance = historicalData.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
            historicalData.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev / mean < 0.2) {
            return 'NORMAL';
        }
        return 'TRIANGULAR';
    }
    calculateDistributionParams(bestEstimate, lowerBound, upperBound) {
        return {
            mode: bestEstimate,
            min: lowerBound,
            max: upperBound,
        };
    }
    calculateBaseCase(route, uncertainties) {
        const risk = this.calculateRisk(route, uncertainties, 'base');
        return {
            risk,
            feasibility: risk < 0.7,
            explanation: '基于当前最佳估计的风险评估',
        };
    }
    calculateBestCase(route, uncertainties) {
        const risk = this.calculateRisk(route, uncertainties, 'best');
        return {
            risk,
            feasibility: risk < 0.7,
            explanation: '最乐观情况下的风险评估（使用不确定性下界）',
        };
    }
    calculateWorstCase(route, uncertainties) {
        const risk = this.calculateRisk(route, uncertainties, 'worst');
        return {
            risk,
            feasibility: risk < 0.7,
            explanation: '最悲观情况下的风险评估（使用不确定性上界）',
        };
    }
    calculateRisk(route, uncertainties, scenario) {
        let totalRisk = 0;
        let weightSum = 0;
        uncertainties.forEach(uncertainty => {
            let value;
            switch (scenario) {
                case 'best':
                    value = uncertainty.lowerBound;
                    break;
                case 'worst':
                    value = uncertainty.upperBound;
                    break;
                default:
                    value = uncertainty.bestEstimate;
            }
            const riskContribution = this.calculateRiskContribution(uncertainty, value);
            const weight = 1 - uncertainty.confidence;
            totalRisk += riskContribution * weight;
            weightSum += weight;
        });
        return weightSum > 0 ? totalRisk / weightSum : 0.5;
    }
    calculateRiskContribution(uncertainty, value) {
        const levelMultiplier = {
            LOW: 0.3,
            MEDIUM: 0.5,
            HIGH: 0.8,
        };
        return levelMultiplier[uncertainty.uncertaintyLevel] * (1 - uncertainty.confidence);
    }
    generateUncertaintyExplanation(uncertainty) {
        const sourceName = uncertainty.dataSource.sourceName;
        const level = this.getUncertaintyLevelLabel(uncertainty.uncertaintyLevel);
        return `数据来源于${sourceName}，不确定性等级为${level}。实际值有${(uncertainty.confidence * 100).toFixed(0)}%的概率在${uncertainty.lowerBound}到${uncertainty.upperBound}之间。`;
    }
    generateUncertaintyVisualization(uncertainty) {
        return {
            type: 'DISTRIBUTION',
            data: {
                bestEstimate: uncertainty.bestEstimate,
                lowerBound: uncertainty.lowerBound,
                upperBound: uncertainty.upperBound,
                distributionType: uncertainty.distributionType,
                distributionParams: uncertainty.distributionParams,
            },
        };
    }
    generateSuggestion(uncertainty) {
        if (uncertainty.uncertaintyLevel === 'HIGH') {
            return '建议收集更多数据以提高准确性，或准备应对较大变化范围的方案。';
        }
        else if (uncertainty.uncertaintyLevel === 'MEDIUM') {
            return '数据有一定不确定性，建议准备备选方案。';
        }
        else {
            return '数据相对可靠，可以基于此进行决策。';
        }
    }
    getUncertaintyLevelLabel(level) {
        const labels = {
            LOW: '低',
            MEDIUM: '中',
            HIGH: '高',
        };
        return labels[level];
    }
    mapSourceTypeToDataSourceType(sourceType) {
        const mapping = {
            WEATHER: 'WEATHER',
            CROWD: 'POI',
            USER_CAPACITY: 'USER_INPUT',
            TRANSPORT: 'TRANSPORT',
            EXPERIENCE: 'POI',
            ROUTE_CONDITION: 'ROUTE',
            COST: 'POI',
            DURATION: 'TRANSPORT',
        };
        return mapping[sourceType] || 'OTHER';
    }
    mapUncertaintyLevelToReliability(level) {
        const mapping = {
            LOW: 'HIGH',
            MEDIUM: 'MEDIUM',
            HIGH: 'LOW',
        };
        return mapping[level];
    }
    getSourceName(sourceType) {
        const names = {
            WEATHER: '天气数据API',
            CROWD: '人流数据API',
            USER_CAPACITY: '用户能力评估',
            TRANSPORT: '交通数据API',
            EXPERIENCE: '体验数据API',
            ROUTE_CONDITION: '路线条件数据',
            COST: '成本数据API',
            DURATION: '时长数据API',
        };
        return names[sourceType] || '未知数据源';
    }
};
exports.UncertaintyModelingService = UncertaintyModelingService;
exports.UncertaintyModelingService = UncertaintyModelingService = UncertaintyModelingService_1 = __decorate([
    (0, common_1.Injectable)()
], UncertaintyModelingService);
//# sourceMappingURL=uncertainty-modeling.service.js.map