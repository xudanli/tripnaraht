"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FeatureQualityAssessmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureQualityAssessmentService = void 0;
const common_1 = require("@nestjs/common");
let FeatureQualityAssessmentService = FeatureQualityAssessmentService_1 = class FeatureQualityAssessmentService {
    constructor() {
        this.logger = new common_1.Logger(FeatureQualityAssessmentService_1.name);
        this.assessmentCache = new Map();
        this.CACHE_TTL = 300000;
        this.defaultConfig = {
            reliabilityWeight: 0.25,
            completenessWeight: 0.20,
            timelinessWeight: 0.20,
            traceabilityWeight: 0.20,
            consistencyWeight: 0.15,
            reliabilityThreshold: 0.7,
            completenessThreshold: 0.8,
            timelinessThresholdSeconds: 3600,
            enableDetailedAssessment: true,
        };
    }
    async assessFeatureQuality(featureName, featureValue, sourceData, config) {
        const assessmentConfig = {
            ...this.defaultConfig,
            ...config,
        };
        this.logger.debug(`Assessing feature quality: ${featureName}`);
        const cacheKey = this.generateCacheKey(featureName, featureValue, sourceData);
        const cached = this.assessmentCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            this.logger.debug(`Using cached assessment for feature: ${featureName}`);
            return cached.report;
        }
        const reliability = this.assessReliability(featureValue, sourceData, assessmentConfig);
        const completeness = this.assessCompleteness(sourceData, assessmentConfig);
        const timeliness = this.assessTimeliness(sourceData, assessmentConfig);
        const traceability = this.assessTraceability(sourceData, assessmentConfig);
        const consistency = this.assessConsistency(sourceData, assessmentConfig);
        const overallQuality = this.calculateOverallQuality({
            reliability,
            completeness,
            timeliness,
            traceability,
            consistency,
        }, assessmentConfig);
        const qualityLevel = this.determineQualityLevel(overallQuality);
        const issues = this.identifyIssues({
            reliability,
            completeness,
            timeliness,
            traceability,
            consistency,
        }, assessmentConfig);
        const recommendations = this.generateRecommendations({
            reliability,
            completeness,
            timeliness,
            traceability,
            consistency,
        }, issues, assessmentConfig);
        const report = {
            featureName,
            featureValue,
            reliability,
            completeness,
            timeliness,
            traceability,
            consistency,
            overallQuality,
            qualityLevel,
            issues,
            recommendations,
            assessedAt: new Date().toISOString(),
        };
        this.assessmentCache.set(cacheKey, {
            report,
            timestamp: Date.now(),
        });
        this.cleanExpiredCache();
        return report;
    }
    async assessMultipleFeatures(features, sourceData, config) {
        this.logger.debug(`Batch assessing ${features.length} features`);
        const results = new Map();
        const cachedResults = new Map();
        const uncachedFeatures = [];
        for (const feature of features) {
            const cacheKey = this.generateCacheKey(feature.name, feature.value, sourceData);
            const cached = this.assessmentCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                cachedResults.set(feature.name, cached.report);
            }
            else {
                uncachedFeatures.push(feature);
            }
        }
        for (const [name, report] of cachedResults.entries()) {
            results.set(name, report);
        }
        if (uncachedFeatures.length === 0) {
            this.logger.debug(`All ${features.length} features found in cache`);
            return results;
        }
        const shouldParallelize = uncachedFeatures.length >= 3 || sourceData.length >= 5;
        if (shouldParallelize) {
            const batchSize = Math.min(10, uncachedFeatures.length);
            for (let i = 0; i < uncachedFeatures.length; i += batchSize) {
                const batch = uncachedFeatures.slice(i, i + batchSize);
                const promises = batch.map(feature => this.assessFeatureQuality(feature.name, feature.value, sourceData, config)
                    .then(report => ({ name: feature.name, report }))
                    .catch(error => {
                    this.logger.error(`Failed to assess feature ${feature.name}: ${error.message}`);
                    return null;
                }));
                const batchResults = await Promise.all(promises);
                for (const result of batchResults) {
                    if (result) {
                        results.set(result.name, result.report);
                    }
                }
            }
        }
        else {
            for (const feature of uncachedFeatures) {
                try {
                    const report = await this.assessFeatureQuality(feature.name, feature.value, sourceData, config);
                    results.set(feature.name, report);
                }
                catch (error) {
                    this.logger.error(`Failed to assess feature ${feature.name}: ${error.message}`);
                }
            }
        }
        return results;
    }
    generateCacheKey(featureName, featureValue, sourceData) {
        const sourceIds = sourceData.map(s => s.sourceId).sort().join(',');
        const valueHash = typeof featureValue === 'object'
            ? JSON.stringify(featureValue).substring(0, 100)
            : String(featureValue);
        return `${featureName}:${valueHash}:${sourceIds}`;
    }
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.assessmentCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.assessmentCache.delete(key);
            }
        }
    }
    assessReliability(featureValue, sourceData, config) {
        if (sourceData.length === 0) {
            return 0;
        }
        const avgReliability = sourceData.reduce((sum, s) => sum + s.reliability, 0) / sourceData.length;
        const sourceCountFactor = Math.min(1, sourceData.length / 3);
        const consistencyFactor = this.calculateSourceConsistency(sourceData);
        const valueReasonableness = this.assessValueReasonableness(featureValue, sourceData);
        return avgReliability * 0.4 +
            sourceCountFactor * 0.2 +
            consistencyFactor * 0.2 +
            valueReasonableness * 0.2;
    }
    assessCompleteness(sourceData, config) {
        if (sourceData.length === 0) {
            return 0;
        }
        const sourcesWithFeature = sourceData.filter(s => {
            try {
                return this.hasFeature(s.data, 'feature');
            }
            catch {
                return false;
            }
        }).length;
        const coverage = sourcesWithFeature / sourceData.length;
        const nonEmptySources = sourceData.filter(s => {
            if (s.data === null || s.data === undefined)
                return false;
            if (typeof s.data === 'object' && Object.keys(s.data).length === 0)
                return false;
            return true;
        }).length;
        const dataCompleteness = nonEmptySources / sourceData.length;
        return (coverage + dataCompleteness) / 2;
    }
    assessTimeliness(sourceData, config) {
        if (sourceData.length === 0) {
            return 0;
        }
        const now = Date.now();
        let totalWeightedFreshness = 0;
        let totalWeight = 0;
        let validSources = 0;
        for (const source of sourceData) {
            if (!source.timestamp) {
                continue;
            }
            const sourceTime = new Date(source.timestamp).getTime();
            const ageSeconds = (now - sourceTime) / 1000;
            const halfLife = config.timelinessThresholdSeconds / Math.log2(Math.E);
            const freshness = Math.pow(0.5, ageSeconds / halfLife);
            const weight = source.reliability;
            totalWeightedFreshness += freshness * weight;
            totalWeight += weight;
            validSources++;
        }
        if (validSources === 0) {
            return 0.5;
        }
        return totalWeight > 0 ? totalWeightedFreshness / totalWeight : totalWeightedFreshness / validSources;
    }
    assessTraceability(sourceData, config) {
        if (sourceData.length === 0) {
            return 0;
        }
        let traceabilityScore = 0;
        let validSources = 0;
        for (const source of sourceData) {
            let sourceScore = 0;
            let factors = 0;
            if (source.sourceId) {
                sourceScore += 0.3;
                factors++;
            }
            if (source.sourceName) {
                sourceScore += 0.2;
                factors++;
            }
            if (source.sourceInfo) {
                sourceScore += 0.3;
                factors++;
                if (source.sourceInfo.sourceType) {
                    sourceScore += 0.1;
                    factors++;
                }
                if (source.sourceInfo.timestamp) {
                    sourceScore += 0.1;
                    factors++;
                }
            }
            if (factors > 0) {
                traceabilityScore += sourceScore / factors;
                validSources++;
            }
        }
        return validSources > 0 ? traceabilityScore / validSources : 0;
    }
    assessConsistency(sourceData, config) {
        if (sourceData.length <= 1) {
            return 1.0;
        }
        const values = sourceData.map(s => s.data);
        const consistency = this.calculateValueConsistency(values);
        return consistency;
    }
    calculateSourceConsistency(sourceData) {
        if (sourceData.length <= 1) {
            return 1.0;
        }
        const reliabilities = sourceData.map(s => s.reliability);
        const mean = reliabilities.reduce((sum, r) => sum + r, 0) / reliabilities.length;
        const stdDev = this.calculateStandardDeviation(reliabilities);
        const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
        const consistency = Math.exp(-coefficientOfVariation * 2);
        const sampleSizeFactor = Math.min(1, Math.log2(sourceData.length + 1) / Math.log2(8));
        return consistency * 0.8 + sampleSizeFactor * 0.2;
    }
    calculateStandardDeviation(values) {
        if (values.length === 0) {
            return 0;
        }
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
    assessValueReasonableness(value, sourceData) {
        if (value === null || value === undefined) {
            return 0.3;
        }
        if (typeof value === 'number') {
            if (isNaN(value) || !isFinite(value)) {
                return 0.2;
            }
            return 0.9;
        }
        if (typeof value === 'string') {
            if (value.trim().length === 0) {
                return 0.4;
            }
            return 0.8;
        }
        if (typeof value === 'object') {
            if (Object.keys(value).length === 0) {
                return 0.5;
            }
            return 0.85;
        }
        return 0.7;
    }
    calculateValueConsistency(values) {
        if (values.length <= 1) {
            return 1.0;
        }
        const types = values.map(v => typeof v);
        const typeConsistency = types.every(t => t === types[0]) ? 1.0 : 0.3;
        if (types[0] === 'number' && values.every(v => typeof v === 'number')) {
            const nums = values;
            const mean = nums.reduce((sum, n) => sum + n, 0) / nums.length;
            const stdDev = this.calculateStandardDeviation(nums);
            const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : (stdDev > 0 ? 1 : 0);
            const numericConsistency = Math.exp(-coefficientOfVariation * 2);
            const sampleSizeFactor = Math.min(1, Math.log2(nums.length + 1) / Math.log2(4));
            return typeConsistency * 0.3 + numericConsistency * 0.5 + sampleSizeFactor * 0.2;
        }
        if (types[0] === 'string' && values.every(v => typeof v === 'string')) {
            const strings = values;
            const allSame = strings.every(s => s === strings[0]);
            if (allSame) {
                return 1.0;
            }
            let totalSimilarity = 0;
            let comparisons = 0;
            for (let i = 0; i < strings.length; i++) {
                for (let j = i + 1; j < strings.length; j++) {
                    const similarity = this.calculateStringSimilarity(strings[i], strings[j]);
                    totalSimilarity += similarity;
                    comparisons++;
                }
            }
            const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0.5;
            return typeConsistency * 0.3 + avgSimilarity * 0.7;
        }
        return typeConsistency;
    }
    calculateStringSimilarity(str1, str2) {
        if (str1 === str2) {
            return 1.0;
        }
        const set1 = new Set(str1.toLowerCase().split(''));
        const set2 = new Set(str2.toLowerCase().split(''));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }
    calculateOverallQuality(scores, config) {
        return scores.reliability * config.reliabilityWeight +
            scores.completeness * config.completenessWeight +
            scores.timeliness * config.timelinessWeight +
            scores.traceability * config.traceabilityWeight +
            scores.consistency * config.consistencyWeight;
    }
    determineQualityLevel(overallQuality) {
        if (overallQuality >= 0.9)
            return 'EXCELLENT';
        if (overallQuality >= 0.75)
            return 'GOOD';
        if (overallQuality >= 0.6)
            return 'FAIR';
        if (overallQuality >= 0.4)
            return 'POOR';
        return 'CRITICAL';
    }
    identifyIssues(scores, config) {
        const issues = [];
        if (scores.reliability < config.reliabilityThreshold) {
            issues.push({
                type: 'RELIABILITY',
                severity: scores.reliability < 0.5 ? 'CRITICAL' : scores.reliability < 0.6 ? 'HIGH' : 'MEDIUM',
                description: `可靠性不足（${(scores.reliability * 100).toFixed(1)}%）`,
                recommendation: '建议使用更可靠的数据源或增加数据源数量',
            });
        }
        if (scores.completeness < config.completenessThreshold) {
            issues.push({
                type: 'COMPLETENESS',
                severity: scores.completeness < 0.6 ? 'HIGH' : 'MEDIUM',
                description: `完整性不足（${(scores.completeness * 100).toFixed(1)}%）`,
                recommendation: '建议补充缺失的数据源或字段',
            });
        }
        if (scores.timeliness < 0.7) {
            issues.push({
                type: 'TIMELINESS',
                severity: scores.timeliness < 0.5 ? 'HIGH' : 'MEDIUM',
                description: `时效性不足（${(scores.timeliness * 100).toFixed(1)}%）`,
                recommendation: '建议更新数据源或使用更频繁的更新频率',
            });
        }
        if (scores.traceability < 0.7) {
            issues.push({
                type: 'TRACEABILITY',
                severity: scores.traceability < 0.5 ? 'MEDIUM' : 'LOW',
                description: `可追溯性不足（${(scores.traceability * 100).toFixed(1)}%）`,
                recommendation: '建议完善数据源信息标注',
            });
        }
        if (scores.consistency < 0.7) {
            issues.push({
                type: 'CONSISTENCY',
                severity: scores.consistency < 0.5 ? 'HIGH' : 'MEDIUM',
                description: `一致性不足（${(scores.consistency * 100).toFixed(1)}%）`,
                recommendation: '建议检查数据源之间的差异，可能需要数据清洗或标准化',
            });
        }
        return issues;
    }
    generateRecommendations(scores, issues, config) {
        const recommendations = [];
        for (const issue of issues) {
            if (issue.recommendation) {
                recommendations.push(issue.recommendation);
            }
        }
        const minScore = Math.min(scores.reliability, scores.completeness, scores.timeliness, scores.traceability, scores.consistency);
        if (minScore < 0.5) {
            recommendations.push('特征质量严重不足，建议重新评估数据源或特征提取方法');
        }
        else if (minScore < 0.7) {
            recommendations.push('特征质量有待提升，建议优化数据源或处理流程');
        }
        return [...new Set(recommendations)];
    }
    hasFeature(data, featureName) {
        if (data === null || data === undefined) {
            return false;
        }
        if (typeof data === 'object') {
            return featureName in data;
        }
        return true;
    }
};
exports.FeatureQualityAssessmentService = FeatureQualityAssessmentService;
exports.FeatureQualityAssessmentService = FeatureQualityAssessmentService = FeatureQualityAssessmentService_1 = __decorate([
    (0, common_1.Injectable)()
], FeatureQualityAssessmentService);
//# sourceMappingURL=feature-quality-assessment.service.js.map