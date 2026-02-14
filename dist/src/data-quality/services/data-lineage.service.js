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
var DataLineageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataLineageService = void 0;
const common_1 = require("@nestjs/common");
const source_annotation_service_1 = require("./source-annotation.service");
let DataLineageService = DataLineageService_1 = class DataLineageService {
    constructor(sourceAnnotationService) {
        this.sourceAnnotationService = sourceAnnotationService;
        this.logger = new common_1.Logger(DataLineageService_1.name);
    }
    async traceLineage(finalOutput, context) {
        this.logger.log('Tracing data lineage for final output');
        const dataSources = {};
        if (context === null || context === void 0 ? void 0 : context.dataSources) {
            for (const [sourceId, sourceData] of Object.entries(context.dataSources)) {
                const annotated = await this.sourceAnnotationService.annotateAllInformation(sourceData);
                const firstAnnotated = Object.values(annotated.annotatedData)[0];
                if (firstAnnotated) {
                    const sourceInfo = firstAnnotated.source;
                    dataSources[sourceId] = {
                        sourceId,
                        type: sourceInfo.type,
                        data: this.summarizeData(sourceData),
                        reliability: sourceInfo.confidence,
                        freshness: this.calculateFreshness(sourceInfo.timestamp, sourceInfo.expiry),
                        sourceInfo,
                        metadata: {
                            totalFields: annotated.statistics.totalFields,
                            annotatedFields: annotated.statistics.annotatedFields,
                        },
                    };
                }
                else {
                    dataSources[sourceId] = {
                        sourceId,
                        type: 'UNKNOWN',
                        data: this.summarizeData(sourceData),
                        reliability: 0.5,
                        freshness: {
                            timestamp: new Date().toISOString(),
                            age: '未知',
                            isStale: false,
                        },
                        sourceInfo: this.createDefaultSourceInfo(sourceId),
                    };
                }
            }
        }
        const processingSteps = [];
        if (context === null || context === void 0 ? void 0 : context.processingHistory) {
            let stepNumber = 1;
            for (const historyItem of context.processingHistory) {
                const inputSourceIds = this.inferInputSourceIds(historyItem.input, dataSources);
                processingSteps.push({
                    step: stepNumber++,
                    operation: historyItem.operation,
                    input: inputSourceIds,
                    output: this.summarizeData(historyItem.output),
                    method: historyItem.method,
                    parameters: historyItem.parameters,
                    timestamp: historyItem.timestamp || new Date().toISOString(),
                    duration: historyItem.duration,
                    dependencies: stepNumber > 1 ? [stepNumber - 2] : undefined,
                });
            }
        }
        const confidence = this.calculateFinalConfidence(dataSources, processingSteps);
        const lineageTree = {
            dataSources,
            processingSteps,
            finalOutput: this.summarizeData(finalOutput),
            confidence,
            assumptions: (context === null || context === void 0 ? void 0 : context.assumptions) || this.generateDefaultAssumptions(dataSources),
            limitations: (context === null || context === void 0 ? void 0 : context.limitations) || this.generateDefaultLimitations(dataSources),
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: '1.0',
            },
        };
        this.logger.log(`Data lineage traced: ${Object.keys(dataSources).length} sources, ${processingSteps.length} steps`);
        return lineageTree;
    }
    async generateUserFriendlyExplanation(lineage, options) {
        this.logger.log('Generating user-friendly explanation for lineage');
        const summary = this.generateSummary(lineage);
        const detailedExplanation = this.generateDetailedExplanation(lineage, options);
        const sourceExplanation = this.generateSourceExplanation(lineage);
        const processExplanation = this.generateProcessExplanation(lineage);
        const confidenceExplanation = this.generateConfidenceExplanation(lineage);
        const visualization = (options === null || options === void 0 ? void 0 : options.generateExplanation)
            ? this.generateVisualization(lineage)
            : undefined;
        return {
            summary,
            detailedExplanation,
            sourceExplanation,
            processExplanation,
            confidenceExplanation,
            visualization,
        };
    }
    async queryLineage(outputValue, options) {
        const lineage = await this.traceLineage(outputValue);
        const explanation = (options === null || options === void 0 ? void 0 : options.generateExplanation)
            ? await this.generateUserFriendlyExplanation(lineage, options)
            : undefined;
        return { lineage, explanation };
    }
    summarizeData(data) {
        if (data === null || data === undefined) {
            return null;
        }
        if (typeof data === 'string') {
            return data.length > 100 ? data.substring(0, 100) + '...' : data;
        }
        if (typeof data === 'number' || typeof data === 'boolean') {
            return data;
        }
        if (Array.isArray(data)) {
            return {
                type: 'array',
                length: data.length,
                sample: data.slice(0, 3),
            };
        }
        if (typeof data === 'object') {
            const keys = Object.keys(data);
            return {
                type: 'object',
                keys: keys.slice(0, 10),
                keyCount: keys.length,
                sample: Object.fromEntries(Object.entries(data)
                    .slice(0, 3)
                    .map(([k, v]) => [k, this.summarizeData(v)])),
            };
        }
        return String(data).substring(0, 100);
    }
    calculateFreshness(timestamp, expiry) {
        const timestampDate = new Date(timestamp);
        const now = new Date();
        const ageMs = now.getTime() - timestampDate.getTime();
        let age;
        if (ageMs < 60000) {
            age = '刚刚';
        }
        else if (ageMs < 3600000) {
            age = `${Math.floor(ageMs / 60000)}分钟前`;
        }
        else if (ageMs < 86400000) {
            age = `${Math.floor(ageMs / 3600000)}小时前`;
        }
        else {
            age = `${Math.floor(ageMs / 86400000)}天前`;
        }
        let isStale = false;
        if (expiry) {
            const expiryDate = new Date(expiry);
            isStale = now.getTime() > expiryDate.getTime();
        }
        else {
            isStale = ageMs > 7 * 24 * 3600000;
        }
        return {
            timestamp,
            age,
            isStale,
        };
    }
    createDefaultSourceInfo(sourceId) {
        return {
            type: 'OTHER',
            timestamp: new Date().toISOString(),
            reliability: 'MEDIUM',
            source: 'DATABASE',
            sourceName: sourceId,
            confidence: 0.5,
            verificationLevel: 'D_PENDING',
            isFactual: false,
        };
    }
    inferInputSourceIds(input, dataSources) {
        const sourceIds = [];
        for (const [sourceId, sourceNode] of Object.entries(dataSources)) {
            if (this.dataMatches(input, sourceNode.data)) {
                sourceIds.push(sourceId);
            }
        }
        if (sourceIds.length === 0 && input.length > 0) {
            const tempId = `temp_${Date.now()}`;
            sourceIds.push(tempId);
        }
        return sourceIds;
    }
    dataMatches(input, sourceData) {
        return input.some(item => {
            if (typeof item === 'object' && typeof sourceData === 'object') {
                const itemKeys = Object.keys(item || {});
                const sourceKeys = Object.keys(sourceData || {});
                return itemKeys.some(k => sourceKeys.includes(k));
            }
            return false;
        });
    }
    calculateFinalConfidence(dataSources, processingSteps) {
        if (Object.keys(dataSources).length === 0) {
            return 0.5;
        }
        const sourceReliabilities = Object.values(dataSources).map(s => s.reliability);
        const avgSourceReliability = sourceReliabilities.reduce((a, b) => a + b, 0) / sourceReliabilities.length;
        const stepPenalty = Math.min(0.1, processingSteps.length * 0.01);
        return Math.max(0, Math.min(1, avgSourceReliability - stepPenalty));
    }
    generateDefaultAssumptions(dataSources) {
        const assumptions = [
            '数据来源信息准确',
            '数据处理方法正确',
            '环境条件在预测范围内',
        ];
        for (const source of Object.values(dataSources)) {
            if (source.sourceInfo.verificationLevel === 'D_PENDING') {
                assumptions.push(`数据源"${source.sourceId}"待验证`);
            }
            if (source.freshness.isStale) {
                assumptions.push(`数据源"${source.sourceId}"可能已过期`);
            }
        }
        return assumptions;
    }
    generateDefaultLimitations(dataSources) {
        const limitations = [
            '预测基于历史数据和当前信息，实际结果可能有所不同',
            '数据质量可能影响结果准确性',
        ];
        for (const source of Object.values(dataSources)) {
            if (source.reliability < 0.7) {
                limitations.push(`数据源"${source.sourceId}"可靠性较低`);
            }
            if (source.sourceInfo.verificationLevel === 'E_LLM_GENERATED') {
                limitations.push(`数据源"${source.sourceId}"包含AI生成内容`);
            }
        }
        return limitations;
    }
    generateSummary(lineage) {
        const sourceCount = Object.keys(lineage.dataSources).length;
        const stepCount = lineage.processingSteps.length;
        const confidencePercent = Math.round(lineage.confidence * 100);
        return `此结果基于${sourceCount}个数据源，经过${stepCount}个处理步骤生成，置信度为${confidencePercent}%。`;
    }
    generateDetailedExplanation(lineage, options) {
        const parts = [];
        parts.push('## 数据来源');
        for (const [sourceId, source] of Object.entries(lineage.dataSources)) {
            parts.push(`- **${sourceId}**：${source.type}（可靠性：${Math.round(source.reliability * 100)}%）`);
            if (source.freshness.isStale) {
                parts.push(`  - ⚠️ 数据可能已过期（${source.freshness.age}）`);
            }
        }
        if ((options === null || options === void 0 ? void 0 : options.includeSteps) !== false) {
            parts.push('\n## 处理步骤');
            for (const step of lineage.processingSteps) {
                parts.push(`${step.step}. **${step.operation}**：使用${step.method}方法处理，输入来自${step.input.join('、')}`);
                if (step.duration) {
                    parts.push(`   - 耗时：${step.duration}ms`);
                }
            }
        }
        if (lineage.assumptions.length > 0) {
            parts.push('\n## 假设');
            lineage.assumptions.forEach(a => parts.push(`- ${a}`));
        }
        if (lineage.limitations.length > 0) {
            parts.push('\n## 限制');
            lineage.limitations.forEach(l => parts.push(`- ${l}`));
        }
        return parts.join('\n');
    }
    generateSourceExplanation(lineage) {
        const sources = Object.values(lineage.dataSources);
        if (sources.length === 0) {
            return '无数据来源信息';
        }
        const sourceDescriptions = sources.map(source => {
            const reliabilityText = source.reliability >= 0.9
                ? '高'
                : source.reliability >= 0.7
                    ? '中'
                    : '低';
            return `- ${source.sourceId}（${source.type}，可靠性${reliabilityText}）`;
        });
        return `数据来自以下${sources.length}个来源：\n${sourceDescriptions.join('\n')}`;
    }
    generateProcessExplanation(lineage) {
        if (lineage.processingSteps.length === 0) {
            return '无处理步骤记录';
        }
        const stepDescriptions = lineage.processingSteps.map(step => {
            return `${step.step}. ${step.operation}（${step.method}）`;
        });
        return `数据经过以下${lineage.processingSteps.length}个处理步骤：\n${stepDescriptions.join('\n')}`;
    }
    generateConfidenceExplanation(lineage) {
        const confidencePercent = Math.round(lineage.confidence * 100);
        let confidenceLevel;
        if (lineage.confidence >= 0.9) {
            confidenceLevel = '高';
        }
        else if (lineage.confidence >= 0.7) {
            confidenceLevel = '中';
        }
        else if (lineage.confidence >= 0.5) {
            confidenceLevel = '中等偏低';
        }
        else {
            confidenceLevel = '低';
        }
        const factors = [];
        const avgReliability = Object.values(lineage.dataSources).reduce((sum, s) => sum + s.reliability, 0) /
            Math.max(1, Object.keys(lineage.dataSources).length);
        if (avgReliability < 0.7) {
            factors.push('数据源可靠性较低');
        }
        if (lineage.processingSteps.length > 5) {
            factors.push('处理步骤较多，可能引入误差');
        }
        const staleSources = Object.values(lineage.dataSources).filter(s => s.freshness.isStale);
        if (staleSources.length > 0) {
            factors.push(`${staleSources.length}个数据源可能已过期`);
        }
        let explanation = `置信度为${confidencePercent}%（${confidenceLevel}）`;
        if (factors.length > 0) {
            explanation += `。影响因素：${factors.join('、')}`;
        }
        return explanation;
    }
    generateVisualization(lineage) {
        const treeData = {
            root: {
                name: '最终输出',
                value: lineage.finalOutput,
                confidence: lineage.confidence,
                children: lineage.processingSteps.map(step => ({
                    name: step.operation,
                    method: step.method,
                    children: step.input.map(inputId => {
                        const source = lineage.dataSources[inputId];
                        return source
                            ? {
                                name: source.sourceId,
                                type: source.type,
                                reliability: source.reliability,
                            }
                            : { name: inputId, type: 'UNKNOWN' };
                    }),
                })),
            },
        };
        return {
            type: 'TREE',
            data: treeData,
        };
    }
};
exports.DataLineageService = DataLineageService;
exports.DataLineageService = DataLineageService = DataLineageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [source_annotation_service_1.SourceAnnotationService])
], DataLineageService);
//# sourceMappingURL=data-lineage.service.js.map