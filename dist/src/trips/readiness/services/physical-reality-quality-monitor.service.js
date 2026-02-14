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
var PhysicalRealityQualityMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhysicalRealityQualityMonitorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const physical_reality_retrieval_service_1 = require("./physical-reality-retrieval.service");
let PhysicalRealityQualityMonitorService = PhysicalRealityQualityMonitorService_1 = class PhysicalRealityQualityMonitorService {
    constructor(prisma, physicalRealityService) {
        this.prisma = prisma;
        this.physicalRealityService = physicalRealityService;
        this.logger = new common_1.Logger(PhysicalRealityQualityMonitorService_1.name);
        this.expectedRegions = [
            'iceland',
            'greenland',
            'alps',
            'svalbard',
            'faroe-islands',
            'argentina',
            'lofoten',
            'new-zealand-south-island',
        ];
        this.retrievalLatencies = [];
        this.retrievalSuccesses = 0;
        this.retrievalFailures = 0;
    }
    async generateQualityReport() {
        this.logger.debug('Generating Physical Reality data quality report...');
        const metrics = await this.calculateMetrics();
        const issues = this.identifyIssues(metrics);
        const qualityScore = this.calculateQualityScore(metrics, issues);
        return {
            generatedAt: new Date(),
            metrics,
            issues,
            qualityScore,
        };
    }
    async calculateMetrics() {
        const completeness = await this.calculateCompleteness();
        const accuracy = await this.calculateAccuracy();
        const timeliness = await this.calculateTimeliness();
        const retrievalPerformance = this.calculateRetrievalPerformance();
        return {
            completeness,
            accuracy,
            timeliness,
            retrievalPerformance,
        };
    }
    async calculateCompleteness() {
        const roadStatusChunks = await this.prisma.chunk.count({
            where: { type: 'road_status' },
        });
        const ferrySchedulesChunks = await this.prisma.chunk.count({
            where: { type: 'ferry_schedules' },
        });
        const weatherWindowsChunks = await this.prisma.chunk.count({
            where: { type: 'weather_windows' },
        });
        const roadStatusFiles = await this.prisma.knowledgeFile.findMany({
            where: { category: 'road_status' },
            select: { filename: true },
        });
        const ferrySchedulesFiles = await this.prisma.knowledgeFile.findMany({
            where: { category: 'ferry_schedules' },
            select: { filename: true },
        });
        const weatherWindowsFiles = await this.prisma.knowledgeFile.findMany({
            where: { category: 'weather_windows' },
            select: { filename: true },
        });
        const roadStatusRegions = new Set(roadStatusFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean));
        const ferrySchedulesRegions = new Set(ferrySchedulesFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean));
        const weatherWindowsRegions = new Set(weatherWindowsFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean));
        const totalRegions = this.expectedRegions.length;
        return {
            roadStatus: {
                totalChunks: roadStatusChunks,
                totalRegions,
                regionsWithData: roadStatusRegions.size,
                coverageRate: (roadStatusRegions.size / totalRegions) * 100,
                avgChunksPerRegion: roadStatusRegions.size > 0 ? roadStatusChunks / roadStatusRegions.size : 0,
            },
            ferrySchedules: {
                totalChunks: ferrySchedulesChunks,
                totalRegions,
                regionsWithData: ferrySchedulesRegions.size,
                coverageRate: (ferrySchedulesRegions.size / totalRegions) * 100,
                avgChunksPerRegion: ferrySchedulesRegions.size > 0 ? ferrySchedulesChunks / ferrySchedulesRegions.size : 0,
            },
            weatherWindows: {
                totalChunks: weatherWindowsChunks,
                totalRegions,
                regionsWithData: weatherWindowsRegions.size,
                coverageRate: (weatherWindowsRegions.size / totalRegions) * 100,
                avgChunksPerRegion: weatherWindowsRegions.size > 0 ? weatherWindowsChunks / weatherWindowsRegions.size : 0,
            },
            overall: {
                totalChunks: roadStatusChunks + ferrySchedulesChunks + weatherWindowsChunks,
                totalRegions,
                regionsWithData: new Set([
                    ...roadStatusRegions,
                    ...ferrySchedulesRegions,
                    ...weatherWindowsRegions,
                ]).size,
                coverageRate: (new Set([
                    ...roadStatusRegions,
                    ...ferrySchedulesRegions,
                    ...weatherWindowsRegions,
                ]).size / totalRegions) * 100,
            },
        };
    }
    async calculateAccuracy() {
        var _a, _b;
        const totalChunks = await this.prisma.chunk.count({
            where: {
                type: {
                    in: ['road_status', 'ferry_schedules', 'weather_windows'],
                },
            },
        });
        const chunksWithMetadataResult = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM chunks
      WHERE type IN ('road_status', 'ferry_schedules', 'weather_windows')
        AND metadata IS NOT NULL
    `;
        const chunksWithMetadata = Number(((_a = chunksWithMetadataResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        const chunksWithEmbedding = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM chunks
      WHERE type IN ('road_status', 'ferry_schedules', 'weather_windows')
        AND embedding IS NOT NULL
    `;
        const chunksWithKeywords = await this.prisma.chunk.count({
            where: {
                type: {
                    in: ['road_status', 'ferry_schedules', 'weather_windows'],
                },
                keywords: { isEmpty: false },
            },
        });
        const embeddingCount = Number(((_b = chunksWithEmbedding[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
        return {
            metadataCoverage: totalChunks > 0 ? (chunksWithMetadata / totalChunks) * 100 : 0,
            embeddingCoverage: totalChunks > 0 ? (embeddingCount / totalChunks) * 100 : 0,
            keywordsCoverage: totalChunks > 0 ? (chunksWithKeywords / totalChunks) * 100 : 0,
        };
    }
    async calculateTimeliness() {
        const files = await this.prisma.knowledgeFile.findMany({
            where: {
                category: {
                    in: ['road_status', 'ferry_schedules', 'weather_windows'],
                },
            },
            select: {
                lastUpdated: true,
            },
            orderBy: {
                lastUpdated: 'desc',
            },
        });
        if (files.length === 0) {
            return {
                lastUpdated: null,
                oldestUpdated: null,
                avgDaysSinceUpdate: 0,
                staleChunks30Days: 0,
                staleChunks90Days: 0,
            };
        }
        const lastUpdated = files[0].lastUpdated;
        const oldestUpdated = files[files.length - 1].lastUpdated;
        const now = new Date();
        const avgDaysSinceUpdate = files.reduce((sum, f) => {
            const daysSince = Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
            return sum + daysSince;
        }, 0) / files.length;
        const staleChunks30Days = files.filter(f => Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24)) > 30).length;
        const staleChunks90Days = files.filter(f => Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24)) > 90).length;
        return {
            lastUpdated,
            oldestUpdated,
            avgDaysSinceUpdate: Math.round(avgDaysSinceUpdate * 10) / 10,
            staleChunks30Days,
            staleChunks90Days,
        };
    }
    calculateRetrievalPerformance() {
        if (this.retrievalLatencies.length === 0) {
            return {
                avgLatency: 0,
                p95Latency: 0,
                successRate: 0,
                totalRetrievals: 0,
            };
        }
        const sortedLatencies = [...this.retrievalLatencies].sort((a, b) => a - b);
        const totalRetrievals = this.retrievalSuccesses + this.retrievalFailures;
        return {
            avgLatency: Math.round(sortedLatencies.reduce((sum, l) => sum + l, 0) / sortedLatencies.length),
            p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
            successRate: totalRetrievals > 0 ? (this.retrievalSuccesses / totalRetrievals) * 100 : 0,
            totalRetrievals,
        };
    }
    identifyIssues(metrics) {
        const issues = [];
        if (metrics.completeness.overall.coverageRate < 80) {
            issues.push({
                level: 'warning',
                category: 'completeness',
                message: `数据覆盖率较低: ${metrics.completeness.overall.coverageRate.toFixed(1)}%`,
                recommendation: '建议补充缺失区域的数据',
            });
        }
        if (metrics.completeness.roadStatus.coverageRate < 70) {
            issues.push({
                level: 'warning',
                category: 'completeness',
                message: `道路状态数据覆盖率较低: ${metrics.completeness.roadStatus.coverageRate.toFixed(1)}%`,
                recommendation: '建议补充道路状态数据',
            });
        }
        if (metrics.accuracy.metadataCoverage < 95) {
            issues.push({
                level: 'warning',
                category: 'accuracy',
                message: `Metadata覆盖率较低: ${metrics.accuracy.metadataCoverage.toFixed(1)}%`,
                recommendation: '建议检查并补充缺失的metadata',
            });
        }
        if (metrics.accuracy.embeddingCoverage < 95) {
            issues.push({
                level: 'error',
                category: 'accuracy',
                message: `Embedding覆盖率较低: ${metrics.accuracy.embeddingCoverage.toFixed(1)}%`,
                recommendation: '建议重新生成缺失的embeddings',
            });
        }
        if (metrics.timeliness.avgDaysSinceUpdate > 90) {
            issues.push({
                level: 'warning',
                category: 'timeliness',
                message: `数据平均更新天数较长: ${metrics.timeliness.avgDaysSinceUpdate}天`,
                recommendation: '建议更新数据，保持数据新鲜度',
            });
        }
        if (metrics.timeliness.staleChunks90Days > 0) {
            issues.push({
                level: 'warning',
                category: 'timeliness',
                message: `${metrics.timeliness.staleChunks90Days}个文件超过90天未更新`,
                recommendation: '建议更新过期数据',
            });
        }
        if (metrics.retrievalPerformance.avgLatency > 500) {
            issues.push({
                level: 'warning',
                category: 'performance',
                message: `平均检索延迟较高: ${metrics.retrievalPerformance.avgLatency}ms`,
                recommendation: '建议优化检索性能',
            });
        }
        if (metrics.retrievalPerformance.successRate < 95) {
            issues.push({
                level: 'error',
                category: 'performance',
                message: `检索成功率较低: ${metrics.retrievalPerformance.successRate.toFixed(1)}%`,
                recommendation: '建议检查检索服务状态',
            });
        }
        return issues;
    }
    calculateQualityScore(metrics, issues) {
        let score = 100;
        const completenessScore = metrics.completeness.overall.coverageRate;
        score -= (100 - completenessScore) * 0.3;
        const accuracyScore = (metrics.accuracy.metadataCoverage +
            metrics.accuracy.embeddingCoverage +
            metrics.accuracy.keywordsCoverage) /
            3;
        score -= (100 - accuracyScore) * 0.3;
        const timelinessScore = Math.max(0, 100 - (metrics.timeliness.avgDaysSinceUpdate / 90) * 100);
        score -= (100 - timelinessScore) * 0.2;
        const performanceScore = metrics.retrievalPerformance.successRate;
        score -= (100 - performanceScore) * 0.2;
        const errorCount = issues.filter(i => i.level === 'error').length;
        const warningCount = issues.filter(i => i.level === 'warning').length;
        score -= errorCount * 5;
        score -= warningCount * 2;
        return Math.max(0, Math.min(100, Math.round(score)));
    }
    recordRetrieval(latency, success) {
        this.retrievalLatencies.push(latency);
        if (this.retrievalLatencies.length > 1000) {
            this.retrievalLatencies = this.retrievalLatencies.slice(-1000);
        }
        if (success) {
            this.retrievalSuccesses++;
        }
        else {
            this.retrievalFailures++;
        }
    }
    extractRegionFromFilename(filename) {
        for (const region of this.expectedRegions) {
            if (filename.includes(region)) {
                return region;
            }
        }
        return null;
    }
};
exports.PhysicalRealityQualityMonitorService = PhysicalRealityQualityMonitorService;
exports.PhysicalRealityQualityMonitorService = PhysicalRealityQualityMonitorService = PhysicalRealityQualityMonitorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        physical_reality_retrieval_service_1.PhysicalRealityRetrievalService])
], PhysicalRealityQualityMonitorService);
//# sourceMappingURL=physical-reality-quality-monitor.service.js.map