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
var MultiStrategyRouteGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiStrategyRouteGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const enhanced_vrptw_optimizer_service_1 = require("./enhanced-vrptw-optimizer.service");
const route_optimizer_service_1 = require("./route-optimizer.service");
let MultiStrategyRouteGeneratorService = MultiStrategyRouteGeneratorService_1 = class MultiStrategyRouteGeneratorService {
    constructor(enhancedVRPTWOptimizer, routeOptimizer) {
        this.enhancedVRPTWOptimizer = enhancedVRPTWOptimizer;
        this.routeOptimizer = routeOptimizer;
        this.logger = new common_1.Logger(MultiStrategyRouteGeneratorService_1.name);
    }
    async generateCandidateRoutes(baseRequest, config) {
        var _a;
        const startTime = Date.now();
        this.logger.debug(`开始生成候选路线: ${config.strategies.length} 种策略, ` +
            `${((_a = config.start_candidates) === null || _a === void 0 ? void 0 : _a.length) || 1} 个起点候选`);
        const startCandidates = config.start_candidates || [
            {
                node_id: baseRequest.start.node_id,
                name: baseRequest.start.name,
                geo: baseRequest.start.geo,
                priority: 1.0,
            },
        ];
        const requestVariants = [];
        for (const startCandidate of startCandidates) {
            for (const strategy of config.strategies) {
                const samples = config.sample_count || strategy.samples;
                for (let i = 0; i < samples; i++) {
                    const variantRequest = this.createRequestVariant(baseRequest, startCandidate);
                    requestVariants.push({
                        request: variantRequest,
                        startCandidate,
                        strategy,
                        sampleIndex: i,
                    });
                }
            }
        }
        this.logger.debug(`生成了 ${requestVariants.length} 个请求变体`);
        const candidates = [];
        const failedCount = { count: 0 };
        const results = await Promise.allSettled(requestVariants.map(async (variant, index) => {
            try {
                const result = await this.runStrategy(variant.request, variant.strategy, variant.sampleIndex, config.time_budget_ms);
                return {
                    candidate: {
                        id: `candidate_${index}_${variant.strategy.name}_${variant.sampleIndex}`,
                        request: variant.request,
                        result,
                        strategy: variant.strategy.name,
                        start_candidate: variant.startCandidate,
                        sample_index: variant.sampleIndex,
                        metadata: {
                            solve_time_ms: 0,
                            seed: variant.sampleIndex,
                            timestamp: new Date().toISOString(),
                        },
                    },
                    success: true,
                };
            }
            catch (error) {
                this.logger.warn(`策略 ${variant.strategy.name} 采样 ${variant.sampleIndex} 失败: ${error.message}`);
                failedCount.count++;
                return { success: false, error: error.message };
            }
        }));
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                candidates.push(result.value.candidate);
            }
        });
        this.logger.debug(`成功生成 ${candidates.length} 个候选路线，失败 ${failedCount.count} 个`);
        const filteredCandidates = this.deduplicateAndFilter(candidates, config.diversity_threshold || 0.3);
        this.logger.debug(`去重后剩余 ${filteredCandidates.length} 个候选路线`);
        const diversityStats = this.calculateDiversityStats(filteredCandidates);
        const bestCandidate = this.selectBestCandidate(filteredCandidates);
        let aggregationResult;
        if (config.aggregation_mode && config.aggregation_mode !== 'BEST') {
            aggregationResult = await this.aggregateResults(filteredCandidates, config.aggregation_mode);
        }
        const totalTime = Date.now() - startTime;
        const avgSolveTime = filteredCandidates.length > 0
            ? filteredCandidates.reduce((sum, c) => sum + (c.metadata.solve_time_ms || 0), 0) /
                filteredCandidates.length
            : 0;
        return {
            candidates: filteredCandidates,
            best_candidate: bestCandidate,
            aggregation_result: aggregationResult,
            statistics: {
                total_candidates: filteredCandidates.length,
                successful_candidates: filteredCandidates.length,
                failed_candidates: failedCount.count,
                avg_solve_time_ms: avgSolveTime,
                diversity_stats: diversityStats,
            },
        };
    }
    createRequestVariant(baseRequest, startCandidate) {
        return {
            ...baseRequest,
            start: {
                node_id: startCandidate.node_id,
                name: startCandidate.name,
                geo: startCandidate.geo,
            },
        };
    }
    async runStrategy(request, strategy, sampleIndex, timeBudgetMs) {
        const startTime = Date.now();
        switch (strategy.name) {
            case 'VRPTW':
                const result = await this.enhancedVRPTWOptimizer.solve(request, {
                    request_id: `vrptw_${sampleIndex}_${Date.now()}`,
                });
                return result;
            case 'SA':
            case 'GA':
            case 'MONTE_CARLO':
                this.logger.warn(`策略 ${strategy.name} 暂未实现，使用 VRPTW 替代`);
                return await this.enhancedVRPTWOptimizer.solve(request, {
                    request_id: `${strategy.name.toLowerCase()}_${sampleIndex}_${Date.now()}`,
                });
            default:
                throw new Error(`未知策略: ${strategy.name}`);
        }
    }
    deduplicateAndFilter(candidates, diversityThreshold) {
        if (candidates.length === 0) {
            return [];
        }
        const diversityScores = this.calculateDiversityScores(candidates);
        const selected = [];
        const remaining = [...candidates];
        remaining.sort((a, b) => {
            const scoreA = this.getRouteScore(a.result);
            const scoreB = this.getRouteScore(b.result);
            return scoreB - scoreA;
        });
        if (remaining.length > 0) {
            selected.push(remaining.shift());
        }
        while (remaining.length > 0 && selected.length < candidates.length) {
            let bestIndex = -1;
            let bestDiversity = -1;
            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const minDiversity = Math.min(...selected.map(s => diversityScores.get(`${candidate.id}-${s.id}`) || 0));
                if (minDiversity > bestDiversity && minDiversity >= diversityThreshold) {
                    bestDiversity = minDiversity;
                    bestIndex = i;
                }
            }
            if (bestIndex >= 0) {
                selected.push(remaining.splice(bestIndex, 1)[0]);
            }
            else {
                if (remaining.length > 0) {
                    selected.push(remaining.shift());
                }
            }
        }
        return selected;
    }
    calculateDiversityScores(candidates) {
        const scores = new Map();
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i + 1; j < candidates.length; j++) {
                const c1 = candidates[i];
                const c2 = candidates[j];
                const diversity = this.calculateRouteDiversity(c1, c2);
                scores.set(`${c1.id}-${c2.id}`, diversity);
                scores.set(`${c2.id}-${c1.id}`, diversity);
            }
        }
        return scores;
    }
    calculateRouteDiversity(c1, c2) {
        const route1 = c1.result.route || [];
        const route2 = c2.result.route || [];
        const nodes1 = new Set(route1.map(r => r.node_id));
        const nodes2 = new Set(route2.map(r => r.node_id));
        const intersection = new Set([...nodes1].filter(x => nodes2.has(x)));
        const union = new Set([...nodes1, ...nodes2]);
        const jaccardDistance = 1 - intersection.size / union.size;
        let timeDiff = 0;
        const commonNodes = route1
            .filter(r1 => nodes2.has(r1.node_id))
            .map(r1 => {
            const r2 = route2.find(r => r.node_id === r1.node_id);
            if (r2) {
                const time1 = this.parseTimeToMinutes(r1.arrival);
                const time2 = this.parseTimeToMinutes(r2.arrival);
                return Math.abs(time1 - time2);
            }
            return 0;
        });
        if (commonNodes.length > 0) {
            timeDiff = commonNodes.reduce((sum, d) => sum + d, 0) / commonNodes.length;
            timeDiff = Math.min(timeDiff / 480, 1);
        }
        const diversity = (jaccardDistance * 0.6 + timeDiff * 0.4);
        return Math.min(1, Math.max(0, diversity));
    }
    calculateDiversityStats(candidates) {
        if (candidates.length <= 1) {
            return { min: 0, max: 0, avg: 0, std: 0 };
        }
        const diversityScores = this.calculateDiversityScores(candidates);
        const scores = Array.from(diversityScores.values());
        const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
        const std = Math.sqrt(variance);
        return {
            min: Math.min(...scores),
            max: Math.max(...scores),
            avg,
            std,
        };
    }
    selectBestCandidate(candidates) {
        if (candidates.length === 0) {
            return undefined;
        }
        return candidates.reduce((best, current) => {
            const bestScore = this.getRouteScore(best.result);
            const currentScore = this.getRouteScore(current.result);
            return currentScore > bestScore ? current : best;
        });
    }
    getRouteScore(result) {
        var _a, _b;
        if (result.status === 'INFEASIBLE') {
            return -1000;
        }
        const robustness = ((_a = result.robustness) === null || _a === void 0 ? void 0 : _a.risk_level) === 'low' ? 1.0 :
            ((_b = result.robustness) === null || _b === void 0 ? void 0 : _b.risk_level) === 'medium' ? 0.7 : 0.4;
        const travelTime = 1 / (1 + result.summary.total_travel_min / 480);
        const droppedPenalty = result.summary.dropped_count * 0.1;
        return robustness * 0.4 + travelTime * 0.4 - droppedPenalty * 0.2;
    }
    async aggregateResults(candidates, mode) {
        if (candidates.length === 0) {
            return undefined;
        }
        if (mode === 'VOTING') {
            const best = this.selectBestCandidate(candidates);
            return {
                mode: 'VOTING',
                voting_route: best === null || best === void 0 ? void 0 : best.result,
            };
        }
        if (mode === 'ENSEMBLE') {
            const best = this.selectBestCandidate(candidates);
            return {
                mode: 'ENSEMBLE',
                ensemble_route: best === null || best === void 0 ? void 0 : best.result,
            };
        }
        return undefined;
    }
    parseTimeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
};
exports.MultiStrategyRouteGeneratorService = MultiStrategyRouteGeneratorService;
exports.MultiStrategyRouteGeneratorService = MultiStrategyRouteGeneratorService = MultiStrategyRouteGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [enhanced_vrptw_optimizer_service_1.EnhancedVRPTWOptimizerService,
        route_optimizer_service_1.RouteOptimizerService])
], MultiStrategyRouteGeneratorService);
//# sourceMappingURL=multi-strategy-route-generator.service.js.map