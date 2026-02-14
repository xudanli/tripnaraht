"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataQualityFrameworkService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityFrameworkService = void 0;
const common_1 = require("@nestjs/common");
let DataQualityFrameworkService = DataQualityFrameworkService_1 = class DataQualityFrameworkService {
    constructor() {
        this.logger = new common_1.Logger(DataQualityFrameworkService_1.name);
    }
    assessCompleteness(data, requiredFields, optionalFields = []) {
        const allFields = [...requiredFields, ...optionalFields];
        const missingFields = [];
        const completeFields = [];
        requiredFields.forEach(field => {
            if (this.isFieldMissing(data, field)) {
                missingFields.push(field);
            }
            else {
                completeFields.push(field);
            }
        });
        optionalFields.forEach(field => {
            if (!this.isFieldMissing(data, field)) {
                completeFields.push(field);
            }
        });
        const validRecords = completeFields.length;
        const totalRecords = allFields.length;
        const currentValue = totalRecords > 0 ? validRecords / totalRecords : 0;
        return {
            definition: '所需的数据是否都被采集到',
            calculation: '有效记录数 / 总记录数 × 100%',
            target: '> 95%',
            measurementFrequency: '每日',
            currentValue,
            missingFields,
            completeFields,
            totalFields: allFields.length,
            validRecords,
            totalRecords,
        };
    }
    assessAccuracy(data, validationRules, referenceData) {
        const errors = [];
        let correctData = 0;
        let totalData = 0;
        if (validationRules) {
            Object.entries(validationRules).forEach(([field, validator]) => {
                totalData++;
                const value = this.getFieldValue(data, field);
                if (value === undefined || value === null) {
                    return;
                }
                try {
                    if (validator(value)) {
                        correctData++;
                    }
                    else {
                        errors.push({
                            field,
                            actual: value,
                            errorType: 'format',
                        });
                    }
                }
                catch (error) {
                    errors.push({
                        field,
                        actual: value,
                        errorType: 'format',
                    });
                }
            });
        }
        if (referenceData) {
            Object.keys(referenceData).forEach(field => {
                totalData++;
                const actualValue = this.getFieldValue(data, field);
                const expectedValue = this.getFieldValue(referenceData, field);
                if (actualValue === undefined || actualValue === null) {
                    return;
                }
                if (this.valuesMatch(actualValue, expectedValue)) {
                    correctData++;
                }
                else {
                    errors.push({
                        field,
                        expected: expectedValue,
                        actual: actualValue,
                        errorType: 'reference',
                    });
                }
            });
        }
        const currentValue = totalData > 0 ? correctData / totalData : 1;
        return {
            definition: '数据是否反映真实情况',
            calculation: '正确数据 / 总数据 × 100%',
            target: '> 90%',
            measurementFrequency: '每周',
            currentValue,
            correctData,
            totalData,
            errors,
        };
    }
    assessConsistency(dataSources) {
        if (dataSources.length < 2) {
            return {
                definition: '不同数据源是否协调一致',
                calculation: '一致的数据 / 总数据 × 100%',
                target: '> 95%',
                measurementFrequency: '每日',
                currentValue: 1,
                consistentData: 0,
                totalData: 0,
                inconsistencies: [],
            };
        }
        const inconsistencies = [];
        const allFields = new Set();
        dataSources.forEach(({ data }) => {
            this.extractFields(data, allFields);
        });
        let consistentData = 0;
        let totalData = 0;
        allFields.forEach(field => {
            const values = [];
            dataSources.forEach(({ source, data, timestamp }) => {
                const value = this.getFieldValue(data, field);
                if (value !== undefined && value !== null) {
                    values.push({ source, value, timestamp });
                }
            });
            if (values.length === 0) {
                return;
            }
            totalData++;
            const firstValue = values[0].value;
            const allMatch = values.every(v => this.valuesMatch(v.value, firstValue));
            if (allMatch) {
                consistentData++;
            }
            else {
                inconsistencies.push({
                    field,
                    sources: values,
                    conflictType: 'value',
                });
            }
        });
        const currentValue = totalData > 0 ? consistentData / totalData : 1;
        return {
            definition: '不同数据源是否协调一致',
            calculation: '一致的数据 / 总数据 × 100%',
            target: '> 95%',
            measurementFrequency: '每日',
            currentValue,
            consistentData,
            totalData,
            inconsistencies,
        };
    }
    assessTimeliness(data, maxAgeSeconds = {}, defaultMaxAgeSeconds = 86400) {
        const staleData = [];
        let timelyData = 0;
        let totalData = 0;
        Object.keys(data).forEach(field => {
            const value = data[field];
            if (value && typeof value === 'object' && 'timestamp' in value) {
                totalData++;
                const timestamp = value.timestamp;
                const lastUpdated = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
                const ageSeconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
                const maxAge = maxAgeSeconds[field] || defaultMaxAgeSeconds;
                if (ageSeconds <= maxAge) {
                    timelyData++;
                }
                else {
                    staleData.push({
                        field,
                        lastUpdated,
                        ageSeconds,
                        maxAgeSeconds: maxAge,
                        source: value.source || 'unknown',
                    });
                }
            }
            else if (value && typeof value === 'object' && 'lastUpdatedAt' in value) {
                totalData++;
                const timestamp = value.lastUpdatedAt;
                const lastUpdated = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
                const ageSeconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
                const maxAge = maxAgeSeconds[field] || defaultMaxAgeSeconds;
                if (ageSeconds <= maxAge) {
                    timelyData++;
                }
                else {
                    staleData.push({
                        field,
                        lastUpdated,
                        ageSeconds,
                        maxAgeSeconds: maxAge,
                        source: value.source || 'unknown',
                    });
                }
            }
        });
        const currentValue = totalData > 0 ? timelyData / totalData : 1;
        return {
            definition: '数据是否及时更新',
            calculation: '及时数据 / 总数据 × 100%',
            target: '根据业务需求定义',
            measurementFrequency: '实时',
            currentValue,
            timelyData,
            totalData,
            staleData,
        };
    }
    assessTraceability(data, sourceInfo) {
        const untraceableData = [];
        let traceableData = 0;
        let totalData = 0;
        if (sourceInfo && !this.isRecord(sourceInfo)) {
            Object.keys(data).forEach(field => {
                totalData++;
                const value = data[field];
                if (value && typeof value === 'object' && 'source' in value) {
                    traceableData++;
                }
                else {
                    untraceableData.push({
                        field,
                        missingInfo: ['source'],
                    });
                }
            });
        }
        else if (sourceInfo && this.isRecord(sourceInfo)) {
            Object.keys(data).forEach(field => {
                totalData++;
                const fieldSourceInfo = sourceInfo[field];
                if (fieldSourceInfo && this.hasCompleteSourceInfo(fieldSourceInfo)) {
                    traceableData++;
                }
                else {
                    const missingInfo = [];
                    if (!fieldSourceInfo) {
                        missingInfo.push('sourceInfo');
                    }
                    else {
                        if (!fieldSourceInfo.sourceId)
                            missingInfo.push('sourceId');
                        if (!fieldSourceInfo.sourceName)
                            missingInfo.push('sourceName');
                        if (!fieldSourceInfo.timestamp)
                            missingInfo.push('timestamp');
                    }
                    untraceableData.push({
                        field,
                        missingInfo,
                    });
                }
            });
        }
        else {
            Object.keys(data).forEach(field => {
                totalData++;
                const value = data[field];
                if (value && typeof value === 'object' && 'source' in value) {
                    const source = value.source;
                    if (this.hasCompleteSourceInfo(source)) {
                        traceableData++;
                    }
                    else {
                        untraceableData.push({
                            field,
                            missingInfo: this.getMissingSourceInfo(source),
                        });
                    }
                }
                else {
                    untraceableData.push({
                        field,
                        missingInfo: ['source'],
                    });
                }
            });
        }
        const currentValue = totalData > 0 ? traceableData / totalData : 0;
        return {
            definition: '数据来源是否清晰可追踪',
            calculation: '有完整来源记录的数据 / 总数据 × 100%',
            target: '100%',
            measurementFrequency: '每周',
            currentValue,
            traceableData,
            totalData,
            untraceableData,
        };
    }
    async assessOverallQuality(data, options = {}) {
        const { requiredFields = [], optionalFields = [], validationRules, referenceData, dataSources, maxAgeSeconds = {}, defaultMaxAgeSeconds = 86400, sourceInfo, weights = {
            completeness: 0.2,
            accuracy: 0.2,
            consistency: 0.2,
            timeliness: 0.2,
            traceability: 0.2,
        }, } = options;
        const completeness = this.assessCompleteness(data, requiredFields, optionalFields);
        const accuracy = this.assessAccuracy(data, validationRules, referenceData);
        let consistency;
        if (dataSources && dataSources.length > 0) {
            consistency = this.assessConsistency(dataSources);
        }
        else {
            consistency = {
                definition: '不同数据源是否协调一致',
                calculation: '一致的数据 / 总数据 × 100%',
                target: '> 95%',
                measurementFrequency: '每日',
                currentValue: 1,
                consistentData: 0,
                totalData: 0,
                inconsistencies: [],
            };
        }
        const timeliness = this.assessTimeliness(data, maxAgeSeconds, defaultMaxAgeSeconds);
        const traceability = this.assessTraceability(data, sourceInfo);
        const overallScore = completeness.currentValue * weights.completeness +
            accuracy.currentValue * weights.accuracy +
            consistency.currentValue * weights.consistency +
            timeliness.currentValue * weights.timeliness +
            traceability.currentValue * weights.traceability;
        let qualityLevel;
        if (overallScore >= 0.9) {
            qualityLevel = 'EXCELLENT';
        }
        else if (overallScore >= 0.75) {
            qualityLevel = 'GOOD';
        }
        else if (overallScore >= 0.6) {
            qualityLevel = 'FAIR';
        }
        else if (overallScore >= 0.4) {
            qualityLevel = 'POOR';
        }
        else {
            qualityLevel = 'CRITICAL';
        }
        const recommendations = [];
        if (completeness.currentValue < 0.95) {
            recommendations.push(`完整性不足：缺失字段 ${completeness.missingFields.join(', ')}`);
        }
        if (accuracy.currentValue < 0.9) {
            recommendations.push(`准确性不足：发现 ${accuracy.errors.length} 个错误`);
        }
        if (consistency.currentValue < 0.95 && consistency.inconsistencies.length > 0) {
            recommendations.push(`一致性不足：发现 ${consistency.inconsistencies.length} 个不一致项`);
        }
        if (timeliness.currentValue < 1 && timeliness.staleData.length > 0) {
            recommendations.push(`时效性不足：${timeliness.staleData.length} 个字段数据过期`);
        }
        if (traceability.currentValue < 1) {
            recommendations.push(`可追溯性不足：${traceability.untraceableData.length} 个字段缺少来源信息`);
        }
        return {
            timestamp: new Date().toISOString(),
            completeness,
            accuracy,
            consistency,
            timeliness,
            traceability,
            overallScore,
            qualityLevel,
            recommendations,
        };
    }
    isFieldMissing(data, field) {
        const value = this.getFieldValue(data, field);
        return value === undefined || value === null || value === '';
    }
    getFieldValue(data, field) {
        if (!data || typeof data !== 'object') {
            return undefined;
        }
        const parts = field.split('.');
        let value = data;
        for (const part of parts) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[part];
        }
        return value;
    }
    valuesMatch(a, b) {
        if (a === b)
            return true;
        if (a === null || a === undefined || b === null || b === undefined)
            return false;
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        if (typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length)
                return false;
            for (const key of keysA) {
                if (!this.valuesMatch(a[key], b[key])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    extractFields(data, fields, prefix = '') {
        if (!data || typeof data !== 'object') {
            return;
        }
        Object.keys(data).forEach(key => {
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            const value = data[key];
            if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                this.extractFields(value, fields, fieldPath);
            }
            else {
                fields.add(fieldPath);
            }
        });
    }
    isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    hasCompleteSourceInfo(sourceInfo) {
        if (!sourceInfo || typeof sourceInfo !== 'object') {
            return false;
        }
        return !!(sourceInfo.sourceId &&
            sourceInfo.sourceName &&
            sourceInfo.timestamp);
    }
    getMissingSourceInfo(sourceInfo) {
        const missing = [];
        if (!sourceInfo || typeof sourceInfo !== 'object') {
            return ['sourceInfo'];
        }
        if (!sourceInfo.sourceId)
            missing.push('sourceId');
        if (!sourceInfo.sourceName)
            missing.push('sourceName');
        if (!sourceInfo.timestamp)
            missing.push('timestamp');
        return missing;
    }
};
exports.DataQualityFrameworkService = DataQualityFrameworkService;
exports.DataQualityFrameworkService = DataQualityFrameworkService = DataQualityFrameworkService_1 = __decorate([
    (0, common_1.Injectable)()
], DataQualityFrameworkService);
//# sourceMappingURL=data-quality-framework.service.js.map