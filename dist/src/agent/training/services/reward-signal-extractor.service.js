"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RewardSignalExtractorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardSignalExtractorService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let RewardSignalExtractorService = RewardSignalExtractorService_1 = class RewardSignalExtractorService {
    constructor() {
        this.logger = new common_1.Logger(RewardSignalExtractorService_1.name);
    }
    extractFromTripNARAApproval(signals) {
        this.logger.debug(`[RewardExtractor] 从 TripNARA 审批信号提取: system_approved=${signals.system_approval.system_approved}, user_approved=${signals.user_preference.user_approved}`);
        const rewardSignals = [];
        rewardSignals.push({
            type: signals.system_approval.safety_pass ? 'SAFETY_PASS' : 'GATE_FAIL',
            value: signals.system_approval.safety_pass ? 0.3 : -2.0,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'SAFETY',
                passed: signals.system_approval.safety_pass,
            },
        });
        rewardSignals.push({
            type: signals.system_approval.compliance_pass ? 'COMPLIANCE_PASS' : 'GATE_FAIL',
            value: signals.system_approval.compliance_pass ? 0.2 : -1.5,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'COMPLIANCE',
                passed: signals.system_approval.compliance_pass,
            },
        });
        rewardSignals.push({
            type: signals.system_approval.feasibility_pass ? 'FEASIBILITY_PASS' : 'GATE_FAIL',
            value: signals.system_approval.feasibility_pass ? 0.2 : -1.0,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'FEASIBILITY',
                passed: signals.system_approval.feasibility_pass,
            },
        });
        if (signals.system_approval.evidence_sufficient) {
            rewardSignals.push({
                type: 'EVIDENCE_QUALITY',
                value: 0.1,
                timestamp: new Date().toISOString(),
                source: 'SYSTEM',
                is_gate_signal: false,
                metadata: {
                    evidence_sufficient: true,
                },
            });
        }
        rewardSignals.push({
            type: signals.system_approval.system_approved ? 'GATE_PASS' : 'GATE_FAIL',
            value: signals.system_approval.system_approved ? 0 : -0.5,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                system_approved: signals.system_approval.system_approved,
                rejection_reasons: signals.system_approval.rejection_reasons,
            },
        });
        if (signals.system_approval.system_approved) {
            rewardSignals.push({
                type: 'USER_APPROVAL',
                value: signals.user_preference.user_approved ? 0.3 : -0.1,
                timestamp: new Date().toISOString(),
                source: 'USER',
                is_gate_signal: false,
                metadata: {
                    user_approved: signals.user_preference.user_approved,
                    is_dpo_positive: signals.user_preference.user_approved,
                },
            });
            if (signals.user_preference.satisfaction_rating) {
                const rating = signals.user_preference.satisfaction_rating;
                const bonus = ((rating - 3) / 2) * 0.1;
                rewardSignals.push({
                    type: 'PREFERENCE_BONUS',
                    value: bonus,
                    timestamp: new Date().toISOString(),
                    source: 'USER',
                    is_gate_signal: false,
                    metadata: {
                        satisfaction_rating: rating,
                        bonus_type: 'SATISFACTION',
                    },
                });
            }
            if (signals.user_preference.preference_factors) {
                const factors = signals.user_preference.preference_factors;
                const avgFactor = (factors.route_appeal +
                    factors.pacing_comfort +
                    factors.poi_interest +
                    factors.cost_acceptability) / 4;
                if (avgFactor > 0.7) {
                    rewardSignals.push({
                        type: 'PREFERENCE_BONUS',
                        value: (avgFactor - 0.7) * 0.1,
                        timestamp: new Date().toISOString(),
                        source: 'USER',
                        is_gate_signal: false,
                        metadata: {
                            avg_preference_factor: avgFactor,
                            bonus_type: 'PREFERENCE_FACTORS',
                            factors,
                        },
                    });
                }
            }
        }
        this.logger.debug(`[RewardExtractor] 提取到 ${rewardSignals.length} 个 TripNARA 信号`);
        return rewardSignals;
    }
    extractFromGateMetrics(metrics) {
        const signals = [];
        const safetyPass = metrics.safety_score >= 0.9;
        signals.push({
            type: safetyPass ? 'SAFETY_PASS' : 'GATE_FAIL',
            value: safetyPass ? metrics.safety_score * 0.3 : -2.0,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'SAFETY',
                score: metrics.safety_score,
                threshold: 0.9,
                passed: safetyPass,
            },
        });
        const compliancePass = metrics.compliance_score >= 0.95;
        signals.push({
            type: compliancePass ? 'COMPLIANCE_PASS' : 'GATE_FAIL',
            value: compliancePass ? metrics.compliance_score * 0.2 : -1.5,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'COMPLIANCE',
                score: metrics.compliance_score,
                threshold: 0.95,
                passed: compliancePass,
            },
        });
        const feasibilityPass = metrics.feasibility_score >= 0.8;
        signals.push({
            type: feasibilityPass ? 'FEASIBILITY_PASS' : 'GATE_FAIL',
            value: feasibilityPass ? metrics.feasibility_score * 0.2 : -1.0,
            timestamp: new Date().toISOString(),
            source: 'SYSTEM',
            is_gate_signal: true,
            metadata: {
                gate_type: 'FEASIBILITY',
                score: metrics.feasibility_score,
                threshold: 0.8,
                passed: feasibilityPass,
            },
        });
        if (metrics.evidence_coverage !== undefined) {
            signals.push({
                type: 'EVIDENCE_QUALITY',
                value: metrics.evidence_coverage * 0.1,
                timestamp: new Date().toISOString(),
                source: 'SYSTEM',
                is_gate_signal: false,
                metadata: {
                    evidence_coverage: metrics.evidence_coverage,
                },
            });
        }
        if (metrics.risk_disclosure === true) {
            signals.push({
                type: 'RISK_DISCLOSURE',
                value: 0.05,
                timestamp: new Date().toISOString(),
                source: 'SYSTEM',
                is_gate_signal: false,
                metadata: {
                    risk_disclosed: true,
                },
            });
        }
        return signals;
    }
    calculateTripNARATotalReward(signals) {
        const gateSignals = signals.filter(s => s.is_gate_signal);
        const gateFailed = gateSignals.some(s => s.type === 'GATE_FAIL' || s.value < 0);
        if (gateFailed) {
            const minGateValue = Math.min(...gateSignals.map(s => s.value));
            return {
                total_reward: minGateValue,
                gate_passed: false,
                trainable: false,
            };
        }
        const totalReward = signals
            .filter(s => !s.is_gate_signal || s.value > 0)
            .reduce((sum, s) => sum + s.value, 0);
        return {
            total_reward: Math.min(1.0, totalReward),
            gate_passed: true,
            trainable: true,
        };
    }
    extractFromApproval(approval) {
        this.logger.debug(`[RewardExtractor] [Legacy] 从审批提取reward: ${approval}`);
        const signals = [];
        if (approval === client_1.ApprovalStatus.APPROVED) {
            signals.push({
                type: 'USER_APPROVAL',
                value: 1.0,
                timestamp: new Date().toISOString(),
                metadata: {
                    approval_status: 'APPROVED',
                },
            });
        }
        else if (approval === client_1.ApprovalStatus.REJECTED) {
            signals.push({
                type: 'USER_APPROVAL',
                value: -0.5,
                timestamp: new Date().toISOString(),
                metadata: {
                    approval_status: 'REJECTED',
                },
            });
        }
        this.logger.debug(`[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`);
        return signals;
    }
    extractFromExecution(executionResult) {
        this.logger.debug(`[RewardExtractor] 从执行结果提取reward: success=${executionResult.success}`);
        const signals = [];
        if (executionResult.success) {
            signals.push({
                type: 'EXECUTION_SUCCESS',
                value: 0.8,
                timestamp: new Date().toISOString(),
                metadata: {
                    execution_success: true,
                    error: executionResult.error || null,
                },
            });
        }
        else {
            signals.push({
                type: 'EXECUTION_FAILURE',
                value: -0.3,
                timestamp: new Date().toISOString(),
                metadata: {
                    execution_success: false,
                    error: executionResult.error || 'Unknown error',
                },
            });
        }
        this.logger.debug(`[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`);
        return signals;
    }
    extractFromPlanCommit(success) {
        this.logger.debug(`[RewardExtractor] 从规划提交提取reward: success=${success}`);
        const signals = [];
        if (success) {
            signals.push({
                type: 'PLAN_COMMIT',
                value: 0.8,
                timestamp: new Date().toISOString(),
                metadata: {
                    commit_success: true,
                },
            });
        }
        return signals;
    }
    extractFromAlignmentScore(alignmentScore) {
        this.logger.debug(`[RewardExtractor] 从对齐分数提取reward: score=${alignmentScore}`);
        const normalizedScore = Math.max(0, Math.min(1, alignmentScore));
        return [
            {
                type: 'DECISION_ALIGNMENT',
                value: normalizedScore,
                timestamp: new Date().toISOString(),
                metadata: {
                    alignment_score: normalizedScore,
                },
            },
        ];
    }
    calculateTotalReward(signals) {
        return signals.reduce((sum, signal) => sum + signal.value, 0);
    }
    mergeSignals(...signalArrays) {
        return signalArrays.flat();
    }
    extractFromUserFeedback(feedback) {
        this.logger.debug(`[RewardExtractor] 从用户反馈提取reward: type=${feedback.type}`);
        const signals = [];
        switch (feedback.type) {
            case 'TRIP_COMPLETED':
                if (feedback.data.overallSatisfaction !== undefined && feedback.data.overallSatisfaction >= 4) {
                    signals.push({
                        type: 'EXECUTION_SUCCESS',
                        value: 0.8,
                        timestamp: new Date().toISOString(),
                        source: 'USER',
                        is_gate_signal: false,
                        metadata: {
                            trip_completed: true,
                            overall_satisfaction: feedback.data.overallSatisfaction,
                            actual_days: feedback.data.actualDays,
                            actual_ascent: feedback.data.actualAscent,
                        },
                    });
                }
                else if (feedback.data.overallSatisfaction !== undefined && feedback.data.overallSatisfaction < 3) {
                    signals.push({
                        type: 'EXECUTION_FAILURE',
                        value: -0.3,
                        timestamp: new Date().toISOString(),
                        source: 'USER',
                        is_gate_signal: false,
                        metadata: {
                            trip_completed: true,
                            overall_satisfaction: feedback.data.overallSatisfaction,
                            actual_days: feedback.data.actualDays,
                        },
                    });
                }
                break;
            case 'DAY_FAILED':
                signals.push({
                    type: 'EXECUTION_FAILURE',
                    value: -0.3,
                    timestamp: new Date().toISOString(),
                    source: 'USER',
                    is_gate_signal: false,
                    metadata: {
                        day_failed: true,
                        failed_day_numbers: feedback.data.failedDayNumbers,
                        failure_reason: feedback.data.failureReason,
                    },
                });
                break;
            case 'POI_SKIPPED':
                signals.push({
                    type: 'CORE_POI_SKIPPED',
                    value: -0.1,
                    timestamp: new Date().toISOString(),
                    source: 'USER',
                    is_gate_signal: false,
                    metadata: {
                        poi_skipped: true,
                        skipped_poi_ids: feedback.data.skippedPoiIds,
                        skip_reason: feedback.data.skipReason,
                    },
                });
                break;
            case 'POI_ADDED':
                signals.push({
                    type: 'POI_ADDED',
                    value: 0.1,
                    timestamp: new Date().toISOString(),
                    source: 'USER',
                    is_gate_signal: false,
                    metadata: {
                        poi_added: true,
                        added_poi_ids: feedback.data.addedPoiIds,
                    },
                });
                break;
        }
        this.logger.debug(`[RewardExtractor] 从用户反馈提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`);
        return signals;
    }
};
exports.RewardSignalExtractorService = RewardSignalExtractorService;
exports.RewardSignalExtractorService = RewardSignalExtractorService = RewardSignalExtractorService_1 = __decorate([
    (0, common_1.Injectable)()
], RewardSignalExtractorService);
//# sourceMappingURL=reward-signal-extractor.service.js.map