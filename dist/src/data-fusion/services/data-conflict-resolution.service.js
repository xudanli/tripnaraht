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
var DataConflictResolutionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataConflictResolutionService = void 0;
const common_1 = require("@nestjs/common");
const fusion_resilience_service_1 = require("./fusion-resilience.service");
const fusion_resource_manager_service_1 = require("./fusion-resource-manager.service");
let DataConflictResolutionService = DataConflictResolutionService_1 = class DataConflictResolutionService {
    constructor(resilienceService, resourceManager) {
        this.resilienceService = resilienceService;
        this.resourceManager = resourceManager;
        this.logger = new common_1.Logger(DataConflictResolutionService_1.name);
        this.conflictCache = new Map();
        this.CACHE_TTL = 60000;
        this.PARALLEL_THRESHOLD = 5;
        this.performanceStats = {
            totalFusions: 0,
            totalConflictDetections: 0,
            averageFusionTime: 0,
            averageConflictDetectionTime: 0,
            cacheHitRate: 0,
            totalCacheHits: 0,
            totalCacheMisses: 0,
        };
    }
    detectConflicts(dataSources) {
        this.logger.debug(`Detecting conflicts across ${dataSources.length} data sources`);
        const cacheKey = this.generateCacheKey(dataSources);
        const cached = this.conflictCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            this.logger.debug('Using cached conflict report');
            this.performanceStats.totalCacheHits++;
            if (this.resourceManager) {
                this.resourceManager.updateCacheAccess(cacheKey, this.conflictCache);
            }
            return cached.report;
        }
        this.performanceStats.totalCacheMisses++;
        const conflicts = [];
        const fieldValues = new Map();
        for (const source of dataSources) {
            this.collectFieldValues(source.data, '', source, fieldValues);
        }
        for (const [field, values] of fieldValues.entries()) {
            if (values.length < 2) {
                continue;
            }
            const conflict = this.detectFieldConflict(field, values);
            if (conflict) {
                conflicts.push(conflict);
            }
        }
        const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL').length;
        const highConflicts = conflicts.filter(c => c.severity === 'HIGH').length;
        const mediumConflicts = conflicts.filter(c => c.severity === 'MEDIUM').length;
        const lowConflicts = conflicts.filter(c => c.severity === 'LOW').length;
        const affectedFields = [...new Set(conflicts.map(c => c.field))];
        const report = {
            conflicts,
            totalConflicts: conflicts.length,
            criticalConflicts,
            highConflicts,
            mediumConflicts,
            lowConflicts,
            affectedFields,
            summary: this.generateConflictSummary(conflicts),
        };
        this.conflictCache.set(cacheKey, {
            report,
            timestamp: Date.now(),
        });
        if (this.resourceManager) {
            this.resourceManager.updateCacheAccess(cacheKey, this.conflictCache);
        }
        setImmediate(() => this.cleanExpiredCache());
        return report;
    }
    generateCacheKey(dataSources) {
        const sourceIds = dataSources.map(s => s.sourceId).sort().join(',');
        const timestamps = dataSources.map(s => s.timestamp || '').join(',');
        return `${sourceIds}:${timestamps}`;
    }
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.conflictCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.conflictCache.delete(key);
            }
        }
    }
    reliabilityWeightedFusion(dataSources, field) {
        this.logger.debug(`Performing reliability-weighted fusion for ${dataSources.length} sources`);
        if (field) {
            const values = this.extractFieldValues(dataSources, field);
            const fused = this.fuseValues(values, 'RELIABILITY_WEIGHTED');
            return {
                value: fused.value,
                confidence: fused.confidence,
                strategy: 'RELIABILITY_WEIGHTED',
                sources: dataSources.map(s => s.sourceId),
                metadata: {
                    fusionTimestamp: new Date().toISOString(),
                    conflictCount: 0,
                    resolutionDetails: [],
                },
            };
        }
        const fusedData = {};
        const allFields = this.getAllFields(dataSources);
        const resolutionDetails = [];
        const fieldValuesMap = new Map();
        for (const source of dataSources) {
            this.extractAllFieldValues(source, '', fieldValuesMap);
        }
        for (const fieldName of allFields) {
            const values = fieldValuesMap.get(fieldName) || this.extractFieldValues(dataSources, fieldName);
            if (values.length === 0) {
                continue;
            }
            const fused = this.fuseValues(values, 'RELIABILITY_WEIGHTED');
            this.setNestedValue(fusedData, fieldName, fused.value);
            resolutionDetails.push({
                field: fieldName,
                strategy: 'RELIABILITY_WEIGHTED',
                selectedValue: fused.value,
                rejectedValues: values
                    .filter(v => v.value !== fused.value)
                    .map(v => ({
                    sourceId: v.sourceId,
                    value: v.value,
                    reason: `可靠性较低（${v.reliability.toFixed(2)}）`,
                })),
            });
        }
        const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
        const conflictCount = this.detectConflicts(dataSources).totalConflicts;
        return {
            value: fusedData,
            confidence: avgReliability * (1 - conflictCount * 0.1),
            strategy: 'RELIABILITY_WEIGHTED',
            sources: dataSources.map(s => s.sourceId),
            metadata: {
                fusionTimestamp: new Date().toISOString(),
                conflictCount,
                resolutionDetails,
            },
        };
    }
    prioritySelection(dataSources, priorityOrder) {
        this.logger.debug(`Performing priority selection for ${dataSources.length} sources`);
        let sortedSources = [...dataSources];
        if (priorityOrder && priorityOrder.length > 0) {
            sortedSources = dataSources.sort((a, b) => {
                const aIndex = priorityOrder.indexOf(a.sourceId);
                const bIndex = priorityOrder.indexOf(b.sourceId);
                if (aIndex === -1 && bIndex === -1)
                    return b.priority - a.priority;
                if (aIndex === -1)
                    return 1;
                if (bIndex === -1)
                    return -1;
                return aIndex - bIndex;
            });
        }
        else {
            sortedSources = dataSources.sort((a, b) => b.priority - a.priority);
        }
        const selectedSource = sortedSources[0];
        const rejectedSources = sortedSources.slice(1);
        return {
            value: selectedSource.data,
            confidence: selectedSource.reliability,
            strategy: 'PRIORITY_SELECTION',
            sources: [selectedSource.sourceId],
            metadata: {
                fusionTimestamp: new Date().toISOString(),
                conflictCount: 0,
                resolutionDetails: [{
                        field: 'all',
                        strategy: 'PRIORITY_SELECTION',
                        selectedValue: selectedSource.data,
                        rejectedValues: rejectedSources.map(s => ({
                            sourceId: s.sourceId,
                            value: s.data,
                            reason: `优先级较低（${s.priority}）`,
                        })),
                    }],
            },
        };
    }
    contextBasedSelection(dataSources, context) {
        this.logger.debug(`Performing context-based selection with context: ${JSON.stringify(context)}`);
        let bestSource;
        let bestScore = -1;
        for (const source of dataSources) {
            const score = this.calculateContextScore(source, context);
            if (score > bestScore) {
                bestScore = score;
                bestSource = source;
            }
        }
        if (!bestSource) {
            return this.prioritySelection(dataSources);
        }
        const rejectedSources = dataSources.filter(s => s.sourceId !== bestSource.sourceId);
        return {
            value: bestSource.data,
            confidence: bestSource.reliability * (bestScore / 100),
            strategy: 'CONTEXT_BASED',
            sources: [bestSource.sourceId],
            metadata: {
                fusionTimestamp: new Date().toISOString(),
                conflictCount: 0,
                resolutionDetails: [{
                        field: 'all',
                        strategy: 'CONTEXT_BASED',
                        selectedValue: bestSource.data,
                        rejectedValues: rejectedSources.map(s => ({
                            sourceId: s.sourceId,
                            value: s.data,
                            reason: `上下文匹配度较低（${this.calculateContextScore(s, context).toFixed(1)}）`,
                        })),
                    }],
            },
        };
    }
    async fuse(dataSources, config) {
        const executeFusion = async () => {
            const fusionStartTime = Date.now();
            this.performanceStats.totalFusions++;
            const fusionConfig = {
                defaultStrategy: (config === null || config === void 0 ? void 0 : config.defaultStrategy) || 'RELIABILITY_WEIGHTED',
                reliabilityThreshold: (config === null || config === void 0 ? void 0 : config.reliabilityThreshold) || 0.5,
                conflictResolutionStrategy: (config === null || config === void 0 ? void 0 : config.conflictResolutionStrategy) || 'AUTO',
                enableConflictDetection: (config === null || config === void 0 ? void 0 : config.enableConflictDetection) !== false,
                context: (config === null || config === void 0 ? void 0 : config.context) || {},
            };
            const validSources = dataSources.filter(s => s.reliability >= fusionConfig.reliabilityThreshold);
            if (validSources.length === 0) {
                throw new Error('No valid data sources after reliability filtering');
            }
            let conflictReport;
            if (fusionConfig.enableConflictDetection) {
                const conflictStartTime = Date.now();
                this.performanceStats.totalConflictDetections++;
                conflictReport = this.detectConflicts(validSources);
                const conflictTime = Date.now() - conflictStartTime;
                this.updateAverageTime('conflictDetection', conflictTime);
            }
            let fusedData;
            const strategy = fusionConfig.defaultStrategy;
            switch (strategy) {
                case 'RELIABILITY_WEIGHTED':
                    fusedData = this.reliabilityWeightedFusion(validSources);
                    break;
                case 'PRIORITY_SELECTION':
                    fusedData = this.prioritySelection(validSources);
                    break;
                case 'CONTEXT_BASED':
                    fusedData = this.contextBasedSelection(validSources, fusionConfig.context);
                    break;
                case 'AVERAGE':
                    fusedData = this.averageFusion(validSources);
                    break;
                case 'MEDIAN':
                    fusedData = this.medianFusion(validSources);
                    break;
                default:
                    fusedData = this.reliabilityWeightedFusion(validSources);
            }
            const qualityMetrics = this.calculateQualityMetrics(validSources, conflictReport);
            const recommendations = this.generateRecommendations(validSources, conflictReport, fusedData, qualityMetrics);
            const fusionTime = Date.now() - fusionStartTime;
            this.updateAverageTime('fusion', fusionTime);
            return {
                fusedData,
                conflictReport,
                qualityMetrics,
                recommendations,
            };
        };
        if (this.resourceManager && this.resilienceService) {
            await this.resourceManager.acquireConcurrency();
            await this.resourceManager.acquireRateLimitToken();
            try {
                return await this.resilienceService.executeWithErrorHandling(executeFusion, 'fuse', {
                    maxRetries: 2,
                    retryDelay: 1000,
                    skipOnError: false,
                });
            }
            finally {
                this.resourceManager.releaseConcurrency();
            }
        }
        else {
            return await executeFusion();
        }
    }
    collectFieldValues(data, prefix, source, fieldValues) {
        if (data === null || data === undefined) {
            return;
        }
        if (typeof data !== 'object' || Array.isArray(data)) {
            const field = prefix || 'root';
            if (!fieldValues.has(field)) {
                fieldValues.set(field, []);
            }
            fieldValues.get(field).push({
                sourceId: source.sourceId,
                sourceName: source.sourceName,
                value: data,
                reliability: source.reliability,
                timestamp: source.timestamp,
            });
            return;
        }
        for (const [key, value] of Object.entries(data)) {
            const field = prefix ? `${prefix}.${key}` : key;
            this.collectFieldValues(value, field, source, fieldValues);
        }
    }
    detectFieldConflict(field, values) {
        const uniqueValues = new Set(values.map(v => JSON.stringify(v.value)));
        if (uniqueValues.size <= 1) {
            return null;
        }
        const conflictType = this.determineConflictType(values);
        const severity = this.determineConflictSeverity(conflictType, values);
        return {
            field,
            type: conflictType,
            severity,
            sources: values,
            description: this.generateConflictDescription(field, conflictType, values),
            impact: this.assessConflictImpact(conflictType, severity),
            resolutionStrategy: this.suggestResolutionStrategy(conflictType, values),
        };
    }
    determineConflictType(values) {
        const types = new Set(values.map(v => typeof v.value));
        if (types.size > 1) {
            return 'TYPE_MISMATCH';
        }
        const firstType = types.values().next().value;
        if (firstType === 'number') {
            const nums = values.map(v => Number(v.value)).filter(n => !isNaN(n));
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min;
            const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
            if (range > avg * 0.5) {
                return 'RANGE_MISMATCH';
            }
            return 'VALUE_MISMATCH';
        }
        if (firstType === 'string') {
            return 'VALUE_MISMATCH';
        }
        if (firstType === 'object' && values[0].value instanceof Date) {
            const dates = values.map(v => new Date(v.value).getTime());
            const min = Math.min(...dates);
            const max = Math.max(...dates);
            const diffDays = (max - min) / (1000 * 60 * 60 * 24);
            if (diffDays > 7) {
                return 'TEMPORAL_MISMATCH';
            }
            return 'VALUE_MISMATCH';
        }
        return 'VALUE_MISMATCH';
    }
    determineConflictSeverity(type, values) {
        const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
        const reliabilityGap = Math.max(...values.map(v => v.reliability)) -
            Math.min(...values.map(v => v.reliability));
        if (type === 'TYPE_MISMATCH' || type === 'LOGICAL_CONTRADICTION') {
            return 'CRITICAL';
        }
        if (type === 'RANGE_MISMATCH' && reliabilityGap > 0.5) {
            return 'HIGH';
        }
        if (avgReliability < 0.5) {
            return 'HIGH';
        }
        if (reliabilityGap > 0.3) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    generateConflictDescription(field, type, values) {
        const valueList = values.map(v => `${v.sourceName}: ${JSON.stringify(v.value)}`).join(', ');
        const typeMap = {
            VALUE_MISMATCH: '值不匹配',
            TYPE_MISMATCH: '类型不匹配',
            RANGE_MISMATCH: '范围差异较大',
            TEMPORAL_MISMATCH: '时间不匹配',
            SPATIAL_MISMATCH: '空间位置不匹配',
            LOGICAL_CONTRADICTION: '逻辑矛盾',
        };
        return `字段 ${field} 存在${typeMap[type]}：${valueList}`;
    }
    assessConflictImpact(type, severity) {
        const impacts = [];
        if (severity === 'CRITICAL') {
            impacts.push('可能导致决策错误');
            impacts.push('需要人工干预');
        }
        else if (severity === 'HIGH') {
            impacts.push('可能影响决策质量');
            impacts.push('建议验证数据源');
        }
        else if (severity === 'MEDIUM') {
            impacts.push('可能影响准确性');
        }
        else {
            impacts.push('影响较小');
        }
        if (type === 'TYPE_MISMATCH') {
            impacts.push('数据类型不一致，无法直接比较');
        }
        return impacts;
    }
    suggestResolutionStrategy(type, values) {
        const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
        const reliabilityGap = Math.max(...values.map(v => v.reliability)) -
            Math.min(...values.map(v => v.reliability));
        if (reliabilityGap > 0.3) {
            return 'RELIABILITY_WEIGHTED';
        }
        if (type === 'VALUE_MISMATCH' && typeof values[0].value === 'number') {
            return 'AVERAGE';
        }
        return 'PRIORITY_SELECTION';
    }
    fuseValues(values, strategy) {
        if (values.length === 0) {
            throw new Error('No values to fuse');
        }
        if (values.length === 1) {
            return {
                value: values[0].value,
                confidence: values[0].reliability,
            };
        }
        switch (strategy) {
            case 'RELIABILITY_WEIGHTED':
                return this.reliabilityWeightedFuseValues(values);
            case 'AVERAGE':
                return this.averageFuseValues(values);
            case 'MEDIAN':
                return this.medianFuseValues(values);
            case 'MODE':
                return this.modeFuseValues(values);
            default:
                return this.reliabilityWeightedFuseValues(values);
        }
    }
    reliabilityWeightedFuseValues(values) {
        const totalReliability = values.reduce((sum, v) => sum + v.reliability, 0);
        const weights = values.map(v => v.reliability / totalReliability);
        const firstValue = values[0].value;
        if (typeof firstValue === 'number') {
            const weightedSum = values.reduce((sum, v, i) => sum + Number(v.value) * weights[i], 0);
            return {
                value: weightedSum,
                confidence: totalReliability / values.length,
            };
        }
        if (typeof firstValue === 'string') {
            const bestIndex = weights.indexOf(Math.max(...weights));
            return {
                value: values[bestIndex].value,
                confidence: values[bestIndex].reliability,
            };
        }
        if (firstValue instanceof Date) {
            const timestamps = values.map(v => new Date(v.value).getTime());
            const weightedTimestamp = timestamps.reduce((sum, ts, i) => sum + ts * weights[i], 0);
            return {
                value: new Date(weightedTimestamp),
                confidence: totalReliability / values.length,
            };
        }
        const bestIndex = weights.indexOf(Math.max(...weights));
        return {
            value: values[bestIndex].value,
            confidence: values[bestIndex].reliability,
        };
    }
    averageFuseValues(values) {
        const firstValue = values[0].value;
        if (typeof firstValue === 'number') {
            const avg = values.reduce((sum, v) => sum + Number(v.value), 0) / values.length;
            const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
            return {
                value: avg,
                confidence: avgReliability,
            };
        }
        return this.reliabilityWeightedFuseValues(values);
    }
    medianFuseValues(values) {
        const firstValue = values[0].value;
        if (typeof firstValue === 'number') {
            const sorted = values.map(v => Number(v.value)).sort((a, b) => a - b);
            const median = sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : sorted[Math.floor(sorted.length / 2)];
            const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
            return {
                value: median,
                confidence: avgReliability,
            };
        }
        return this.reliabilityWeightedFuseValues(values);
    }
    modeFuseValues(values) {
        const valueCounts = new Map();
        for (const v of values) {
            const key = JSON.stringify(v.value);
            if (!valueCounts.has(key)) {
                valueCounts.set(key, { count: 0, reliability: 0 });
            }
            const entry = valueCounts.get(key);
            entry.count++;
            entry.reliability = Math.max(entry.reliability, v.reliability);
        }
        let maxCount = 0;
        let modeValue = null;
        let modeReliability = 0;
        for (const [key, entry] of valueCounts.entries()) {
            if (entry.count > maxCount || (entry.count === maxCount && entry.reliability > modeReliability)) {
                maxCount = entry.count;
                modeValue = JSON.parse(key);
                modeReliability = entry.reliability;
            }
        }
        return {
            value: modeValue,
            confidence: modeReliability,
        };
    }
    extractFieldValues(dataSources, field) {
        return dataSources.map(source => ({
            sourceId: source.sourceId,
            value: this.getNestedValue(source.data, field),
            reliability: source.reliability,
        })).filter(v => v.value !== undefined);
    }
    extractAllFieldValues(source, prefix, fieldValuesMap) {
        if (source.data === null || source.data === undefined) {
            return;
        }
        if (typeof source.data !== 'object' || Array.isArray(source.data)) {
            if (prefix) {
                if (!fieldValuesMap.has(prefix)) {
                    fieldValuesMap.set(prefix, []);
                }
                fieldValuesMap.get(prefix).push({
                    sourceId: source.sourceId,
                    value: source.data,
                    reliability: source.reliability,
                });
            }
            return;
        }
        for (const [key, value] of Object.entries(source.data)) {
            const field = prefix ? `${prefix}.${key}` : key;
            this.extractAllFieldValues({ ...source, data: value }, field, fieldValuesMap);
        }
    }
    getAllFields(dataSources) {
        const fields = new Set();
        for (const source of dataSources) {
            this.collectFields(source.data, '', fields);
        }
        return Array.from(fields);
    }
    collectFields(data, prefix, fields) {
        if (data === null || data === undefined) {
            return;
        }
        if (typeof data !== 'object' || Array.isArray(data)) {
            if (prefix) {
                fields.add(prefix);
            }
            return;
        }
        for (const [key, value] of Object.entries(data)) {
            const field = prefix ? `${prefix}.${key}` : key;
            this.collectFields(value, field, fields);
        }
    }
    getNestedValue(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current) || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
    }
    calculateContextScore(source, context) {
        let score = 0;
        let totalWeight = 0;
        if (source.context) {
            let matchCount = 0;
            let totalKeys = 0;
            for (const [key, value] of Object.entries(context)) {
                totalKeys++;
                if (source.context[key] === value) {
                    matchCount++;
                }
                else if (this.fuzzyMatch(source.context[key], value)) {
                    matchCount += 0.5;
                }
            }
            const contextMatchScore = totalKeys > 0 ? (matchCount / totalKeys) * 100 : 50;
            score += contextMatchScore * 0.4;
            totalWeight += 0.4;
        }
        else {
            score += 50 * 0.4;
            totalWeight += 0.4;
        }
        score += source.reliability * 100 * 0.35;
        totalWeight += 0.35;
        const normalizedPriority = Math.min(1, source.priority / 10);
        score += normalizedPriority * 100 * 0.15;
        totalWeight += 0.15;
        if (context.timestamp && source.timestamp) {
            const contextTime = new Date(context.timestamp).getTime();
            const sourceTime = new Date(source.timestamp).getTime();
            const timeDiff = Math.abs(contextTime - sourceTime);
            const timeRelevance = Math.exp(-timeDiff / (7 * 24 * 60 * 60 * 1000));
            score += timeRelevance * 100 * 0.1;
            totalWeight += 0.1;
        }
        return totalWeight > 0 ? Math.min(100, score / totalWeight) : 50;
    }
    fuzzyMatch(value1, value2) {
        if (value1 === value2) {
            return true;
        }
        if (typeof value1 === 'string' && typeof value2 === 'string') {
            const str1 = value1.toLowerCase();
            const str2 = value2.toLowerCase();
            return str1.includes(str2) || str2.includes(str1);
        }
        if (typeof value1 === 'number' && typeof value2 === 'number') {
            const diff = Math.abs(value1 - value2);
            const avg = (Math.abs(value1) + Math.abs(value2)) / 2;
            return avg > 0 && diff / avg < 0.1;
        }
        return false;
    }
    averageFusion(dataSources) {
        const allFields = this.getAllFields(dataSources);
        const fusedData = {};
        const resolutionDetails = [];
        for (const fieldName of allFields) {
            const values = this.extractFieldValues(dataSources, fieldName);
            const fused = this.averageFuseValues(values);
            this.setNestedValue(fusedData, fieldName, fused.value);
            resolutionDetails.push({
                field: fieldName,
                strategy: 'AVERAGE',
                selectedValue: fused.value,
                rejectedValues: [],
            });
        }
        const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
        return {
            value: fusedData,
            confidence: avgReliability,
            strategy: 'AVERAGE',
            sources: dataSources.map(s => s.sourceId),
            metadata: {
                fusionTimestamp: new Date().toISOString(),
                conflictCount: 0,
                resolutionDetails,
            },
        };
    }
    medianFusion(dataSources) {
        const allFields = this.getAllFields(dataSources);
        const fusedData = {};
        const resolutionDetails = [];
        for (const fieldName of allFields) {
            const values = this.extractFieldValues(dataSources, fieldName);
            const fused = this.medianFuseValues(values);
            this.setNestedValue(fusedData, fieldName, fused.value);
            resolutionDetails.push({
                field: fieldName,
                strategy: 'MEDIAN',
                selectedValue: fused.value,
                rejectedValues: [],
            });
        }
        const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
        return {
            value: fusedData,
            confidence: avgReliability,
            strategy: 'MEDIAN',
            sources: dataSources.map(s => s.sourceId),
            metadata: {
                fusionTimestamp: new Date().toISOString(),
                conflictCount: 0,
                resolutionDetails,
            },
        };
    }
    calculateQualityMetrics(dataSources, conflictReport) {
        const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
        const completeness = 1.0;
        const accuracy = avgReliability;
        const consistency = conflictReport
            ? 1 - (conflictReport.totalConflicts / (dataSources.length * 10))
            : 1.0;
        const overallQuality = (completeness + accuracy + consistency) / 3;
        return {
            completeness,
            accuracy,
            consistency,
            overallQuality,
        };
    }
    generateRecommendations(dataSources, conflictReport, fusedData, qualityMetrics) {
        const recommendations = [];
        if (conflictReport && conflictReport.totalConflicts > 0) {
            if (conflictReport.criticalConflicts > 0) {
                recommendations.push(`检测到 ${conflictReport.criticalConflicts} 个严重冲突，建议人工审核`);
            }
            if (conflictReport.highConflicts > 0) {
                recommendations.push(`检测到 ${conflictReport.highConflicts} 个高优先级冲突，建议验证数据源`);
            }
        }
        if (qualityMetrics.overallQuality < 0.7) {
            recommendations.push('数据质量较低，建议补充更多可靠的数据源');
        }
        if (dataSources.length < 2) {
            recommendations.push('数据源数量较少，建议增加数据源以提高可靠性');
        }
        if (fusedData.confidence < 0.6) {
            recommendations.push('融合后置信度较低，建议使用更可靠的数据源');
        }
        return recommendations;
    }
    generateConflictSummary(conflicts) {
        if (conflicts.length === 0) {
            return '未检测到数据冲突';
        }
        const critical = conflicts.filter(c => c.severity === 'CRITICAL').length;
        const high = conflicts.filter(c => c.severity === 'HIGH').length;
        const medium = conflicts.filter(c => c.severity === 'MEDIUM').length;
        const low = conflicts.filter(c => c.severity === 'LOW').length;
        const parts = [];
        if (critical > 0)
            parts.push(`${critical}个严重冲突`);
        if (high > 0)
            parts.push(`${high}个高优先级冲突`);
        if (medium > 0)
            parts.push(`${medium}个中等冲突`);
        if (low > 0)
            parts.push(`${low}个低优先级冲突`);
        return `共检测到 ${conflicts.length} 个冲突（${parts.join('、')}）`;
    }
    updateAverageTime(type, time) {
        const alpha = 0.1;
        if (type === 'fusion') {
            this.performanceStats.averageFusionTime =
                this.performanceStats.averageFusionTime === 0
                    ? time
                    : this.performanceStats.averageFusionTime * (1 - alpha) + time * alpha;
        }
        else {
            this.performanceStats.averageConflictDetectionTime =
                this.performanceStats.averageConflictDetectionTime === 0
                    ? time
                    : this.performanceStats.averageConflictDetectionTime * (1 - alpha) + time * alpha;
        }
    }
};
exports.DataConflictResolutionService = DataConflictResolutionService;
exports.DataConflictResolutionService = DataConflictResolutionService = DataConflictResolutionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [fusion_resilience_service_1.FusionResilienceService,
        fusion_resource_manager_service_1.FusionResourceManagerService])
], DataConflictResolutionService);
//# sourceMappingURL=data-conflict-resolution.service.js.map