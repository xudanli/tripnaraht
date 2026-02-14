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
var ClaudeGatekeeperAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeGatekeeperAgentService = void 0;
const common_1 = require("@nestjs/common");
const plan_gate_run_three_guardians_skill_1 = require("../../../skills/plan/gate/plan-gate-run-three-guardians.skill");
const plan_gate_precheck_skill_1 = require("../../../skills/plan/gate/plan-gate-precheck.skill");
let ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService_1 = class ClaudeGatekeeperAgentService {
    constructor(gateRunThreeGuardians, gatePrecheck) {
        this.gateRunThreeGuardians = gateRunThreeGuardians;
        this.gatePrecheck = gatePrecheck;
        this.logger = new common_1.Logger(ClaudeGatekeeperAgentService_1.name);
        this.logger.log(`[GatekeeperAgent] 已初始化`);
        this.logger.log(`[GatekeeperAgent] GateRunThreeGuardians: ${!!this.gateRunThreeGuardians}, GatePrecheck: ${!!this.gatePrecheck}`);
    }
    async evaluateGate(request, researchData, context) {
        this.logger.debug(`[GatekeeperAgent] 执行 Gate 评估: request_id=${request.request_id}`);
        try {
            const hardGateResult = this.checkHardGate(request, researchData);
            if (!hardGateResult.allowed) {
                return {
                    gate_result: 'BLOCK',
                    violations: hardGateResult.violations.map(v => ({
                        type: this.mapViolationType(v),
                        severity: 'HARD',
                        detail: v,
                    })),
                    required_adjustments: [],
                    confidence: 0.9,
                    evidence_refs: [],
                };
            }
            if (this.gatePrecheck) {
            }
            if (this.gateRunThreeGuardians) {
            }
            const softChecks = this.performSoftChecks(request, researchData);
            const gateResult = {
                gate_result: softChecks.hasAdjustments ? 'ADJUST_REQUIRED' : 'ALLOW',
                violations: softChecks.violations,
                required_adjustments: softChecks.adjustments,
                confidence: softChecks.confidence,
                evidence_refs: this.extractEvidenceRefs(researchData),
            };
            this.logger.log(`[GatekeeperAgent] Gate 评估完成: ${gateResult.gate_result}, 置信度: ${gateResult.confidence}`);
            return gateResult;
        }
        catch (error) {
            this.logger.error(`[GatekeeperAgent] Gate 评估失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                gate_result: 'NEED_USER_CONFIRM',
                violations: [{
                        type: 'DATA_MISSING',
                        severity: 'SOFT',
                        detail: `Gate 评估失败: ${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`,
                    }],
                required_adjustments: [],
                confidence: 0.3,
                evidence_refs: [],
            };
        }
    }
    checkHardGate(request, researchData) {
        var _a;
        const violations = [];
        if (!request.destination) {
            violations.push('缺少目的地（destination）');
        }
        if (!request.date_range && !request.start_date) {
            violations.push('缺少日期信息（date_range 或 start_date）');
        }
        if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
            if (researchData.transport_evidence.length === 0) {
                violations.push('起点/终点不可达（无交通证据）');
            }
        }
        if (((_a = researchData.risk_assessment) === null || _a === void 0 ? void 0 : _a.risk_level) === 'CRITICAL') {
            violations.push('关键路段高风险（risk_level=CRITICAL）');
        }
        return {
            allowed: violations.length === 0,
            violations,
        };
    }
    performSoftChecks(request, researchData) {
        var _a, _b;
        const violations = [];
        const adjustments = [];
        let confidence = 0.8;
        if (((_a = researchData.fatigue_estimate) === null || _a === void 0 ? void 0 : _a.daily_fatigue_score) > 0.8) {
            violations.push({
                type: 'FATIGUE',
                severity: 'SOFT',
                detail: `每日疲劳评分过高: ${researchData.fatigue_estimate.daily_fatigue_score}`,
            });
            adjustments.push({
                action: 'SHORTEN_DAY',
                why: '每日疲劳评分超过阈值，建议缩短每日行程',
            });
            confidence -= 0.1;
        }
        if (researchData.dem_metrics) {
            const maxAscent = (_b = request.constraints) === null || _b === void 0 ? void 0 : _b.max_ascent_m;
            if (maxAscent && researchData.dem_metrics.total_ascent_m > maxAscent) {
                violations.push({
                    type: 'DEM',
                    severity: 'SOFT',
                    detail: `累计爬升超出限制: ${researchData.dem_metrics.total_ascent_m}m > ${maxAscent}m`,
                });
                adjustments.push({
                    action: 'REPLACE_SEGMENT',
                    why: '累计爬升超出用户能力，建议替换为更平缓的路段',
                });
                confidence -= 0.1;
            }
        }
        if (researchData.opening_hours_evidence) {
        }
        return {
            hasAdjustments: adjustments.length > 0,
            violations,
            adjustments,
            confidence: Math.max(0.1, confidence),
        };
    }
    extractEvidenceRefs(researchData) {
        const evidenceRefs = [];
        if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
            evidenceRefs.push(...researchData.transport_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        if (researchData.poi_evidence && Array.isArray(researchData.poi_evidence)) {
            evidenceRefs.push(...researchData.poi_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        if (researchData.opening_hours_evidence && Array.isArray(researchData.opening_hours_evidence)) {
            evidenceRefs.push(...researchData.opening_hours_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        return evidenceRefs;
    }
    mapViolationType(violation) {
        if (violation.includes('不可达') || violation.includes('交通')) {
            return 'REACHABILITY';
        }
        if (violation.includes('风险') || violation.includes('安全')) {
            return 'SAFETY';
        }
        if (violation.includes('DEM') || violation.includes('爬升')) {
            return 'DEM';
        }
        if (violation.includes('缺失') || violation.includes('缺少')) {
            return 'DATA_MISSING';
        }
        return 'DATA_MISSING';
    }
};
exports.ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService;
exports.ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
        plan_gate_precheck_skill_1.PlanGatePrecheckSkill])
], ClaudeGatekeeperAgentService);
//# sourceMappingURL=gatekeeper-agent.service.js.map