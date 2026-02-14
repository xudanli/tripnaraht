"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RouteDirectionObservabilityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionObservabilityService = void 0;
const common_1 = require("@nestjs/common");
let RouteDirectionObservabilityService = RouteDirectionObservabilityService_1 = class RouteDirectionObservabilityService {
    constructor() {
        this.logger = new common_1.Logger(RouteDirectionObservabilityService_1.name);
        this.traces = new Map();
        this.maxTracesInMemory = 1000;
        this.metrics = {
            latencies: {
                rdSelectMs: [],
                poiPoolQueryMs: [],
                constraintsInjectMs: [],
                planGenerateMs: [],
                neptuneRepairMs: [],
            },
            quality: {
                poiPoolSizes: [],
                hardConstraintsHitCounts: [],
                softConstraintsHitCounts: [],
                repairActionCounts: [],
                selectedRdIds: [],
            },
            errors: {
                corridorGeomInvalid: 0,
                poiQueryTimeout: 0,
                noCandidatesFallbackUsed: 0,
            },
        };
    }
    createTrace(requestId) {
        const trace = {
            requestId,
            startTime: Date.now(),
            latencies: {},
            quality: {},
            errors: {},
        };
        this.traces.set(requestId, trace);
        if (this.traces.size > this.maxTracesInMemory) {
            const firstKey = this.traces.keys().next().value;
            if (firstKey) {
                this.traces.delete(firstKey);
            }
        }
        return trace;
    }
    recordRdSelectLatency(requestId, latencyMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.latencies.rdSelectMs = latencyMs;
            this.metrics.latencies.rdSelectMs.push(latencyMs);
            this.logger.debug(`[TRACE ${requestId}] RD selection took ${latencyMs}ms`);
        }
    }
    recordPoiPoolQueryLatency(requestId, latencyMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.latencies.poiPoolQueryMs = latencyMs;
            this.metrics.latencies.poiPoolQueryMs.push(latencyMs);
            this.logger.debug(`[TRACE ${requestId}] POI pool query took ${latencyMs}ms`);
        }
    }
    recordConstraintsInjectLatency(requestId, latencyMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.latencies.constraintsInjectMs = latencyMs;
            this.metrics.latencies.constraintsInjectMs.push(latencyMs);
            this.logger.debug(`[TRACE ${requestId}] Constraints injection took ${latencyMs}ms`);
        }
    }
    recordPlanGenerateLatency(requestId, latencyMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.latencies.planGenerateMs = latencyMs;
            this.metrics.latencies.planGenerateMs.push(latencyMs);
            this.logger.debug(`[TRACE ${requestId}] Plan generation took ${latencyMs}ms`);
        }
    }
    recordNeptuneRepairLatency(requestId, latencyMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.latencies.neptuneRepairMs = latencyMs;
            this.metrics.latencies.neptuneRepairMs.push(latencyMs);
            this.logger.debug(`[TRACE ${requestId}] Neptune repair took ${latencyMs}ms`);
        }
    }
    recordPoiPoolSize(requestId, size, stage) {
        const trace = this.traces.get(requestId);
        if (trace) {
            if (!trace.poiPoolEvolution) {
                trace.poiPoolEvolution = {
                    filters: [],
                };
            }
            if (stage === 'initial') {
                trace.poiPoolEvolution.initialSize = size;
            }
            else if (stage === 'afterRdFilter') {
                trace.poiPoolEvolution.afterRdFilter = size;
            }
            else if (stage === 'afterConstraints') {
                trace.poiPoolEvolution.afterConstraints = size;
            }
            else if (stage === 'final') {
                trace.poiPoolEvolution.finalSize = size;
                trace.quality.poiPoolSize = size;
                this.metrics.quality.poiPoolSizes.push(size);
            }
            this.logger.debug(`[TRACE ${requestId}] POI pool size at ${stage || 'unknown'}: ${size}`);
        }
    }
    recordPoiPoolFilter(requestId, stage, sizeBefore, sizeAfter, reason) {
        const trace = this.traces.get(requestId);
        if (trace) {
            if (!trace.poiPoolEvolution) {
                trace.poiPoolEvolution = {
                    filters: [],
                };
            }
            trace.poiPoolEvolution.filters.push({
                stage,
                sizeBefore,
                sizeAfter,
                reason,
            });
            this.logger.debug(`[TRACE ${requestId}] POI pool filtered at ${stage}: ${sizeBefore} -> ${sizeAfter}${reason ? ` (${reason})` : ''}`);
        }
    }
    recordHardConstraintsHit(requestId, count) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.quality.hardConstraintsHitCount = count;
            this.metrics.quality.hardConstraintsHitCounts.push(count);
            this.logger.debug(`[TRACE ${requestId}] Hard constraints hit: ${count}`);
        }
    }
    recordSoftConstraintsHit(requestId, count) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.quality.softConstraintsHitCount = count;
            this.metrics.quality.softConstraintsHitCounts.push(count);
            this.logger.debug(`[TRACE ${requestId}] Soft constraints hit: ${count}`);
        }
    }
    recordRepairActionCount(requestId, count) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.quality.repairActionCount = count;
            this.metrics.quality.repairActionCounts.push(count);
            this.logger.debug(`[TRACE ${requestId}] Repair actions: ${count}`);
        }
    }
    recordSelectedRd(requestId, rdId, rdName, decisionContext) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.quality.selectedRdId = rdId;
            trace.quality.selectedRdName = rdName;
            if (decisionContext) {
                trace.decisionContext = decisionContext;
            }
            this.metrics.quality.selectedRdIds.push(rdId);
            this.logger.log(`[TRACE ${requestId}] Selected RD: ${rdName} (ID: ${rdId})`);
        }
    }
    recordCorridorGeomInvalid(requestId, errorMessage) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.errors.corridorGeomInvalid = true;
            if (errorMessage) {
                if (!trace.errors.errorMessages) {
                    trace.errors.errorMessages = [];
                }
                trace.errors.errorMessages.push(`corridor_geom_invalid: ${errorMessage}`);
            }
            this.metrics.errors.corridorGeomInvalid++;
            this.logger.warn(`[TRACE ${requestId}] Corridor geometry invalid: ${errorMessage || 'unknown'}`);
        }
    }
    recordPoiQueryTimeout(requestId, timeoutMs) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.errors.poiQueryTimeout = true;
            if (!trace.errors.errorMessages) {
                trace.errors.errorMessages = [];
            }
            trace.errors.errorMessages.push(`poi_query_timeout${timeoutMs ? ` (${timeoutMs}ms)` : ''}`);
            this.metrics.errors.poiQueryTimeout++;
            this.logger.warn(`[TRACE ${requestId}] POI query timeout${timeoutMs ? ` after ${timeoutMs}ms` : ''}`);
        }
    }
    recordNoCandidatesFallback(requestId, reason) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.errors.noCandidatesFallbackUsed = true;
            if (reason) {
                if (!trace.errors.errorMessages) {
                    trace.errors.errorMessages = [];
                }
                trace.errors.errorMessages.push(`no_candidates_fallback: ${reason}`);
            }
            this.metrics.errors.noCandidatesFallbackUsed++;
            this.logger.warn(`[TRACE ${requestId}] No candidates fallback used${reason ? `: ${reason}` : ''}`);
        }
    }
    completeTrace(requestId) {
        const trace = this.traces.get(requestId);
        if (trace) {
            trace.endTime = Date.now();
            const totalLatency = trace.endTime - trace.startTime;
            this.logger.log(`[TRACE ${requestId}] Completed in ${totalLatency}ms`);
            return trace;
        }
        return null;
    }
    getTrace(requestId) {
        return this.traces.get(requestId) || null;
    }
    generateTraceReport(requestId) {
        const trace = this.getTrace(requestId);
        if (!trace) {
            return {
                latencyBreakdown: { breakdown: {} },
                rdSelection: {},
                poiPoolEvolution: {},
            };
        }
        const latencies = trace.latencies;
        const latencyEntries = Object.entries(latencies).filter(([_, v]) => v !== undefined);
        const slowest = latencyEntries.reduce((max, [stage, latency]) => (latency > max.latency ? { stage, latency } : max), { stage: '', latency: 0 });
        const totalLatency = trace.endTime ? trace.endTime - trace.startTime : undefined;
        const rdSelection = {
            selectedRdId: trace.quality.selectedRdId,
            selectedRdName: trace.quality.selectedRdName,
            whySelected: trace.decisionContext
                ? {
                    scoreBreakdown: trace.decisionContext.scoreBreakdown
                        ? Object.fromEntries(Object.entries({
                            tagMatch: trace.decisionContext.scoreBreakdown.tagMatch,
                            seasonMatch: trace.decisionContext.scoreBreakdown.seasonMatch,
                            paceMatch: trace.decisionContext.scoreBreakdown.paceMatch,
                            riskMatch: trace.decisionContext.scoreBreakdown.riskMatch,
                            totalScore: trace.decisionContext.scoreBreakdown.totalScore,
                        }).filter(([_, v]) => v !== undefined))
                        : undefined,
                    matchedSignals: trace.decisionContext.matchedSignals,
                }
                : undefined,
        };
        const poiPoolEvolution = trace.poiPoolEvolution
            ? {
                initialSize: trace.poiPoolEvolution.initialSize,
                finalSize: trace.poiPoolEvolution.finalSize,
                shrinkage: trace.poiPoolEvolution.initialSize && trace.poiPoolEvolution.finalSize
                    ? trace.poiPoolEvolution.initialSize - trace.poiPoolEvolution.finalSize
                    : undefined,
                shrinkagePercentage: trace.poiPoolEvolution.initialSize && trace.poiPoolEvolution.finalSize
                    ? ((trace.poiPoolEvolution.initialSize - trace.poiPoolEvolution.finalSize) /
                        trace.poiPoolEvolution.initialSize) *
                        100
                    : undefined,
                filters: trace.poiPoolEvolution.filters,
            }
            : {};
        return {
            latencyBreakdown: {
                slowestStage: slowest.stage || undefined,
                slowestLatency: slowest.latency > 0 ? slowest.latency : undefined,
                totalLatency,
                breakdown: Object.fromEntries(latencyEntries),
            },
            rdSelection,
            poiPoolEvolution,
        };
    }
    getMetrics() {
        const calculateStats = (values) => {
            if (values.length === 0) {
                return { avg: 0, p95: 0, p99: 0, min: 0, max: 0 };
            }
            const sorted = [...values].sort((a, b) => a - b);
            return {
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                p95: sorted[Math.floor(sorted.length * 0.95)],
                p99: sorted[Math.floor(sorted.length * 0.99)],
                min: sorted[0],
                max: sorted[sorted.length - 1],
            };
        };
        const rdIdDistribution = {};
        this.metrics.quality.selectedRdIds.forEach((id) => {
            rdIdDistribution[id] = (rdIdDistribution[id] || 0) + 1;
        });
        return {
            latencies: {
                rdSelectMs: calculateStats(this.metrics.latencies.rdSelectMs),
                poiPoolQueryMs: calculateStats(this.metrics.latencies.poiPoolQueryMs),
                constraintsInjectMs: calculateStats(this.metrics.latencies.constraintsInjectMs),
                planGenerateMs: calculateStats(this.metrics.latencies.planGenerateMs),
                neptuneRepairMs: calculateStats(this.metrics.latencies.neptuneRepairMs),
            },
            quality: {
                poiPoolSize: calculateStats(this.metrics.quality.poiPoolSizes),
                hardConstraintsHitCount: {
                    avg: calculateStats(this.metrics.quality.hardConstraintsHitCounts).avg,
                    max: calculateStats(this.metrics.quality.hardConstraintsHitCounts).max,
                },
                softConstraintsHitCount: {
                    avg: calculateStats(this.metrics.quality.softConstraintsHitCounts).avg,
                    max: calculateStats(this.metrics.quality.softConstraintsHitCounts).max,
                },
                repairActionCount: {
                    avg: calculateStats(this.metrics.quality.repairActionCounts).avg,
                    max: calculateStats(this.metrics.quality.repairActionCounts).max,
                },
                selectedRdIdDistribution: rdIdDistribution,
            },
            errors: {
                corridorGeomInvalid: this.metrics.errors.corridorGeomInvalid,
                poiQueryTimeout: this.metrics.errors.poiQueryTimeout,
                noCandidatesFallbackUsed: this.metrics.errors.noCandidatesFallbackUsed,
            },
        };
    }
    cleanupOldTraces(maxAgeMs = 3600000) {
        const now = Date.now();
        for (const [requestId, trace] of this.traces.entries()) {
            if (trace.endTime && now - trace.endTime > maxAgeMs) {
                this.traces.delete(requestId);
            }
        }
    }
};
exports.RouteDirectionObservabilityService = RouteDirectionObservabilityService;
exports.RouteDirectionObservabilityService = RouteDirectionObservabilityService = RouteDirectionObservabilityService_1 = __decorate([
    (0, common_1.Injectable)()
], RouteDirectionObservabilityService);
//# sourceMappingURL=route-direction-observability.service.js.map