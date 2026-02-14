"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TrajectoryValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrajectoryValidatorService = exports.TripNARARejectCode = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
var TripNARARejectCode;
(function (TripNARARejectCode) {
    TripNARARejectCode["EVIDENCE_MISSING"] = "EVIDENCE_MISSING";
    TripNARARejectCode["EVIDENCE_STALE"] = "EVIDENCE_STALE";
    TripNARARejectCode["EVIDENCE_CONFLICT"] = "EVIDENCE_CONFLICT";
    TripNARARejectCode["EVIDENCE_INSUFFICIENT"] = "EVIDENCE_INSUFFICIENT";
    TripNARARejectCode["GATE_BYPASSED"] = "GATE_BYPASSED";
    TripNARARejectCode["GATE_RESULT_MISSING"] = "GATE_RESULT_MISSING";
    TripNARARejectCode["GATE_NOT_REPRODUCIBLE"] = "GATE_NOT_REPRODUCIBLE";
    TripNARARejectCode["GATE_BLOCKED"] = "GATE_BLOCKED";
    TripNARARejectCode["NON_EXECUTABLE_PLAN"] = "NON_EXECUTABLE_PLAN";
    TripNARARejectCode["TEMPORAL_CONFLICT"] = "TEMPORAL_CONFLICT";
    TripNARARejectCode["SPATIAL_INCONSISTENCY"] = "SPATIAL_INCONSISTENCY";
    TripNARARejectCode["HIGH_RISK_NOT_DISCLOSED"] = "HIGH_RISK_NOT_DISCLOSED";
    TripNARARejectCode["NO_ALTERNATIVE_FOR_BLOCKED"] = "NO_ALTERNATIVE_FOR_BLOCKED";
    TripNARARejectCode["SAFETY_OVERRIDE_UNJUSTIFIED"] = "SAFETY_OVERRIDE_UNJUSTIFIED";
    TripNARARejectCode["CRITICAL_RISK_WARNING"] = "CRITICAL_RISK_WARNING";
    TripNARARejectCode["DECISION_CHAIN_BROKEN"] = "DECISION_CHAIN_BROKEN";
    TripNARARejectCode["STATE_ACTION_MISMATCH"] = "STATE_ACTION_MISMATCH";
    TripNARARejectCode["MISSING_ACTOR_ATTRIBUTION"] = "MISSING_ACTOR_ATTRIBUTION";
    TripNARARejectCode["EXECUTION_FAILED"] = "EXECUTION_FAILED";
    TripNARARejectCode["USER_REJECTED"] = "USER_REJECTED";
})(TripNARARejectCode || (exports.TripNARARejectCode = TripNARARejectCode = {}));
let TrajectoryValidatorService = TrajectoryValidatorService_1 = class TrajectoryValidatorService {
    constructor() {
        this.logger = new common_1.Logger(TrajectoryValidatorService_1.name);
        this.VALIDATOR_VERSION = '2.0.0';
    }
    async validateTripNARATrajectory(trajectory) {
        this.logger.debug(`[TripNARAValidator] 开始验证轨迹: ${trajectory.trajectory_id}`);
        const rejections = [];
        this.checkEvidence(trajectory, rejections);
        this.checkGateIntegrity(trajectory, rejections);
        this.checkRiskDisclosure(trajectory, rejections);
        this.checkDecisionChain(trajectory, rejections);
        this.checkActorAttribution(trajectory, rejections);
        const auditability = this.calculateAuditability(trajectory, rejections);
        const criticalCount = rejections.filter(r => r.severity === 'CRITICAL').length;
        const majorCount = rejections.filter(r => r.severity === 'MAJOR').length;
        const minorCount = rejections.filter(r => r.severity === 'MINOR').length;
        const isValid = criticalCount === 0;
        const trainable = criticalCount === 0 && majorCount <= 1;
        const trainable_for_dpo = criticalCount === 0;
        const trainable_for_ppo = criticalCount === 0 && majorCount === 0;
        const score = Math.max(0, 1 - criticalCount * 0.3 - majorCount * 0.1 - minorCount * 0.02);
        const result = {
            isValid,
            score,
            trainable,
            trainable_for_dpo,
            trainable_for_ppo,
            rejection_reasons: rejections,
            auditability,
            metadata: {
                validation_time: new Date().toISOString(),
                validator_version: this.VALIDATOR_VERSION,
            },
        };
        this.logger.debug(`[TripNARAValidator] 验证完成: isValid=${isValid}, score=${score.toFixed(2)}, trainable=${trainable}, criticals=${criticalCount}, majors=${majorCount}`);
        return result;
    }
    checkEvidence(trajectory, rejections) {
        var _a;
        for (const step of trajectory.steps) {
            const state = step.state;
            if (!state.evidence) {
                if (step.step_index === 0) {
                    this.logger.debug(`[TripNARAValidator] 轨迹使用旧版 RLState，跳过证据检查`);
                }
                continue;
            }
            if (state.evidence.length === 0) {
                rejections.push({
                    code: TripNARARejectCode.EVIDENCE_MISSING,
                    message: `Step ${step.step_index}: 无证据引用`,
                    severity: 'CRITICAL',
                    step_index: step.step_index,
                });
            }
            const expiredEvidence = state.evidence.filter(e => e.freshness === 'EXPIRED');
            if (expiredEvidence.length > 0) {
                rejections.push({
                    code: TripNARARejectCode.EVIDENCE_STALE,
                    message: `Step ${step.step_index}: ${expiredEvidence.length} 条证据已过期`,
                    severity: 'MAJOR',
                    step_index: step.step_index,
                });
            }
            if (state.uncertainty_flags) {
                if (state.uncertainty_flags.confidence_level === 'INSUFFICIENT') {
                    rejections.push({
                        code: TripNARARejectCode.EVIDENCE_INSUFFICIENT,
                        message: `Step ${step.step_index}: 置信度不足 - ${(_a = state.uncertainty_flags.uncertainty_reasons) === null || _a === void 0 ? void 0 : _a.join(', ')}`,
                        severity: 'MAJOR',
                        step_index: step.step_index,
                    });
                }
                if (state.uncertainty_flags.conflicting_evidence.length > 0) {
                    rejections.push({
                        code: TripNARARejectCode.EVIDENCE_CONFLICT,
                        message: `Step ${step.step_index}: 证据冲突未解决 - ${state.uncertainty_flags.conflicting_evidence.join(', ')}`,
                        severity: 'MAJOR',
                        step_index: step.step_index,
                    });
                }
            }
        }
    }
    checkGateIntegrity(trajectory, rejections) {
        const hasGateCheck = trajectory.steps.some(s => s.action.action_type === 'GATE_CHECK');
        const hasPlanGenerate = trajectory.steps.some(s => s.action.action_type === 'PLAN_GENERATE');
        if (hasPlanGenerate && !hasGateCheck) {
            rejections.push({
                code: TripNARARejectCode.GATE_BYPASSED,
                message: '生成计划前未执行门控检查',
                severity: 'CRITICAL',
            });
        }
        for (const step of trajectory.steps) {
            const state = step.state;
            if (step.action.action_type === 'PLAN_GENERATE') {
                if (!state.gate_result) {
                    rejections.push({
                        code: TripNARARejectCode.GATE_RESULT_MISSING,
                        message: `Step ${step.step_index}: PLAN_GENERATE 缺少 gate_result`,
                        severity: 'CRITICAL',
                        step_index: step.step_index,
                    });
                }
                else if (state.gate_result.gate_result === 'BLOCK') {
                    rejections.push({
                        code: TripNARARejectCode.GATE_BLOCKED,
                        message: `Step ${step.step_index}: 门控阻断但仍生成计划`,
                        severity: 'CRITICAL',
                        step_index: step.step_index,
                    });
                }
            }
            if (state.gate_context) {
                const gateContext = state.gate_context;
                if (gateContext.gate_evidence_refs.length === 0 &&
                    step.action.action_type === 'GATE_CHECK') {
                    rejections.push({
                        code: TripNARARejectCode.GATE_NOT_REPRODUCIBLE,
                        message: `Step ${step.step_index}: 门控决策无证据引用，不可复现`,
                        severity: 'MAJOR',
                        step_index: step.step_index,
                    });
                }
            }
        }
    }
    checkRiskDisclosure(trajectory, rejections) {
        var _a;
        for (const step of trajectory.steps) {
            const state = step.state;
            if (!state.risk_summary) {
                continue;
            }
            const overallRisk = state.risk_summary.overall_risk_level;
            const weatherRisk = (_a = state.risk_summary.weather) === null || _a === void 0 ? void 0 : _a.risk_level;
            if (overallRisk === 'HIGH' || overallRisk === 'CRITICAL' ||
                weatherRisk === 'HIGH' || weatherRisk === 'CRITICAL') {
                const hasRiskDisclosure = trajectory.steps.some(s => {
                    var _a;
                    return s.step_index > step.step_index &&
                        (((_a = s.action.action_params) === null || _a === void 0 ? void 0 : _a.risk_disclosed) === true ||
                            s.action.action_type === 'USER_CLARIFICATION');
                });
                if (!hasRiskDisclosure) {
                    rejections.push({
                        code: TripNARARejectCode.HIGH_RISK_NOT_DISCLOSED,
                        message: `Step ${step.step_index}: 高风险(${overallRisk || weatherRisk})未向用户披露`,
                        severity: 'CRITICAL',
                        step_index: step.step_index,
                    });
                }
            }
            if (state.risk_summary.road_conditions) {
                const closedRoads = Object.entries(state.risk_summary.road_conditions.f_road_status)
                    .filter(([_, status]) => status === 'CLOSED')
                    .map(([road]) => road);
                if (closedRoads.length > 0) {
                    const hasAlternative = trajectory.steps.some(s => {
                        var _a;
                        return s.action.action_type === 'ROUTE_ADJUST' &&
                            ((_a = s.action.action_params) === null || _a === void 0 ? void 0 : _a.alternative_route);
                    });
                    if (!hasAlternative) {
                        rejections.push({
                            code: TripNARARejectCode.NO_ALTERNATIVE_FOR_BLOCKED,
                            message: `Step ${step.step_index}: 道路关闭(${closedRoads.join(', ')})但无替代方案`,
                            severity: 'MAJOR',
                            step_index: step.step_index,
                        });
                    }
                }
            }
        }
    }
    checkDecisionChain(trajectory, rejections) {
        for (let i = 1; i < trajectory.steps.length; i++) {
            const prevStep = trajectory.steps[i - 1];
            const currStep = trajectory.steps[i];
            if (!this.isStateTransitionValid(prevStep, currStep)) {
                rejections.push({
                    code: TripNARARejectCode.STATE_ACTION_MISMATCH,
                    message: `Step ${i}: State 变化与前一步 Action(${prevStep.action.action_type}) 不一致`,
                    severity: 'MAJOR',
                    step_index: i,
                });
            }
        }
        const actionSequence = trajectory.steps.map(s => s.action.action_type);
        const planIndex = actionSequence.indexOf('PLAN_GENERATE');
        const gateIndex = actionSequence.indexOf('GATE_CHECK');
        if (planIndex !== -1 && (gateIndex === -1 || gateIndex > planIndex)) {
            rejections.push({
                code: TripNARARejectCode.DECISION_CHAIN_BROKEN,
                message: 'PLAN_GENERATE 前应有 GATE_CHECK',
                severity: 'MAJOR',
            });
        }
    }
    checkActorAttribution(trajectory, rejections) {
        const missingActorSteps = trajectory.steps.filter(s => !s.action.actor);
        if (missingActorSteps.length > 0) {
            const missingRatio = missingActorSteps.length / trajectory.steps.length;
            const severity = missingRatio > 0.5 ? 'MAJOR' : 'MINOR';
            rejections.push({
                code: TripNARARejectCode.MISSING_ACTOR_ATTRIBUTION,
                message: `${missingActorSteps.length}/${trajectory.steps.length} 个步骤缺少人格归因(Abu/Dr.Dre/Neptune)`,
                severity,
            });
        }
    }
    isStateTransitionValid(prevStep, currStep) {
        const prevAction = prevStep.action.action_type;
        const currState = currStep.state;
        const prevState = prevStep.state;
        switch (prevAction) {
            case 'GATE_CHECK':
                return !!currState.gate_result;
            case 'PLAN_GENERATE':
                return (!!currState.current_itinerary ||
                    currState.current_itinerary !== prevState.current_itinerary);
            case 'ROUTE_ADJUST':
            case 'PACE_ADJUST':
            case 'POI_SELECT':
                return true;
            default:
                return true;
        }
    }
    calculateAuditability(trajectory, rejections) {
        const gateReproducible = !rejections.some(r => r.code === TripNARARejectCode.GATE_NOT_REPRODUCIBLE ||
            r.code === TripNARARejectCode.GATE_BYPASSED ||
            r.code === TripNARARejectCode.GATE_RESULT_MISSING);
        const decisionChainComplete = !rejections.some(r => r.code === TripNARARejectCode.DECISION_CHAIN_BROKEN ||
            r.code === TripNARARejectCode.STATE_ACTION_MISMATCH);
        const evidenceCoverage = this.calculateEvidenceCoverage(trajectory);
        const stateActionConsistency = !rejections.some(r => r.code === TripNARARejectCode.STATE_ACTION_MISMATCH);
        const actorAttributionComplete = !rejections.some(r => r.code === TripNARARejectCode.MISSING_ACTOR_ATTRIBUTION &&
            r.severity !== 'MINOR');
        return {
            gate_reproducible: gateReproducible,
            decision_chain_complete: decisionChainComplete,
            evidence_coverage: evidenceCoverage,
            state_action_consistency: stateActionConsistency,
            actor_attribution_complete: actorAttributionComplete,
        };
    }
    calculateEvidenceCoverage(trajectory) {
        let totalSteps = 0;
        let stepsWithEvidence = 0;
        for (const step of trajectory.steps) {
            const state = step.state;
            totalSteps++;
            if (state.evidence && state.evidence.length > 0) {
                stepsWithEvidence++;
            }
        }
        return totalSteps > 0 ? stepsWithEvidence / totalSteps : 0;
    }
    async validateTrajectory(gateResult, complianceResult, userApproval, executionResult) {
        this.logger.debug(`[TrajectoryValidator] [Legacy] 开始验证轨迹`);
        const reasons = [];
        let score = 1.0;
        if (gateResult.gate_result === 'BLOCK') {
            this.logger.debug(`[TrajectoryValidator] Gate BLOCK，轨迹无效`);
            return { isValid: false, score: 0, reasons: ['Gate BLOCK'] };
        }
        if (gateResult.gate_result === 'ADJUST_REQUIRED') {
            score -= 0.2;
            reasons.push('Gate ADJUST_REQUIRED');
            this.logger.debug(`[TrajectoryValidator] Gate ADJUST_REQUIRED，扣分 0.2`);
        }
        const criticalWarnings = complianceResult.risk_warnings.filter((w) => w.level === 'CRITICAL');
        if (criticalWarnings.length > 0) {
            this.logger.debug(`[TrajectoryValidator] 发现 ${criticalWarnings.length} 个 CRITICAL 风险警告，轨迹无效`);
            return {
                isValid: false,
                score: 0,
                reasons: ['CRITICAL risk warnings'],
            };
        }
        if (userApproval !== undefined) {
            if (userApproval === client_1.ApprovalStatus.REJECTED) {
                this.logger.debug(`[TrajectoryValidator] 用户拒绝，轨迹标记为负样本`);
                score -= 0.3;
                reasons.push('User rejected (可用于 DPO 负样本)');
            }
            if (userApproval === client_1.ApprovalStatus.APPROVED) {
                score += 0.1;
                reasons.push('User approved');
                this.logger.debug(`[TrajectoryValidator] 用户批准，加分 0.1`);
            }
        }
        if (executionResult) {
            if (!executionResult.success) {
                this.logger.debug(`[TrajectoryValidator] 执行失败，轨迹无效`);
                return { isValid: false, score: 0, reasons: ['Execution failed'] };
            }
            reasons.push('Execution succeeded');
            this.logger.debug(`[TrajectoryValidator] 执行成功`);
        }
        score = Math.max(0, Math.min(1, score));
        const result = {
            isValid: score > 0.5,
            score,
            reasons,
        };
        this.logger.debug(`[TrajectoryValidator] [Legacy] 验证完成: isValid=${result.isValid}, score=${result.score}`);
        return result;
    }
};
exports.TrajectoryValidatorService = TrajectoryValidatorService;
exports.TrajectoryValidatorService = TrajectoryValidatorService = TrajectoryValidatorService_1 = __decorate([
    (0, common_1.Injectable)()
], TrajectoryValidatorService);
//# sourceMappingURL=trajectory-validator.service.js.map