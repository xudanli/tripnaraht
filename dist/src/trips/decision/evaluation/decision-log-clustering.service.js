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
var DecisionLogClusteringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionLogClusteringService = void 0;
const common_1 = require("@nestjs/common");
const decision_log_storage_service_1 = require("../services/decision-log-storage.service");
let DecisionLogClusteringService = DecisionLogClusteringService_1 = class DecisionLogClusteringService {
    constructor(logStorage) {
        this.logStorage = logStorage;
        this.logger = new common_1.Logger(DecisionLogClusteringService_1.name);
    }
    async analyzeRejectionReasons(filters) {
        this.logger.debug('分析最常见的拒绝原因');
        const logs = await this.logStorage.queryLogs({
            ...filters,
            limit: filters.limit || 10000,
        });
        const rejectionLogs = logs.filter(log => log.action === 'REJECT');
        if (rejectionLogs.length === 0) {
            return [];
        }
        const clusters = new Map();
        for (const log of rejectionLogs) {
            for (const reasonCode of log.reasonCodes) {
                if (!clusters.has(reasonCode)) {
                    clusters.set(reasonCode, {
                        logs: [],
                        sources: new Map(),
                        stages: new Map(),
                    });
                }
                const cluster = clusters.get(reasonCode);
                cluster.logs.push(log);
                const sourceCount = cluster.sources.get(log.decisionSource) || 0;
                cluster.sources.set(log.decisionSource, sourceCount + 1);
                const stageCount = cluster.stages.get(log.decisionStage) || 0;
                cluster.stages.set(log.decisionStage, stageCount + 1);
            }
        }
        const totalRejections = rejectionLogs.length;
        const results = [];
        for (const [reasonCode, cluster] of clusters.entries()) {
            const examples = cluster.logs
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 3);
            results.push({
                reasonCode,
                count: cluster.logs.length,
                percentage: cluster.logs.length / totalRejections,
                decisionSources: Array.from(cluster.sources.entries()).map(([source, count]) => ({
                    source,
                    count,
                })),
                decisionStages: Array.from(cluster.stages.entries()).map(([stage, count]) => ({
                    stage,
                    count,
                })),
                examples,
            });
        }
        results.sort((a, b) => b.count - a.count);
        return results;
    }
    async analyzeReplacementReasons(filters) {
        this.logger.debug('分析最常见的替换原因');
        const logs = await this.logStorage.queryLogs({
            ...filters,
            limit: filters.limit || 10000,
        });
        const replacementLogs = logs.filter(log => log.action === 'REPLACE');
        if (replacementLogs.length === 0) {
            return [];
        }
        const clusters = new Map();
        for (const log of replacementLogs) {
            const replacementTypes = log.reasonCodes.filter(code => code.includes('REPLACEMENT') ||
                code.includes('ENTRY') ||
                code.includes('POI') ||
                code.includes('SEGMENT') ||
                code === 'SPATIAL_REPLACEMENT');
            const type = replacementTypes.length > 0
                ? replacementTypes[0]
                : log.reasonCodes[0] || 'UNKNOWN';
            if (!clusters.has(type)) {
                clusters.set(type, {
                    logs: [],
                    reasonCodes: new Map(),
                });
            }
            const cluster = clusters.get(type);
            cluster.logs.push(log);
            for (const code of log.reasonCodes) {
                const count = cluster.reasonCodes.get(code) || 0;
                cluster.reasonCodes.set(code, count + 1);
            }
        }
        const totalReplacements = replacementLogs.length;
        const results = [];
        for (const [replacementType, cluster] of clusters.entries()) {
            const examples = cluster.logs
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 3);
            results.push({
                replacementType,
                count: cluster.logs.length,
                percentage: cluster.logs.length / totalReplacements,
                reasonCodes: Array.from(cluster.reasonCodes.entries())
                    .map(([code, count]) => ({ code, count }))
                    .sort((a, b) => b.count - a.count),
                examples,
            });
        }
        results.sort((a, b) => b.count - a.count);
        return results;
    }
    async generateQualityReport(filters) {
        this.logger.debug('生成决策质量报告');
        const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = filters.endDate || new Date();
        const logs = await this.logStorage.queryLogs({
            ...filters,
            startDate,
            endDate,
            limit: 10000,
        });
        if (logs.length === 0) {
            return {
                timeRange: { start: startDate, end: endDate },
                totalLogs: 0,
                topRejectionReasons: [],
                topReplacementReasons: [],
                byStage: [],
                bySource: [],
                byPersona: [],
                qualityMetrics: {
                    rejectionRate: 0,
                    replacementRate: 0,
                    realityDrivenRatio: 0,
                    avgDecisionsPerTrip: 0,
                },
            };
        }
        const rejectionReasons = await this.analyzeRejectionReasons({
            ...filters,
            startDate,
            endDate,
        });
        const topRejectionReasons = rejectionReasons.slice(0, 10);
        const replacementReasons = await this.analyzeReplacementReasons({
            ...filters,
            startDate,
            endDate,
        });
        const topReplacementReasons = replacementReasons.slice(0, 10);
        const byStageMap = new Map();
        for (const log of logs) {
            const stage = log.decisionStage;
            if (!byStageMap.has(stage)) {
                byStageMap.set(stage, { count: 0, rejectionCount: 0, replacementCount: 0 });
            }
            const stats = byStageMap.get(stage);
            stats.count++;
            if (log.action === 'REJECT')
                stats.rejectionCount++;
            if (log.action === 'REPLACE')
                stats.replacementCount++;
        }
        const byStage = Array.from(byStageMap.entries()).map(([stage, stats]) => ({
            stage,
            ...stats,
        }));
        const bySourceMap = new Map();
        for (const log of logs) {
            const source = log.decisionSource;
            if (!bySourceMap.has(source)) {
                bySourceMap.set(source, { count: 0, rejectionCount: 0, replacementCount: 0 });
            }
            const stats = bySourceMap.get(source);
            stats.count++;
            if (log.action === 'REJECT')
                stats.rejectionCount++;
            if (log.action === 'REPLACE')
                stats.replacementCount++;
        }
        const bySource = Array.from(bySourceMap.entries()).map(([source, stats]) => ({
            source,
            ...stats,
        }));
        const byPersonaMap = new Map();
        for (const log of logs) {
            const persona = log.persona;
            if (!byPersonaMap.has(persona)) {
                byPersonaMap.set(persona, { count: 0, rejectionCount: 0, replacementCount: 0 });
            }
            const stats = byPersonaMap.get(persona);
            stats.count++;
            if (log.action === 'REJECT')
                stats.rejectionCount++;
            if (log.action === 'REPLACE')
                stats.replacementCount++;
        }
        const byPersona = Array.from(byPersonaMap.entries()).map(([persona, stats]) => ({
            persona,
            ...stats,
        }));
        const rejectionCount = logs.filter(log => log.action === 'REJECT').length;
        const replacementCount = logs.filter(log => log.action === 'REPLACE').length;
        const realityDrivenCount = logs.filter(log => log.decisionSource === 'PHYSICAL' || log.decisionSource === 'HUMAN').length;
        const tripIds = new Set(logs.map(log => log.tripId).filter(Boolean));
        const avgDecisionsPerTrip = tripIds.size > 0 ? logs.length / tripIds.size : 0;
        const qualityMetrics = {
            rejectionRate: logs.length > 0 ? rejectionCount / logs.length : 0,
            replacementRate: logs.length > 0 ? replacementCount / logs.length : 0,
            realityDrivenRatio: logs.length > 0 ? realityDrivenCount / logs.length : 0,
            avgDecisionsPerTrip,
        };
        return {
            timeRange: { start: startDate, end: endDate },
            totalLogs: logs.length,
            topRejectionReasons,
            topReplacementReasons,
            byStage,
            bySource,
            byPersona,
            qualityMetrics,
        };
    }
};
exports.DecisionLogClusteringService = DecisionLogClusteringService;
exports.DecisionLogClusteringService = DecisionLogClusteringService = DecisionLogClusteringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [decision_log_storage_service_1.DecisionLogStorageService])
], DecisionLogClusteringService);
//# sourceMappingURL=decision-log-clustering.service.js.map