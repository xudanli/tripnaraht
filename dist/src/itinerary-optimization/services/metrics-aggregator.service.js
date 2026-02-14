"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MetricsAggregatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsAggregatorService = void 0;
const common_1 = require("@nestjs/common");
let MetricsAggregatorService = MetricsAggregatorService_1 = class MetricsAggregatorService {
    constructor() {
        this.logger = new common_1.Logger(MetricsAggregatorService_1.name);
        this.executionRecords = [];
    }
    recordExecution(record) {
        this.executionRecords.push(record);
        this.logger.debug(`记录执行结果: ${record.request_id}, status=${record.status}`);
    }
    recordExecutions(records) {
        this.executionRecords.push(...records);
        this.logger.debug(`批量记录 ${records.length} 条执行结果`);
    }
    aggregateMetrics(options = {}) {
        let records = [...this.executionRecords];
        if (options.start_time) {
            records = records.filter(r => r.timestamp >= options.start_time);
        }
        if (options.end_time) {
            records = records.filter(r => r.timestamp <= options.end_time);
        }
        if (options.filter) {
            records = records.filter(options.filter);
        }
        if (records.length === 0) {
            return this.createEmptyMetrics();
        }
        const executability = this.calculateExecutability(records);
        const rejectionQuality = this.calculateRejectionQuality(records);
        const alternativeAcceptance = this.calculateAlternativeAcceptance(records);
        const deviation = this.calculateDeviation(records);
        const dataQuality = this.calculateDataQuality(records);
        const performance = this.calculatePerformance(records);
        return {
            executability,
            rejection_quality: rejectionQuality,
            alternative_acceptance: alternativeAcceptance,
            deviation,
            data_quality: dataQuality,
            performance,
        };
    }
    calculateExecutability(records) {
        const total = records.length;
        const successful = records.filter(r => r.status === 'SUCCESS').length;
        const rejected = records.filter(r => r.status === 'REJECTED').length;
        const rejectionReasons = {};
        records
            .filter(r => r.status === 'REJECTED' && r.rejection_reason)
            .forEach(r => {
            const reason = r.rejection_reason;
            rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        });
        return {
            success_rate: total > 0 ? successful / total : 0,
            rejection_rate: total > 0 ? rejected / total : 0,
            rejection_reasons: rejectionReasons,
            total_attempts: total,
            successful_attempts: successful,
            rejected_attempts: rejected,
        };
    }
    calculateRejectionQuality(records) {
        const rejections = records.filter(r => r.status === 'REJECTED');
        const total = rejections.length;
        if (total === 0) {
            return {
                reasonable_rate: 1.0,
                false_positive_rate: 0,
                false_negative_rate: 0,
                total_rejections: 0,
                reasonable_rejections: 0,
                false_positives: 0,
                false_negatives: 0,
            };
        }
        const reasonable = rejections.filter(r => r.rejection_quality === 'REASONABLE').length;
        const falsePositives = rejections.filter(r => r.rejection_quality === 'FALSE_POSITIVE').length;
        const falseNegatives = records.filter(r => r.status === 'SUCCESS' && r.rejection_quality === 'FALSE_NEGATIVE').length;
        return {
            reasonable_rate: total > 0 ? reasonable / total : 0,
            false_positive_rate: total > 0 ? falsePositives / total : 0,
            false_negative_rate: records.length > 0 ? falseNegatives / records.length : 0,
            total_rejections: total,
            reasonable_rejections: reasonable,
            false_positives: falsePositives,
            false_negatives: falseNegatives,
        };
    }
    calculateAlternativeAcceptance(records) {
        const withAlternatives = records.filter(r => r.alternatives_proposed !== undefined && r.alternatives_proposed > 0);
        if (withAlternatives.length === 0) {
            return {
                proposed_count: 0,
                accepted_count: 0,
                acceptance_rate: 0,
                avg_improvement: 0,
                improvement_distribution: {
                    min: 0,
                    max: 0,
                    median: 0,
                    p75: 0,
                    p90: 0,
                },
            };
        }
        const proposedCount = withAlternatives.reduce((sum, r) => sum + (r.alternatives_proposed || 0), 0);
        const acceptedCount = withAlternatives.reduce((sum, r) => sum + (r.alternatives_accepted || 0), 0);
        const improvements = withAlternatives
            .filter(r => r.improvement_pct !== undefined)
            .map(r => r.improvement_pct)
            .sort((a, b) => a - b);
        const avgImprovement = improvements.length > 0
            ? improvements.reduce((sum, v) => sum + v, 0) / improvements.length
            : 0;
        const getPercentile = (arr, p) => {
            if (arr.length === 0)
                return 0;
            const index = Math.floor(arr.length * p);
            return arr[Math.min(index, arr.length - 1)];
        };
        return {
            proposed_count: proposedCount,
            accepted_count: acceptedCount,
            acceptance_rate: proposedCount > 0 ? acceptedCount / proposedCount : 0,
            avg_improvement: avgImprovement,
            improvement_distribution: {
                min: improvements.length > 0 ? improvements[0] : 0,
                max: improvements.length > 0 ? improvements[improvements.length - 1] : 0,
                median: getPercentile(improvements, 0.5),
                p75: getPercentile(improvements, 0.75),
                p90: getPercentile(improvements, 0.9),
            },
        };
    }
    calculateDeviation(records) {
        const withDeviations = records.filter(r => r.plan_change_ratio !== undefined || r.time_deviation_min !== undefined || r.cost_deviation_pct !== undefined);
        if (withDeviations.length === 0) {
            return {
                avg_plan_change_ratio: 0,
                avg_time_deviation_min: 0,
                avg_cost_deviation_pct: 0,
                max_time_deviation_min: 0,
                max_cost_deviation_pct: 0,
            };
        }
        const planChanges = withDeviations
            .filter(r => r.plan_change_ratio !== undefined)
            .map(r => r.plan_change_ratio);
        const timeDeviations = withDeviations
            .filter(r => r.time_deviation_min !== undefined)
            .map(r => Math.abs(r.time_deviation_min));
        const costDeviations = withDeviations
            .filter(r => r.cost_deviation_pct !== undefined)
            .map(r => Math.abs(r.cost_deviation_pct));
        return {
            avg_plan_change_ratio: planChanges.length > 0
                ? planChanges.reduce((sum, v) => sum + v, 0) / planChanges.length
                : 0,
            avg_time_deviation_min: timeDeviations.length > 0
                ? timeDeviations.reduce((sum, v) => sum + v, 0) / timeDeviations.length
                : 0,
            avg_cost_deviation_pct: costDeviations.length > 0
                ? costDeviations.reduce((sum, v) => sum + v, 0) / costDeviations.length
                : 0,
            max_time_deviation_min: timeDeviations.length > 0 ? Math.max(...timeDeviations) : 0,
            max_cost_deviation_pct: costDeviations.length > 0 ? Math.max(...costDeviations) : 0,
        };
    }
    calculateDataQuality(records) {
        const withDataQuality = records.filter(r => r.data_quality !== undefined);
        if (withDataQuality.length === 0) {
            return {
                missing_data_rate: 0,
                stale_data_rate: 0,
                low_reliability_rate: 0,
                data_sources: {},
            };
        }
        let totalMissing = 0;
        let totalStale = 0;
        let totalLowReliability = 0;
        const dataSources = {};
        withDataQuality.forEach(r => {
            const dq = r.data_quality;
            totalMissing += dq.missing.length;
            totalStale += dq.stale.length;
            totalLowReliability += dq.low_reliability.length;
            [...dq.missing, ...dq.stale, ...dq.low_reliability].forEach(source => {
                if (!dataSources[source]) {
                    dataSources[source] = { count: 0, missing: 0, stale: 0, low_reliability: 0 };
                }
                dataSources[source].count++;
                if (dq.missing.includes(source))
                    dataSources[source].missing++;
                if (dq.stale.includes(source))
                    dataSources[source].stale++;
                if (dq.low_reliability.includes(source))
                    dataSources[source].low_reliability++;
            });
        });
        const totalDataPoints = withDataQuality.length * 5;
        return {
            missing_data_rate: totalDataPoints > 0 ? totalMissing / totalDataPoints : 0,
            stale_data_rate: totalDataPoints > 0 ? totalStale / totalDataPoints : 0,
            low_reliability_rate: totalDataPoints > 0 ? totalLowReliability / totalDataPoints : 0,
            data_sources: dataSources,
        };
    }
    calculatePerformance(records) {
        const withSolveTime = records
            .filter(r => r.solve_time_ms !== undefined)
            .map(r => r.solve_time_ms)
            .sort((a, b) => a - b);
        if (withSolveTime.length === 0) {
            return {
                avg_solve_time_ms: 0,
                avg_solve_time_p50_ms: 0,
                avg_solve_time_p90_ms: 0,
                avg_solve_time_p99_ms: 0,
                max_solve_time_ms: 0,
            };
        }
        const getPercentile = (arr, p) => {
            const index = Math.floor(arr.length * p);
            return arr[Math.min(index, arr.length - 1)];
        };
        return {
            avg_solve_time_ms: withSolveTime.reduce((sum, v) => sum + v, 0) / withSolveTime.length,
            avg_solve_time_p50_ms: getPercentile(withSolveTime, 0.5),
            avg_solve_time_p90_ms: getPercentile(withSolveTime, 0.9),
            avg_solve_time_p99_ms: getPercentile(withSolveTime, 0.99),
            max_solve_time_ms: withSolveTime[withSolveTime.length - 1],
        };
    }
    createEmptyMetrics() {
        return {
            executability: {
                success_rate: 0,
                rejection_rate: 0,
                rejection_reasons: {},
                total_attempts: 0,
                successful_attempts: 0,
                rejected_attempts: 0,
            },
            rejection_quality: {
                reasonable_rate: 0,
                false_positive_rate: 0,
                false_negative_rate: 0,
                total_rejections: 0,
                reasonable_rejections: 0,
                false_positives: 0,
                false_negatives: 0,
            },
            alternative_acceptance: {
                proposed_count: 0,
                accepted_count: 0,
                acceptance_rate: 0,
                avg_improvement: 0,
                improvement_distribution: {
                    min: 0,
                    max: 0,
                    median: 0,
                    p75: 0,
                    p90: 0,
                },
            },
            deviation: {
                avg_plan_change_ratio: 0,
                avg_time_deviation_min: 0,
                avg_cost_deviation_pct: 0,
                max_time_deviation_min: 0,
                max_cost_deviation_pct: 0,
            },
            data_quality: {
                missing_data_rate: 0,
                stale_data_rate: 0,
                low_reliability_rate: 0,
                data_sources: {},
            },
            performance: {
                avg_solve_time_ms: 0,
                avg_solve_time_p50_ms: 0,
                avg_solve_time_p90_ms: 0,
                avg_solve_time_p99_ms: 0,
                max_solve_time_ms: 0,
            },
        };
    }
    getExecutionRecords(options = {}) {
        let records = [...this.executionRecords];
        if (options.start_time) {
            records = records.filter(r => r.timestamp >= options.start_time);
        }
        if (options.end_time) {
            records = records.filter(r => r.timestamp <= options.end_time);
        }
        records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        if (options.limit) {
            records = records.slice(0, options.limit);
        }
        return records;
    }
    clearRecords() {
        this.executionRecords = [];
        this.logger.debug('已清空所有执行记录');
    }
};
exports.MetricsAggregatorService = MetricsAggregatorService;
exports.MetricsAggregatorService = MetricsAggregatorService = MetricsAggregatorService_1 = __decorate([
    (0, common_1.Injectable)()
], MetricsAggregatorService);
//# sourceMappingURL=metrics-aggregator.service.js.map