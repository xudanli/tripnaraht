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
var ContextController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const context_engineer_service_1 = require("./services/context-engineer.service");
const context_metrics_service_1 = require("./services/context-metrics.service");
const context_prometheus_metrics_service_1 = require("./services/context-prometheus-metrics.service");
const context_performance_analysis_service_1 = require("./services/context-performance-analysis.service");
const skills_registry_service_1 = require("../../skills/services/skills-registry.service");
const skills_registry_token_1 = require("../../skills/services/skills-registry.token");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
const api_response_dto_1 = require("../../common/dto/api-response.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const context_dto_1 = require("./dto/context.dto");
const admin_context_dto_1 = require("./dto/admin-context.dto");
const common_2 = require("@nestjs/common");
const swagger_2 = require("@nestjs/swagger");
let ContextController = ContextController_1 = class ContextController {
    constructor(contextEngineer, metricsService, prometheusMetrics, performanceAnalysis, skillsRegistry) {
        this.contextEngineer = contextEngineer;
        this.metricsService = metricsService;
        this.prometheusMetrics = prometheusMetrics;
        this.performanceAnalysis = performanceAnalysis;
        this.skillsRegistry = skillsRegistry;
        this.logger = new common_1.Logger(ContextController_1.name);
    }
    async build(dto) {
        try {
            const contextPackage = await this.contextEngineer.build({
                tripId: dto.tripId,
                phase: dto.phase,
                agent: dto.agent,
                userQuery: dto.userQuery,
                tokenBudget: dto.tokenBudget,
                includePrivate: dto.includePrivate,
                requiredTopics: dto.requiredTopics,
                excludeTopics: dto.excludeTopics,
                includeApiDocs: dto.includeApiDocs,
                apiDocCategories: dto.apiDocCategories,
            }, dto.useCache !== false);
            return (0, standard_response_dto_1.successResponse)({
                contextPackage,
            });
        }
        catch (error) {
            this.logger.error(`构建 Context Package 失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async compress(dto) {
        try {
            if (!this.skillsRegistry) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Skills Registry 未注入');
            }
            const compressSkill = this.skillsRegistry.getSkill('context.compress');
            if (!compressSkill) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'context.compress skill 未注册');
            }
            const result = await compressSkill.execute({
                blocks: dto.blocks,
                tokenBudget: dto.tokenBudget,
                strategy: dto.strategy || 'balanced',
                preserveKeys: dto.preserveKeys,
            });
            return (0, standard_response_dto_1.successResponse)({
                compressedBlocks: result.compressedBlocks,
                stats: result.stats,
            });
        }
        catch (error) {
            this.logger.error(`压缩 Context 失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async projectState(dto) {
        try {
            const projection = await this.contextEngineer.projectState(dto.state, {
                includeFullState: dto.includeFullState,
                decisionLogLimit: dto.decisionLogLimit,
                rejectionLogLimit: dto.rejectionLogLimit,
                tokenBudget: dto.tokenBudget,
            });
            return (0, standard_response_dto_1.successResponse)({
                projection,
            });
        }
        catch (error) {
            this.logger.error(`投影状态失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async writeBack(dto) {
        try {
            await this.contextEngineer.writeBack(dto.tripRunId, dto.attemptNumber, dto.scratchpad, dto.decisionLogDelta, dto.artifactsRefs);
            return (0, standard_response_dto_1.successResponse)({
                message: 'Write back 成功',
            });
        }
        catch (error) {
            this.logger.error(`Write back 失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminMetrics(query) {
        try {
            if (!this.metricsService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
            }
            const summary = await this.metricsService.getMetricsSummary({
                tripId: query.tripId,
                phase: query.phase,
                agent: query.agent,
                startTime: query.startTime,
                endTime: query.endTime,
            });
            const byAgent = this.metricsService.getStatsByAgent({
                startTime: query.startTime,
                endTime: query.endTime,
            });
            const byPhase = this.metricsService.getStatsByPhase({
                startTime: query.startTime,
                endTime: query.endTime,
            });
            return (0, standard_response_dto_1.successResponse)({
                summary,
                byAgent,
                byPhase,
            });
        }
        catch (error) {
            this.logger.error(`获取指标统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminPackages(query) {
        try {
            const result = this.contextEngineer.getPackages({
                page: query.page,
                limit: query.limit,
                tripId: query.tripId,
                phase: query.phase,
                agent: query.agent,
                startTime: query.startTime,
                endTime: query.endTime,
                search: query.search,
            });
            const packages = result.packages.map((pkg) => ({
                id: pkg.id,
                tripId: pkg.tripId,
                phase: pkg.phase,
                agent: pkg.agent,
                userQuery: pkg.userQuery,
                blocksCount: pkg.blocks.length,
                totalTokens: pkg.totalTokens,
                tokenBudget: pkg.tokenBudget,
                compressed: pkg.compressed,
                createdAt: pkg.createdAt,
            }));
            return (0, standard_response_dto_1.successResponse)({
                packages,
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages,
            });
        }
        catch (error) {
            this.logger.error(`获取 Context Package 列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminPackageDetail(id) {
        try {
            const pkg = this.contextEngineer.getPackageById(id);
            if (!pkg) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `Context Package ${id} 不存在`);
            }
            let metrics;
            if (this.metricsService && pkg.tripId) {
                const allMetrics = this.metricsService.getAllMetrics({ tripId: pkg.tripId });
                metrics = allMetrics
                    .filter((m) => m.phase === pkg.phase && m.agent === pkg.agent)
                    .sort((a, b) => {
                    const timeDiffA = Math.abs(new Date(a.timestamp).getTime() - new Date(pkg.createdAt).getTime());
                    const timeDiffB = Math.abs(new Date(b.timestamp).getTime() - new Date(pkg.createdAt).getTime());
                    return timeDiffA - timeDiffB;
                })[0];
            }
            return (0, standard_response_dto_1.successResponse)({
                package: pkg,
                metrics,
            });
        }
        catch (error) {
            this.logger.error(`获取 Context Package 详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminAnalytics(query) {
        try {
            if (!this.metricsService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
            }
            const records = this.metricsService.getAllMetrics({
                startTime: query.startTime,
                endTime: query.endTime,
            });
            if (records.length === 0) {
                return (0, standard_response_dto_1.successResponse)({
                    tokenUsageTrend: [],
                    cacheHitRateTrend: [],
                    compressionAnalysis: {
                        avgCompressionRate: 0,
                        compressionRateDistribution: [],
                    },
                    qualityAnalysis: {
                        distribution: { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 },
                        trend: [],
                    },
                    topBlockTypes: [],
                    performanceBottlenecks: [],
                });
            }
            const granularity = query.granularity || 'day';
            const tokenUsageTrend = this.calculateTokenUsageTrend(records, granularity);
            const cacheHitRateTrend = this.calculateCacheHitRateTrend(records, granularity);
            const compressionAnalysis = this.calculateCompressionAnalysis(records);
            const qualityAnalysis = this.calculateQualityAnalysis(records, granularity);
            const topBlockTypes = this.calculateTopBlockTypes(records);
            const performanceBottlenecks = this.calculatePerformanceBottlenecks(records);
            return (0, standard_response_dto_1.successResponse)({
                tokenUsageTrend,
                cacheHitRateTrend,
                compressionAnalysis,
                qualityAnalysis,
                topBlockTypes,
                performanceBottlenecks,
            });
        }
        catch (error) {
            this.logger.error(`获取分析报告失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    calculateTokenUsageTrend(records, granularity) {
        const grouped = this.groupByTime(records, granularity, (r) => r.tokens.total);
        return grouped.map((group) => ({
            timestamp: group.timestamp,
            avgTokens: Math.round(group.values.reduce((sum, v) => sum + v, 0) / group.values.length),
            maxTokens: Math.max(...group.values),
            minTokens: Math.min(...group.values),
            count: group.values.length,
        }));
    }
    calculateCacheHitRateTrend(records, granularity) {
        const grouped = this.groupByTime(records, granularity, (r) => (r.performance.cacheHit ? 1 : 0));
        return grouped.map((group) => ({
            timestamp: group.timestamp,
            cacheHitRate: group.values.reduce((sum, v) => sum + v, 0) / group.values.length,
            count: group.values.length,
        }));
    }
    calculateCompressionAnalysis(records) {
        const compressionRates = records
            .filter((r) => r.blocks.compressionRate !== undefined)
            .map((r) => r.blocks.compressionRate || 0);
        const avgCompressionRate = compressionRates.length > 0
            ? compressionRates.reduce((sum, r) => sum + r, 0) / compressionRates.length
            : 0;
        const ranges = [
            { range: '0-20%', min: 0, max: 0.2 },
            { range: '20-40%', min: 0.2, max: 0.4 },
            { range: '40-60%', min: 0.4, max: 0.6 },
            { range: '60-80%', min: 0.6, max: 0.8 },
            { range: '80-100%', min: 0.8, max: 1.0 },
        ];
        const distribution = ranges.map((r) => ({
            range: r.range,
            count: compressionRates.filter((rate) => rate >= r.min && rate < r.max).length,
        }));
        return {
            avgCompressionRate: Math.round(avgCompressionRate * 100) / 100,
            compressionRateDistribution: distribution,
        };
    }
    calculateQualityAnalysis(records, granularity) {
        const distribution = {
            EXCELLENT: records.filter((r) => r.quality.quality === 'EXCELLENT').length,
            GOOD: records.filter((r) => r.quality.quality === 'GOOD').length,
            FAIR: records.filter((r) => r.quality.quality === 'FAIR').length,
            POOR: records.filter((r) => r.quality.quality === 'POOR').length,
        };
        const trend = this.groupByTime(records, granularity, (r) => r.quality.quality).map((group) => {
            const qualityCounts = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 };
            group.values.forEach((quality) => {
                if (qualityCounts[quality] !== undefined) {
                    qualityCounts[quality]++;
                }
            });
            return {
                timestamp: group.timestamp,
                excellent: qualityCounts.EXCELLENT,
                good: qualityCounts.GOOD,
                fair: qualityCounts.FAIR,
                poor: qualityCounts.POOR,
            };
        });
        return { distribution, trend };
    }
    calculateTopBlockTypes(records) {
        const blockTypeStats = {};
        for (const record of records) {
            for (const [type, count] of Object.entries(record.blockTypeDistribution)) {
                if (!blockTypeStats[type]) {
                    blockTypeStats[type] = { count: 0, tokens: [] };
                }
                blockTypeStats[type].count += Number(count) || 0;
                if (record.blocks.total > 0) {
                    blockTypeStats[type].tokens.push(record.tokens.total / record.blocks.total);
                }
            }
        }
        return Object.entries(blockTypeStats)
            .map(([type, stats]) => ({
            type,
            count: stats.count,
            avgTokens: Math.round(stats.tokens.reduce((sum, t) => sum + t, 0) / stats.tokens.length),
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }
    calculatePerformanceBottlenecks(records) {
        const bottlenecks = {};
        for (const record of records) {
            const key = `${record.agent}:${record.phase}`;
            if (!bottlenecks[key]) {
                bottlenecks[key] = { buildTimes: [], count: 0 };
            }
            bottlenecks[key].buildTimes.push(record.performance.buildTimeMs);
            bottlenecks[key].count++;
        }
        return Object.entries(bottlenecks)
            .map(([key, stats]) => {
            const [agent, phase] = key.split(':');
            return {
                agent,
                phase,
                avgBuildTimeMs: Math.round(stats.buildTimes.reduce((sum, t) => sum + t, 0) / stats.buildTimes.length),
                count: stats.count,
            };
        })
            .sort((a, b) => b.avgBuildTimeMs - a.avgBuildTimeMs)
            .slice(0, 10);
    }
    groupByTime(records, granularity, valueExtractor) {
        const groups = {};
        for (const record of records) {
            const date = new Date(record.timestamp);
            let key;
            switch (granularity) {
                case 'hour':
                    key = date.toISOString().slice(0, 13) + ':00:00Z';
                    break;
                case 'day':
                    key = date.toISOString().slice(0, 10) + 'T00:00:00Z';
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().slice(0, 10) + 'T00:00:00Z';
                    break;
                case 'month':
                    key = date.toISOString().slice(0, 7) + '-01T00:00:00Z';
                    break;
                default:
                    key = date.toISOString().slice(0, 10) + 'T00:00:00Z';
            }
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(valueExtractor(record));
        }
        return Object.entries(groups)
            .map(([timestamp, values]) => ({ timestamp, values }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
    async getMetrics(query) {
        try {
            if (!this.metricsService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
            }
            if (query.limit) {
                const recent = this.metricsService.getRecentMetrics(query.tripId, query.limit);
                const summary = await this.metricsService.getMetricsSummary({
                    tripId: query.tripId,
                    phase: query.phase,
                    agent: query.agent,
                    startTime: query.startTime,
                    endTime: query.endTime,
                });
                return (0, standard_response_dto_1.successResponse)({
                    summary,
                    recent,
                });
            }
            const summary = await this.metricsService.getMetricsSummary({
                tripId: query.tripId,
                phase: query.phase,
                agent: query.agent,
                startTime: query.startTime,
                endTime: query.endTime,
            });
            return (0, standard_response_dto_1.successResponse)({
                summary,
            });
        }
        catch (error) {
            this.logger.error(`获取指标失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPrometheusMetrics() {
        try {
            if (!this.prometheusMetrics) {
                return '# Context Prometheus Metrics\n# Service not available\n';
            }
            const metrics = await this.prometheusMetrics.getMetrics();
            return metrics;
        }
        catch (error) {
            this.logger.error(`获取 Prometheus 指标失败: ${error.message}`, error.stack);
            return `# Context Prometheus Metrics\n# Error: ${error.message}\n`;
        }
    }
    async getPerformanceReport(startTime, endTime, format = 'json', includeLearning, includeBottlenecks) {
        try {
            if (!this.performanceAnalysis) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '性能分析服务不可用');
            }
            const end = endTime ? new Date(endTime) : new Date();
            const start = startTime ? new Date(startTime) : new Date(end.getTime() - 24 * 60 * 60 * 1000);
            const report = await this.performanceAnalysis.generateReport({ start, end }, {
                includeLearning: includeLearning !== null && includeLearning !== void 0 ? includeLearning : true,
                includeBottlenecks: includeBottlenecks !== null && includeBottlenecks !== void 0 ? includeBottlenecks : true,
            });
            if (format === 'markdown') {
                const markdown = await this.performanceAnalysis.exportReportAsMarkdown(report);
                return {
                    format: 'markdown',
                    content: markdown,
                };
            }
            return (0, standard_response_dto_1.successResponse)(report);
        }
        catch (error) {
            this.logger.error(`生成性能分析报告失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.ContextController = ContextController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('build'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '构建 Context Package',
        description: `
根据 tripId、phase、agent、userQuery 构建 Context Package。

**功能**：
- 自动调用相关 skills（countryPack.getBlocks, plan.selectSlices 等）
- 处理 Token 预算和压缩
- 支持缓存（Redis + 内存缓存）

**返回**：
- contextPackage: 完整的 Context Package（包含 blocks、tokens、metadata 等）
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: context_dto_1.BuildContextPackageDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Context Package',
        type: context_dto_1.BuildContextPackageResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [context_dto_1.BuildContextPackageDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "build", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('compress'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '压缩 Context Package',
        description: `
压缩 Context Package 中的 blocks，使其符合 Token 预算。

**压缩策略**：
- aggressive: 只保留硬门槛和关键决策点
- conservative: 尽量保留，只做摘要
- balanced: 保留关键内容，摘要其他（默认）

**压缩目标**：
- 硬门槛（Abu 拒绝的条件、道路/天气/体能门槛）
- 关键决策点（为什么选 A 不选 B）
- 失败尝试（哪些方案被否了 + 原因）
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: context_dto_1.CompressContextDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回压缩后的 blocks',
        type: context_dto_1.CompressContextResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [context_dto_1.CompressContextDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "compress", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('project-state'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '投影状态为 Public/Private',
        description: `
将全量 State（TripState 或 LangGraphState）投影为 Public/Private 两部分。

**Public 状态**：可进 prompt 的摘要信息
**Private 状态**：绝不进 prompt 的完整状态和原始数据

**用途**：
- LangGraph 节点中使用，确保 prompt 只包含必要信息
- 保护用户隐私和内部计算细节
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: context_dto_1.ProjectStateDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回状态投影',
        type: context_dto_1.ProjectStateResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [context_dto_1.ProjectStateDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "projectState", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('write-back'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '写入回写（Write Back）',
        description: `
保存节点的 scratchpad、decisionLogDelta、artifactsRefs。

**用途**：
- LangGraph 节点结束时调用
- 保存中间结果和决策日志增量
- 存储 artifacts 引用
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: context_dto_1.WriteBackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '写入成功',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [context_dto_1.WriteBackDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "writeBack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/metrics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Context 指标统计（后台管理）',
        description: `
获取 Context 使用情况的统计指标，用于后台管理系统展示。

**功能**：
- 总体统计（总构建次数、平均 Token、缓存命中率等）
- 按 Agent 分类统计
- 按 Phase 分类统计
- 支持时间范围筛选
    `.trim(),
    }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'phase', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'agent', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回指标统计',
        type: admin_context_dto_1.ContextMetricsResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_context_dto_1.GetContextMetricsQueryDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getAdminMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/packages'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Context Package 列表（后台管理）',
        description: `
获取历史构建的 Context Package 列表，支持分页、筛选、搜索。

**功能**：
- 分页列表
- 按 tripId、phase、agent 筛选
- 按时间范围筛选
- 搜索功能（userQuery、tripId）
    `.trim(),
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'phase', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'agent', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Context Package 列表',
        type: admin_context_dto_1.ContextPackageListResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_context_dto_1.GetContextPackagesQueryDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getAdminPackages", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/packages/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Context Package 详情（后台管理）',
        description: `
获取特定 Context Package 的详细信息。

**功能**：
- 显示完整的 Context Package
- 显示所有 blocks 的详细信息
- 显示构建元数据
- 显示关联的性能指标
    `.trim(),
    }),
    (0, swagger_2.ApiParam)({ name: 'id', description: 'Context Package ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Context Package 详情',
        type: admin_context_dto_1.ContextPackageDetailResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getAdminPackageDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/analytics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Context 分析报告（后台管理）',
        description: `
生成 Context 使用分析报告，用于深入了解 Context 的使用情况。

**功能**：
- Token 使用趋势
- 缓存命中率趋势
- 压缩率分析
- 质量分布分析
- Top Block Types
- 性能瓶颈分析
    `.trim(),
    }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'] }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回分析报告',
        type: admin_context_dto_1.ContextAnalyticsResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_context_dto_1.GetContextAnalyticsQueryDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getAdminAnalytics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('metrics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Context 指标',
        description: `
获取 Context Package 的质量和性能指标。

**指标类型**：
- Token 使用、压缩率、命中率
- 块类型分布、优先级分布
- 缓存命中率、构建耗时
- 质量分布（EXCELLENT/GOOD/FAIR/POOR）

**查询参数**：
- tripId: 按 Trip ID 过滤
- phase: 按规划阶段过滤
- agent: 按 Agent 过滤
- startTime/endTime: 时间范围
- limit: 返回最近 N 条记录（用于 getRecent）
    `.trim(),
    }),
    (0, swagger_1.ApiQuery)({ type: context_dto_1.GetMetricsQueryDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回指标',
        type: context_dto_1.GetMetricsResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [context_dto_1.GetMetricsQueryDto]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('prometheus-metrics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Prometheus 指标',
        description: '返回 Prometheus 格式的 Context Engine 指标数据',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Prometheus 格式的指标数据',
        content: {
            'text/plain': {
                schema: {
                    type: 'string',
                },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getPrometheusMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('performance-report'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '性能分析报告',
        description: '生成 Context Engine 性能分析报告',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, type: String, description: '开始时间 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, type: String, description: '结束时间 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'format', required: false, enum: ['json', 'markdown'], description: '报告格式' }),
    (0, swagger_1.ApiQuery)({ name: 'includeLearning', required: false, type: Boolean, description: '包含 Context Learning 数据' }),
    (0, swagger_1.ApiQuery)({ name: 'includeBottlenecks', required: false, type: Boolean, description: '包含性能瓶颈分析' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '性能分析报告',
    }),
    __param(0, (0, common_1.Query)('startTime')),
    __param(1, (0, common_1.Query)('endTime')),
    __param(2, (0, common_1.Query)('format')),
    __param(3, (0, common_1.Query)('includeLearning')),
    __param(4, (0, common_1.Query)('includeBottlenecks')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Boolean, Boolean]),
    __metadata("design:returntype", Promise)
], ContextController.prototype, "getPerformanceReport", null);
exports.ContextController = ContextController = ContextController_1 = __decorate([
    (0, swagger_1.ApiTags)('context'),
    (0, common_1.Controller)('context'),
    __param(1, (0, common_2.Optional)()),
    __param(2, (0, common_2.Optional)()),
    __param(3, (0, common_2.Optional)()),
    __param(4, (0, common_2.Inject)(skills_registry_token_1.SKILLS_REGISTRY_TOKEN)),
    __param(4, (0, common_2.Optional)()),
    __metadata("design:paramtypes", [context_engineer_service_1.ContextEngineerService,
        context_metrics_service_1.ContextMetricsService,
        context_prometheus_metrics_service_1.ContextPrometheusMetricsService,
        context_performance_analysis_service_1.ContextPerformanceAnalysisService,
        skills_registry_service_1.SkillsRegistryService])
], ContextController);
//# sourceMappingURL=context.controller.js.map