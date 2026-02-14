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
var DataPipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPipelineService = void 0;
const common_1 = require("@nestjs/common");
const data_quality_framework_service_1 = require("../../data-quality/services/data-quality-framework.service");
const data_privacy_framework_service_1 = require("../../data-privacy/services/data-privacy-framework.service");
const data_cleaning_service_1 = require("./data-cleaning.service");
const data_standardization_service_1 = require("./data-standardization.service");
const data_pipeline_interface_1 = require("../interfaces/data-pipeline.interface");
let DataPipelineService = DataPipelineService_1 = class DataPipelineService {
    constructor(dataCleaningService, dataStandardizationService, dataQualityFramework, dataPrivacyFramework) {
        this.dataCleaningService = dataCleaningService;
        this.dataStandardizationService = dataStandardizationService;
        this.dataQualityFramework = dataQualityFramework;
        this.dataPrivacyFramework = dataPrivacyFramework;
        this.logger = new common_1.Logger(DataPipelineService_1.name);
    }
    async dataCollectionPipeline(collectionTasks) {
        this.logger.log('Starting data collection pipeline');
        const defaultTasks = {
            userData: { frequency: 'on_change', source: 'user_input' },
            routeData: { frequency: 'daily', source: 'internal_db' },
            weatherData: { frequency: '3_hours', source: 'weather_api' },
            crowdData: { frequency: '30_minutes', source: 'crowd_sensor' },
        };
        const tasks = collectionTasks || defaultTasks;
        const collectedData = {};
        for (const [taskName, taskConfig] of Object.entries(tasks)) {
            try {
                const rawData = await this.fetchData(taskConfig.source, taskConfig.frequency);
                const validated = await this.validateSchema(rawData, taskName);
                if (validated.valid) {
                    collectedData[taskName] = {
                        rawData,
                        collectedAt: new Date(),
                        source: taskConfig.source,
                        metadata: {
                            frequency: taskConfig.frequency,
                            sourceId: taskConfig.sourceId,
                            config: taskConfig.config,
                        },
                    };
                }
                else {
                    this.logger.warn(`Validation failed for ${taskName}:`, validated.errors);
                    await this.logValidationError(taskName, validated);
                }
            }
            catch (error) {
                this.logger.error(`Failed to collect data for ${taskName}:`, error);
            }
        }
        this.logger.log(`Data collection completed: ${Object.keys(collectedData).length} tasks succeeded`);
        return collectedData;
    }
    async dataProcessingPipeline(rawData) {
        this.logger.log('Starting data processing pipeline');
        const cleanedData = await this.cleanData(rawData);
        const standardizedData = await this.standardizeData(cleanedData);
        return {
            cleaned: cleanedData,
            standardized: standardizedData,
            processedAt: new Date(),
            metadata: {
                sourceCount: Object.keys(rawData).length,
                processingSteps: ['cleaning', 'standardization'],
            },
        };
    }
    async dataApplicationPipeline(processedData) {
        this.logger.log('Starting data application pipeline');
        const inferenceData = this.extractInferenceFeatures(processedData);
        await this.sendToInferenceEngine(inferenceData);
        const riskData = this.extractRiskFeatures(processedData);
        await this.sendToRiskSystem(riskData);
        const decisionData = this.extractDecisionFeatures(processedData);
        await this.sendToDecisionSystem(decisionData);
        const uiData = this.prepareUIData(processedData);
        await this.sendToUI(uiData);
        await this.logDecisionData(processedData);
    }
    async processDataFlow(userInput, collectionTasks) {
        this.logger.log('Starting complete data flow processing');
        const rawData = await this.dataCollectionPipeline(collectionTasks);
        if (this.dataQualityFramework) {
            const qualityCheck = await this.dataQualityFramework.assessOverallQuality(rawData, {
                requiredFields: [],
            });
            if (qualityCheck.overallScore < 0.8) {
                this.logger.warn(`Data quality below threshold: ${qualityCheck.overallScore}`);
                throw new data_pipeline_interface_1.DataQualityException('数据质量不达标', qualityCheck);
            }
        }
        const processedData = await this.dataProcessingPipeline(rawData);
        await this.dataApplicationPipeline(processedData);
        return processedData;
    }
    async fetchData(source, frequency) {
        this.logger.debug(`Fetching data from ${source} with frequency ${frequency}`);
        return {
            source,
            frequency,
            timestamp: new Date().toISOString(),
            data: {},
        };
    }
    async validateSchema(data, taskName) {
        const errors = [];
        const warnings = [];
        if (!data) {
            errors.push({
                field: 'root',
                message: 'Data is null or undefined',
                code: 'MISSING_DATA',
            });
        }
        if (taskName === 'userData' && !data.userId) {
            errors.push({
                field: 'userId',
                message: 'User ID is required',
                code: 'MISSING_FIELD',
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    async logValidationError(taskName, validation) {
        this.logger.error(`Validation error for ${taskName}:`, validation.errors);
    }
    async cleanData(rawData) {
        const combinedData = {};
        for (const [taskName, taskData] of Object.entries(rawData)) {
            combinedData[taskName] = taskData.rawData;
        }
        const cleaned = await this.dataCleaningService.cleanData(combinedData);
        return cleaned;
    }
    async standardizeData(cleanedData) {
        const standardized = await this.dataStandardizationService.standardizeData(cleanedData);
        return standardized;
    }
    extractInferenceFeatures(processedData) {
        return {
            standardized: processedData.standardized.units,
            metadata: processedData.metadata,
        };
    }
    extractRiskFeatures(processedData) {
        return {
            cleaned: processedData.cleaned,
            metadata: processedData.metadata,
        };
    }
    extractDecisionFeatures(processedData) {
        return {
            standardized: processedData.standardized,
            metadata: processedData.metadata,
        };
    }
    prepareUIData(processedData) {
        return {
            data: processedData.standardized.units,
            processedAt: processedData.processedAt,
        };
    }
    async sendToInferenceEngine(data) {
        this.logger.debug('Sending data to inference engine');
    }
    async sendToRiskSystem(data) {
        this.logger.debug('Sending data to risk system');
    }
    async sendToDecisionSystem(data) {
        this.logger.debug('Sending data to decision system');
    }
    async sendToUI(data) {
        this.logger.debug('Sending data to UI');
    }
    async logDecisionData(processedData) {
        this.logger.debug('Logging decision data');
    }
    createPipelineDefinition(name, steps, description) {
        const pipelineId = `pipeline_${Date.now()}`;
        const pipelineSteps = steps.map((step, index) => ({
            ...step,
            id: `step_${index}_${Date.now()}`,
            status: 'PENDING',
            retryConfig: step.retryConfig || {
                maxRetries: 3,
                retryDelay: 1000,
                backoffMultiplier: 2,
            },
            timeout: step.timeout || 30000,
            errorHandler: step.errorHandler || 'RETRY',
        }));
        return {
            id: pipelineId,
            name,
            description,
            steps: pipelineSteps,
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: '1.0.0',
            },
        };
    }
    async executePipeline(definition, inputData, monitoringConfig) {
        const executionId = `exec_${Date.now()}`;
        const startTime = new Date().toISOString();
        this.logger.log(`Executing pipeline: ${definition.name} (${executionId})`);
        const executionState = {
            executionId,
            pipelineId: definition.id,
            status: 'RUNNING',
            stepStates: new Map(),
            startTime,
            errors: [],
            metrics: {
                totalSteps: definition.steps.length,
                completedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                totalDuration: 0,
                stepDurations: {},
            },
        };
        let currentData = inputData;
        let outputData;
        try {
            const executionOrder = this.resolveExecutionOrder(definition.steps);
            for (const stepId of executionOrder) {
                const step = definition.steps.find(s => s.id === stepId);
                if (!step)
                    continue;
                executionState.currentStepId = stepId;
                executionState.stepStates.set(stepId, 'RUNNING');
                const stepStartTime = Date.now();
                try {
                    currentData = await this.executePipelineStep(step, currentData);
                    executionState.stepStates.set(stepId, 'COMPLETED');
                    executionState.metrics.completedSteps++;
                    executionState.metrics.stepDurations[stepId] = Date.now() - stepStartTime;
                }
                catch (error) {
                    executionState.stepStates.set(stepId, 'FAILED');
                    executionState.metrics.failedSteps++;
                    executionState.metrics.stepDurations[stepId] = Date.now() - stepStartTime;
                    executionState.errors.push({
                        stepId,
                        error: error.message || String(error),
                        timestamp: new Date().toISOString(),
                    });
                    const shouldContinue = await this.handlePipelineStepError(step, error, executionState, definition);
                    if (!shouldContinue) {
                        executionState.status = 'FAILED';
                        break;
                    }
                }
            }
            executionState.status = executionState.metrics.failedSteps === 0 ? 'COMPLETED' : 'FAILED';
            executionState.endTime = new Date().toISOString();
            executionState.metrics.totalDuration =
                new Date(executionState.endTime).getTime() - new Date(executionState.startTime).getTime();
            if (currentData && typeof currentData === 'object' && 'processedAt' in currentData) {
                outputData = currentData;
            }
            const qualityMetrics = outputData
                ? await this.calculatePipelineQualityMetrics(outputData)
                : undefined;
            const recommendations = this.generatePipelineRecommendations(executionState, qualityMetrics);
            const resultStatus = executionState.status === 'COMPLETED' && executionState.metrics.failedSteps === 0
                ? 'SUCCESS'
                : executionState.metrics.completedSteps > 0
                    ? 'PARTIAL_SUCCESS'
                    : 'FAILED';
            return {
                executionId,
                pipelineId: definition.id,
                status: resultStatus,
                output: outputData,
                executionState,
                qualityMetrics,
                recommendations,
            };
        }
        catch (error) {
            this.logger.error(`Pipeline execution failed: ${error.message}`, error.stack);
            executionState.status = 'FAILED';
            executionState.endTime = new Date().toISOString();
            return {
                executionId,
                pipelineId: definition.id,
                status: 'FAILED',
                executionState,
                recommendations: [`管道执行失败: ${error.message}`],
            };
        }
    }
    resolveExecutionOrder(steps) {
        const order = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (stepId) => {
            if (visiting.has(stepId)) {
                throw new Error(`Circular dependency detected: ${stepId}`);
            }
            if (visited.has(stepId))
                return;
            visiting.add(stepId);
            const step = steps.find(s => s.id === stepId);
            if (step === null || step === void 0 ? void 0 : step.dependencies) {
                for (const depId of step.dependencies) {
                    visit(depId);
                }
            }
            visiting.delete(stepId);
            visited.add(stepId);
            order.push(stepId);
        };
        for (const step of steps) {
            if (!visited.has(step.id)) {
                visit(step.id);
            }
        }
        return order;
    }
    async executePipelineStep(step, inputData) {
        const timeout = step.timeout || 30000;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Step ${step.name} timeout`)), timeout);
        });
        const stepPromise = (async () => {
            switch (step.type) {
                case 'COLLECT':
                    return await this.dataCollectionPipeline(step.config);
                case 'VALIDATE':
                    return await this.validateSchema(inputData, step.name);
                case 'CLEAN':
                    return await this.dataCleaningService.cleanData(inputData);
                case 'STANDARDIZE':
                    return await this.dataStandardizationService.standardizeData(inputData);
                case 'APPLY':
                    return await this.dataApplicationPipeline(inputData);
                default:
                    return inputData;
            }
        })();
        return await Promise.race([stepPromise, timeoutPromise]);
    }
    async handlePipelineStepError(step, error, executionState, definition) {
        var _a, _b, _c;
        const lastError = executionState.errors[executionState.errors.length - 1];
        const retryCount = ((lastError === null || lastError === void 0 ? void 0 : lastError.retryCount) || 0) + 1;
        switch (step.errorHandler) {
            case 'ABORT':
                return false;
            case 'SKIP':
                executionState.stepStates.set(step.id, 'SKIPPED');
                executionState.metrics.skippedSteps++;
                return true;
            case 'RETRY':
                if (retryCount <= (((_a = step.retryConfig) === null || _a === void 0 ? void 0 : _a.maxRetries) || 3)) {
                    const delay = (((_b = step.retryConfig) === null || _b === void 0 ? void 0 : _b.retryDelay) || 1000) *
                        Math.pow(((_c = step.retryConfig) === null || _c === void 0 ? void 0 : _c.backoffMultiplier) || 2, retryCount - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    if (lastError)
                        lastError.retryCount = retryCount;
                    return true;
                }
                return false;
            case 'FALLBACK':
                if (step.fallbackStepId) {
                    const fallbackStep = definition.steps.find(s => s.id === step.fallbackStepId);
                    if (fallbackStep) {
                        executionState.stepStates.set(step.id, 'SKIPPED');
                        executionState.metrics.skippedSteps++;
                        return true;
                    }
                }
                return false;
            default:
                return false;
        }
    }
    async calculatePipelineQualityMetrics(processedData) {
        if (!this.dataQualityFramework) {
            return undefined;
        }
        const assessment = await this.dataQualityFramework.assessOverallQuality(processedData);
        return {
            overallScore: assessment.overallScore,
            completeness: assessment.completeness.currentValue,
            accuracy: assessment.accuracy.currentValue,
            timeliness: assessment.timeliness.currentValue,
        };
    }
    generatePipelineRecommendations(executionState, qualityMetrics) {
        const recommendations = [];
        if (executionState.metrics.failedSteps > 0) {
            recommendations.push(`有 ${executionState.metrics.failedSteps} 个步骤失败，建议检查错误日志`);
        }
        if (qualityMetrics && qualityMetrics.overallScore < 0.7) {
            recommendations.push(`数据质量较低（${(qualityMetrics.overallScore * 100).toFixed(1)}%），建议改进数据源`);
        }
        return recommendations;
    }
};
exports.DataPipelineService = DataPipelineService;
exports.DataPipelineService = DataPipelineService = DataPipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [data_cleaning_service_1.DataCleaningService,
        data_standardization_service_1.DataStandardizationService,
        data_quality_framework_service_1.DataQualityFrameworkService,
        data_privacy_framework_service_1.DataPrivacyFrameworkService])
], DataPipelineService);
//# sourceMappingURL=data-pipeline.service.js.map