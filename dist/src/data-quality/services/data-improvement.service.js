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
var DataImprovementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataImprovementService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const data_quality_framework_service_1 = require("./data-quality-framework.service");
const learning_service_1 = require("../../trips/decision/learning/learning.service");
let DataImprovementService = DataImprovementService_1 = class DataImprovementService {
    constructor(prisma, dataQualityFramework, learningService) {
        this.prisma = prisma;
        this.dataQualityFramework = dataQualityFramework;
        this.learningService = learningService;
        this.logger = new common_1.Logger(DataImprovementService_1.name);
    }
    async continuousImprovementLoop(cycleId) {
        this.logger.log(`Starting continuous improvement loop${cycleId ? ` (cycle: ${cycleId})` : ''}`);
        const cycleState = {
            cycleId: cycleId || `cycle_${Date.now()}`,
            phase: 'COLLECT_FEEDBACK',
            startTime: new Date().toISOString(),
            currentMetrics: {},
            problems: [],
            improvementDirections: [],
            implementations: [],
            validations: [],
        };
        await this.collectFeedback(cycleState);
        await this.analyzeProblems(cycleState);
        await this.determineImprovementDirections(cycleState);
        await this.implementImprovements(cycleState);
        await this.validateImprovements(cycleState);
        const improvementReport = this.generateImprovementReport(cycleState);
        const overallImprovement = this.calculateOverallImprovement(cycleState);
        const nextActions = this.generateNextActions(cycleState, overallImprovement);
        return {
            cycleState,
            overallImprovement,
            nextActions,
            improvementReport,
        };
    }
    async measureImprovementMetrics() {
        this.logger.log('Measuring improvement metrics');
        const metrics = {
            USER_SATISFACTION: await this.measureUserSatisfaction(),
            PREDICTION_ACCURACY: await this.measurePredictionAccuracy(),
            DECISION_QUALITY: await this.measureDecisionQuality(),
            DATA_QUALITY: await this.measureDataQuality(),
            SYSTEM_RELIABILITY: await this.measureSystemReliability(),
        };
        return metrics;
    }
    async validateImprovementEffect(implementationId, validationMethod) {
        this.logger.log(`Validating improvement effect for implementation ${implementationId}`);
        const implementation = await this.getImplementation(implementationId);
        if (!implementation) {
            throw new Error(`Implementation ${implementationId} not found`);
        }
        const metricsBefore = await this.getMetricsBeforeImplementation(implementationId);
        const metricsAfter = await this.measureImprovementMetrics();
        const metricImprovements = {};
        for (const metricType of Object.keys(metricsBefore)) {
            const before = metricsBefore[metricType].currentValue;
            const after = metricsAfter[metricType].currentValue;
            const improvement = after - before;
            const significant = Math.abs(improvement) > 0.05;
            metricImprovements[metricType] = {
                before,
                after,
                improvement,
                significant,
            };
        }
        const conclusion = this.determineValidationConclusion(metricImprovements);
        const explanation = this.generateValidationExplanation(metricImprovements, conclusion);
        const recommendations = this.generateValidationRecommendations(metricImprovements, conclusion);
        return {
            validationId: `validation_${Date.now()}`,
            implementationId,
            validationTime: new Date().toISOString(),
            validationMethod,
            metricImprovements,
            conclusion,
            explanation,
            recommendations,
        };
    }
    async collectFeedback(cycleState) {
        this.logger.log('Phase 1: Collecting feedback');
        cycleState.phase = 'COLLECT_FEEDBACK';
        const userFeedback = await this.collectUserFeedback();
        const systemMetrics = await this.collectSystemMetrics();
        const dataQualityFeedback = await this.collectDataQualityFeedback();
        cycleState.currentMetrics = await this.measureImprovementMetrics();
        this.logger.log(`Collected feedback: ${userFeedback.length} user feedbacks, ${systemMetrics.length} system metrics`);
    }
    async analyzeProblems(cycleState) {
        this.logger.log('Phase 2: Analyzing problems');
        cycleState.phase = 'ANALYZE_PROBLEMS';
        const problems = [];
        for (const [metricType, metric] of Object.entries(cycleState.currentMetrics)) {
            if (metric.currentValue < metric.targetValue) {
                const gap = metric.targetValue - metric.currentValue;
                problems.push({
                    problemId: `problem_${metricType}_${Date.now()}`,
                    description: `${metric.name}低于目标值（当前：${Math.round(metric.currentValue * 100)}%，目标：${Math.round(metric.targetValue * 100)}%）`,
                    severity: gap > 0.3 ? 'CRITICAL' : gap > 0.2 ? 'HIGH' : gap > 0.1 ? 'MEDIUM' : 'LOW',
                    affectedMetrics: [metricType],
                    rootCauses: this.identifyRootCauses(metricType, metric),
                    impact: this.assessImpact(metricType, gap),
                    frequency: this.calculateFrequency(metricType),
                });
            }
            if (metric.trend === 'DECLINING') {
                problems.push({
                    problemId: `problem_${metricType}_declining_${Date.now()}`,
                    description: `${metric.name}呈下降趋势`,
                    severity: 'MEDIUM',
                    affectedMetrics: [metricType],
                    rootCauses: ['需要分析下降原因'],
                    impact: ['可能影响用户体验'],
                    frequency: 0.5,
                });
            }
        }
        cycleState.problems = problems;
        this.logger.log(`Identified ${problems.length} problems`);
    }
    async determineImprovementDirections(cycleState) {
        this.logger.log('Phase 3: Determining improvement directions');
        cycleState.phase = 'DETERMINE_DIRECTIONS';
        const directions = [];
        for (const problem of cycleState.problems) {
            const improvementDirections = this.generateImprovementDirectionsForProblem(problem);
            directions.push(...improvementDirections);
        }
        directions.sort((a, b) => {
            const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        cycleState.improvementDirections = directions;
        this.logger.log(`Determined ${directions.length} improvement directions`);
    }
    async implementImprovements(cycleState) {
        this.logger.log('Phase 4: Implementing improvements');
        cycleState.phase = 'IMPLEMENT';
        const implementations = [];
        const highPriorityDirections = cycleState.improvementDirections.filter(d => d.priority === 'HIGH');
        for (const direction of highPriorityDirections.slice(0, 3)) {
            const implementation = {
                implementationId: `impl_${direction.improvementId}_${Date.now()}`,
                improvementId: direction.improvementId,
                startTime: new Date().toISOString(),
                status: 'PLANNED',
                changes: [direction.description],
                implementedBy: 'system',
            };
            implementations.push(implementation);
        }
        cycleState.implementations = implementations;
        this.logger.log(`Planned ${implementations.length} improvements`);
    }
    async validateImprovements(cycleState) {
        this.logger.log('Phase 5: Validating improvements');
        cycleState.phase = 'VALIDATE';
        const validations = [];
        for (const implementation of cycleState.implementations.filter(i => i.status === 'COMPLETED')) {
            try {
                const validation = await this.validateImprovementEffect(implementation.implementationId, 'BEFORE_AFTER');
                validations.push(validation);
            }
            catch (error) {
                this.logger.warn(`Failed to validate implementation ${implementation.implementationId}: ${error}`);
            }
        }
        cycleState.validations = validations;
        this.logger.log(`Validated ${validations.length} improvements`);
    }
    async measureUserSatisfaction() {
        const recentLogs = await this.getRecentDecisionLogs(30);
        const feedbacks = await this.getUserFeedbacks(recentLogs.map(l => l.id));
        let totalSatisfaction = 0;
        let satisfactionCount = 0;
        for (const feedback of feedbacks) {
            if (feedback.satisfaction !== null && feedback.satisfaction !== undefined) {
                totalSatisfaction += feedback.satisfaction;
                satisfactionCount++;
            }
        }
        const currentValue = satisfactionCount > 0 ? totalSatisfaction / satisfactionCount / 10 : 0.7;
        const history = await this.getMetricHistory('USER_SATISFACTION', 30);
        return {
            type: 'USER_SATISFACTION',
            name: '用户满意度',
            currentValue,
            targetValue: 0.85,
            history,
            trend: this.calculateTrend(history),
            improvementPotential: Math.max(0, 0.85 - currentValue),
        };
    }
    async measurePredictionAccuracy() {
        const outcomes = await this.getDecisionOutcomes(30);
        let accuratePredictions = 0;
        let totalPredictions = 0;
        for (const outcome of outcomes) {
            if (outcome.expectedOutcome && outcome.actualOutcome) {
                totalPredictions++;
                const accuracy = this.compareOutcomes(outcome.expectedOutcome, outcome.actualOutcome);
                if (accuracy > 0.7) {
                    accuratePredictions++;
                }
            }
        }
        const currentValue = totalPredictions > 0 ? accuratePredictions / totalPredictions : 0.75;
        const history = await this.getMetricHistory('PREDICTION_ACCURACY', 30);
        return {
            type: 'PREDICTION_ACCURACY',
            name: '预测准确度',
            currentValue,
            targetValue: 0.8,
            history,
            trend: this.calculateTrend(history),
            improvementPotential: Math.max(0, 0.8 - currentValue),
        };
    }
    async measureDecisionQuality() {
        const recentLogs = await this.getRecentDecisionLogs(30);
        const qualityScores = recentLogs.map(log => this.calculateDecisionQualityScore(log));
        const currentValue = qualityScores.length > 0
            ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
            : 0.75;
        const history = await this.getMetricHistory('DECISION_QUALITY', 30);
        return {
            type: 'DECISION_QUALITY',
            name: '决策质量',
            currentValue,
            targetValue: 0.8,
            history,
            trend: this.calculateTrend(history),
            improvementPotential: Math.max(0, 0.8 - currentValue),
        };
    }
    async measureDataQuality() {
        const sampleData = await this.getSampleData();
        const qualityAssessment = await this.dataQualityFramework.assessOverallQuality(sampleData);
        const currentValue = qualityAssessment.overallScore;
        const history = await this.getMetricHistory('DATA_QUALITY', 30);
        return {
            type: 'DATA_QUALITY',
            name: '数据质量',
            currentValue,
            targetValue: 0.9,
            history,
            trend: this.calculateTrend(history),
            improvementPotential: Math.max(0, 0.9 - currentValue),
        };
    }
    async measureSystemReliability() {
        const errors = await this.getSystemErrors(30);
        const totalRequests = await this.getTotalRequests(30);
        const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0;
        const currentValue = 1 - errorRate;
        const history = await this.getMetricHistory('SYSTEM_RELIABILITY', 30);
        return {
            type: 'SYSTEM_RELIABILITY',
            name: '系统可靠性',
            currentValue: Math.max(0, currentValue),
            targetValue: 0.95,
            history,
            trend: this.calculateTrend(history),
            improvementPotential: Math.max(0, 0.95 - currentValue),
        };
    }
    async collectUserFeedback() {
        try {
            const feedbacks = await this.prisma.tripOutcomeFeedback.findMany({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    },
                },
                take: 100,
            });
            return feedbacks;
        }
        catch (error) {
            this.logger.warn(`Failed to collect user feedback: ${error}`);
            return [];
        }
    }
    async collectSystemMetrics() {
        return [];
    }
    async collectDataQualityFeedback() {
        return [];
    }
    identifyRootCauses(metricType, metric) {
        const causes = [];
        if (metric.trend === 'DECLINING') {
            causes.push('指标呈下降趋势，需要分析原因');
        }
        if (metric.currentValue < metric.targetValue) {
            const gap = metric.targetValue - metric.currentValue;
            if (gap > 0.2) {
                causes.push('指标与目标值差距较大');
            }
        }
        switch (metricType) {
            case 'USER_SATISFACTION':
                causes.push('用户反馈数据不足', '预测准确性影响满意度');
                break;
            case 'PREDICTION_ACCURACY':
                causes.push('预测模型需要优化', '训练数据质量不足');
                break;
            case 'DATA_QUALITY':
                causes.push('数据源可靠性问题', '数据更新不及时');
                break;
        }
        return causes;
    }
    assessImpact(metricType, gap) {
        const impacts = [];
        switch (metricType) {
            case 'USER_SATISFACTION':
                impacts.push('用户体验下降', '用户流失风险增加');
                break;
            case 'PREDICTION_ACCURACY':
                impacts.push('决策质量下降', '用户信任度降低');
                break;
            case 'DATA_QUALITY':
                impacts.push('决策依据不可靠', '系统输出质量下降');
                break;
            case 'SYSTEM_RELIABILITY':
                impacts.push('系统稳定性问题', '服务可用性下降');
                break;
        }
        if (gap > 0.3) {
            impacts.push('严重影响系统性能');
        }
        return impacts;
    }
    calculateFrequency(metricType) {
        return 0.5;
    }
    generateImprovementDirectionsForProblem(problem) {
        const directions = [];
        for (const metricType of problem.affectedMetrics) {
            const direction = {
                improvementId: `improvement_${problem.problemId}_${metricType}_${Date.now()}`,
                name: `改进${this.getMetricName(metricType)}`,
                description: `针对"${problem.description}"的改进措施`,
                targetProblems: [problem.problemId],
                expectedMetricImprovements: {
                    [metricType]: 0.1,
                },
                implementationDifficulty: problem.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
                expectedEffect: `预期将${this.getMetricName(metricType)}提升10%`,
                priority: problem.severity === 'CRITICAL' || problem.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
            };
            directions.push(direction);
        }
        return directions;
    }
    async getImplementation(implementationId) {
        return null;
    }
    async getMetricsBeforeImplementation(implementationId) {
        return await this.measureImprovementMetrics();
    }
    determineValidationConclusion(metricImprovements) {
        const improvements = Object.values(metricImprovements);
        const significantImprovements = improvements.filter(m => m.significant && m.improvement > 0);
        const significantDeclines = improvements.filter(m => m.significant && m.improvement < 0);
        if (significantImprovements.length > significantDeclines.length) {
            return 'SUCCESS';
        }
        else if (significantDeclines.length > significantImprovements.length) {
            return 'FAILED';
        }
        else if (significantImprovements.length > 0) {
            return 'PARTIAL_SUCCESS';
        }
        else {
            return 'INCONCLUSIVE';
        }
    }
    generateValidationExplanation(metricImprovements, conclusion) {
        const improvements = Object.entries(metricImprovements)
            .filter(([, m]) => m.significant && m.improvement > 0)
            .map(([type, m]) => `${this.getMetricName(type)}提升${Math.round(m.improvement * 100)}%`);
        const declines = Object.entries(metricImprovements)
            .filter(([, m]) => m.significant && m.improvement < 0)
            .map(([type, m]) => `${this.getMetricName(type)}下降${Math.round(Math.abs(m.improvement) * 100)}%`);
        if (conclusion === 'SUCCESS') {
            return `改进成功：${improvements.join('、')}`;
        }
        else if (conclusion === 'FAILED') {
            return `改进失败：${declines.join('、')}`;
        }
        else if (conclusion === 'PARTIAL_SUCCESS') {
            return `部分成功：${improvements.join('、')}，但${declines.join('、')}`;
        }
        else {
            return '改进效果不明显，需要更多数据验证';
        }
    }
    generateValidationRecommendations(metricImprovements, conclusion) {
        const recommendations = [];
        if (conclusion === 'SUCCESS') {
            recommendations.push('改进措施有效，可以继续应用');
            recommendations.push('考虑将改进措施推广到其他场景');
        }
        else if (conclusion === 'FAILED') {
            recommendations.push('改进措施效果不佳，需要重新评估');
            recommendations.push('考虑回滚改进措施');
            recommendations.push('分析失败原因，调整改进方向');
        }
        else if (conclusion === 'PARTIAL_SUCCESS') {
            recommendations.push('改进措施部分有效，需要优化');
            recommendations.push('针对未改进的指标调整策略');
        }
        else {
            recommendations.push('需要更多数据和时间来验证改进效果');
            recommendations.push('延长验证周期');
        }
        return recommendations;
    }
    calculateOverallImprovement(cycleState) {
        const improvements = [];
        const declines = [];
        for (const validation of cycleState.validations) {
            for (const [metricType, improvement] of Object.entries(validation.metricImprovements)) {
                if (improvement.significant) {
                    if (improvement.improvement > 0) {
                        improvements.push(metricType);
                    }
                    else if (improvement.improvement < 0) {
                        declines.push(metricType);
                    }
                }
            }
        }
        let totalImprovement = 0;
        let improvementCount = 0;
        for (const validation of cycleState.validations) {
            for (const improvement of Object.values(validation.metricImprovements)) {
                if (improvement.improvement > 0) {
                    totalImprovement += improvement.improvement;
                    improvementCount++;
                }
            }
        }
        const averageMetricImprovement = improvementCount > 0 ? totalImprovement / improvementCount : 0;
        return {
            averageMetricImprovement,
            improvedMetrics: Array.from(new Set(improvements)),
            declinedMetrics: Array.from(new Set(declines)),
        };
    }
    generateNextActions(cycleState, overallImprovement) {
        const actions = [];
        if (overallImprovement.improvedMetrics.length > 0) {
            actions.push(`继续监控${overallImprovement.improvedMetrics.length}个已改进的指标`);
        }
        if (overallImprovement.declinedMetrics.length > 0) {
            actions.push(`优先处理${overallImprovement.declinedMetrics.length}个下降的指标`);
        }
        const unresolvedProblems = cycleState.problems.filter(p => !cycleState.improvementDirections.some(d => d.targetProblems.includes(p.problemId)));
        if (unresolvedProblems.length > 0) {
            actions.push(`分析${unresolvedProblems.length}个未解决的问题`);
        }
        const pendingImplementations = cycleState.improvementDirections.filter(d => !cycleState.implementations.some(i => i.improvementId === d.improvementId));
        if (pendingImplementations.length > 0) {
            actions.push(`实施${pendingImplementations.length}个待实施的改进方向`);
        }
        if (actions.length === 0) {
            actions.push('继续收集反馈，监控指标变化');
        }
        return actions;
    }
    generateImprovementReport(cycleState) {
        const parts = [];
        parts.push(`# 数据持续改进循环报告（${cycleState.cycleId}）`);
        parts.push(`\n## 当前指标`);
        for (const [type, metric] of Object.entries(cycleState.currentMetrics)) {
            parts.push(`- **${metric.name}**：${Math.round(metric.currentValue * 100)}%（目标：${Math.round(metric.targetValue * 100)}%）`);
            parts.push(`  - 趋势：${metric.trend === 'IMPROVING' ? '上升' : metric.trend === 'DECLINING' ? '下降' : '稳定'}`);
            parts.push(`  - 改进空间：${Math.round(metric.improvementPotential * 100)}%`);
        }
        parts.push(`\n## 发现的问题（${cycleState.problems.length}个）`);
        for (const problem of cycleState.problems) {
            parts.push(`- **${problem.description}**（严重程度：${problem.severity}）`);
            parts.push(`  - 根本原因：${problem.rootCauses.join('、')}`);
        }
        parts.push(`\n## 确定的改进方向（${cycleState.improvementDirections.length}个）`);
        for (const direction of cycleState.improvementDirections.slice(0, 5)) {
            parts.push(`- **${direction.name}**（优先级：${direction.priority}）`);
            parts.push(`  - ${direction.description}`);
        }
        parts.push(`\n## 实施的改进（${cycleState.implementations.length}个）`);
        for (const implementation of cycleState.implementations) {
            parts.push(`- **${implementation.implementationId}**（状态：${implementation.status}）`);
        }
        parts.push(`\n## 验证结果（${cycleState.validations.length}个）`);
        for (const validation of cycleState.validations) {
            parts.push(`- **${validation.conclusion}**：${validation.explanation}`);
        }
        return parts.join('\n');
    }
    async getRecentDecisionLogs(days) {
        try {
            const logs = await this.prisma.decisionLog.findMany({
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                    },
                },
                take: 100,
            });
            return logs;
        }
        catch (error) {
            this.logger.warn(`Failed to get recent decision logs: ${error}`);
            return [];
        }
    }
    async getUserFeedbacks(logIds) {
        try {
            const outcomes = await this.prisma.decisionOutcome.findMany({
                where: {
                    decisionId: {
                        in: logIds,
                    },
                },
            });
            return outcomes;
        }
        catch (error) {
            this.logger.warn(`Failed to get user feedbacks: ${error}`);
            return [];
        }
    }
    async getDecisionOutcomes(days) {
        try {
            const outcomes = await this.prisma.decisionOutcome.findMany({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                    },
                },
                take: 100,
            });
            return outcomes;
        }
        catch (error) {
            this.logger.warn(`Failed to get decision outcomes: ${error}`);
            return [];
        }
    }
    async getMetricHistory(metricType, days) {
        return [];
    }
    calculateTrend(history) {
        if (history.length < 2) {
            return 'STABLE';
        }
        const recent = history.slice(-5);
        const first = recent[0].value;
        const last = recent[recent.length - 1].value;
        const change = last - first;
        if (change > 0.05) {
            return 'IMPROVING';
        }
        else if (change < -0.05) {
            return 'DECLINING';
        }
        else {
            return 'STABLE';
        }
    }
    compareOutcomes(expected, actual) {
        return 0.8;
    }
    calculateDecisionQualityScore(log) {
        let score = 0.5;
        if (log.explanation) {
            score += 0.2;
        }
        if (log.evidenceRefs && log.evidenceRefs.length > 0) {
            score += 0.2;
        }
        if (log.status === 'ACCEPTED') {
            score += 0.1;
        }
        return Math.min(1.0, score);
    }
    async getSampleData() {
        return {};
    }
    async getSystemErrors(days) {
        return [];
    }
    async getTotalRequests(days) {
        return 1000;
    }
    getMetricName(metricType) {
        const nameMap = {
            USER_SATISFACTION: '用户满意度',
            PREDICTION_ACCURACY: '预测准确度',
            DECISION_QUALITY: '决策质量',
            DATA_QUALITY: '数据质量',
            SYSTEM_RELIABILITY: '系统可靠性',
        };
        return nameMap[metricType] || metricType;
    }
};
exports.DataImprovementService = DataImprovementService;
exports.DataImprovementService = DataImprovementService = DataImprovementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        data_quality_framework_service_1.DataQualityFrameworkService,
        learning_service_1.LearningService])
], DataImprovementService);
//# sourceMappingURL=data-improvement.service.js.map