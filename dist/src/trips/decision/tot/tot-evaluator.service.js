"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ToTEvaluatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToTEvaluatorService = void 0;
const common_1 = require("@nestjs/common");
const score_result_1 = require("./score-result");
const hard_gate_1 = require("./hard-gate");
const dimension_scorers_1 = require("./dimension-scorers");
const weight_computer_1 = require("./weight-computer");
const objective_config_1 = require("../config/objective-config");
const optimization_result_extractor_1 = require("./optimization-result-extractor");
let ToTEvaluatorService = ToTEvaluatorService_1 = class ToTEvaluatorService {
    constructor() {
        this.logger = new common_1.Logger(ToTEvaluatorService_1.name);
    }
    async evaluate(input) {
        const { world, plan, optimizationResult, planningPolicy, planRequest } = input;
        const hardGateResult = (0, hard_gate_1.checkHardGate)(world, plan, optimizationResult, planningPolicy);
        if (!hardGateResult.allowed) {
            this.logger.debug(`思路节点被硬门控拒绝: ${hardGateResult.violations.join(', ')}`);
            return (0, score_result_1.createRejectedResult)(hardGateResult.violations);
        }
        const dims = this.computeDimensions(world, plan, optimizationResult, planningPolicy, planRequest);
        const weights = this.computeWeights(world, plan, planRequest);
        const total = this.aggregateScore(dims, weights);
        const diagnostics = optimizationResult ? (0, optimization_result_extractor_1.extractDiagnostics)(optimizationResult) : undefined;
        const allMetrics = {
            ...dims.metrics,
            ...dims.costMetrics,
            ...dims.riskMetrics,
            ...dims.prefMetrics,
            ...dims.timeMetrics,
            ...dims.reqMetrics,
            ...(diagnostics ? {
                diagnostics: {
                    minSlack: diagnostics.minSlack,
                    riskLevel: diagnostics.riskLevel,
                    totalBuffer: diagnostics.totalBuffer,
                    criticalWindowsCount: diagnostics.criticalWindows.length,
                },
            } : {}),
        };
        this.logger.debug(`思路节点评分: score=${(total * 100).toFixed(1)}, ` +
            `dims=[cost:${dims.cost.toFixed(2)}, risk:${dims.risk.toFixed(2)}, ` +
            `pref:${dims.pref.toFixed(2)}, time:${dims.time.toFixed(2)}, req:${dims.req.toFixed(2)}]`);
        return (0, score_result_1.createAllowedResult)({
            cost: dims.cost,
            risk: dims.risk,
            pref: dims.pref,
            time: dims.time,
            req: dims.req,
        }, weights, total, allMetrics);
    }
    computeDimensions(world, plan, optimizationResult, planningPolicy, planRequest) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        const pace = world.context.preferences.pace;
        const policyProfile = (0, objective_config_1.getPolicyProfile)(pace);
        const valueOfTimePerMin = (_b = (_a = planningPolicy === null || planningPolicy === void 0 ? void 0 : planningPolicy.weights) === null || _a === void 0 ? void 0 : _a.valueOfTimePerMin) !== null && _b !== void 0 ? _b : 0;
        const tagAffinity = (_d = (_c = planningPolicy === null || planningPolicy === void 0 ? void 0 : planningPolicy.weights) === null || _c === void 0 ? void 0 : _c.tagAffinity) !== null && _d !== void 0 ? _d : {};
        const diversityPenalty = (_f = (_e = planningPolicy === null || planningPolicy === void 0 ? void 0 : planningPolicy.weights) === null || _e === void 0 ? void 0 : _e.diversityPenalty) !== null && _f !== void 0 ? _f : 0.1;
        const mustSeeBoost = (_h = (_g = planningPolicy === null || planningPolicy === void 0 ? void 0 : planningPolicy.weights) === null || _g === void 0 ? void 0 : _g.mustSeeBoost) !== null && _h !== void 0 ? _h : 1.5;
        let inferredWeights;
        if (!(planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) && optimizationResult) {
            inferredWeights = (0, optimization_result_extractor_1.inferObjectiveWeights)(optimizationResult, world);
            this.logger.debug(`从 OptimizationResult 推断权重: ${JSON.stringify(inferredWeights)}`);
        }
        const travelWeight = (_l = (_k = (_j = planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) === null || _j === void 0 ? void 0 : _j.travel) !== null && _k !== void 0 ? _k : inferredWeights === null || inferredWeights === void 0 ? void 0 : inferredWeights.travel) !== null && _l !== void 0 ? _l : 1.0;
        const waitWeight = (_p = (_o = (_m = planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) === null || _m === void 0 ? void 0 : _m.wait) !== null && _o !== void 0 ? _o : inferredWeights === null || inferredWeights === void 0 ? void 0 : inferredWeights.wait) !== null && _p !== void 0 ? _p : 1.5;
        const dropPenaltyWeight = (_s = (_r = (_q = planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) === null || _q === void 0 ? void 0 : _q.drop_penalty) !== null && _r !== void 0 ? _r : inferredWeights === null || inferredWeights === void 0 ? void 0 : inferredWeights.drop_penalty) !== null && _s !== void 0 ? _s : 1.0;
        const rewardWeight = (_v = (_u = (_t = planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) === null || _t === void 0 ? void 0 : _t.reward) !== null && _u !== void 0 ? _u : inferredWeights === null || inferredWeights === void 0 ? void 0 : inferredWeights.reward) !== null && _v !== void 0 ? _v : 1.0;
        const costResult = (0, dimension_scorers_1.scoreCost)(world, plan, optimizationResult, valueOfTimePerMin);
        const riskResult = (0, dimension_scorers_1.scoreRisk)(world, plan, optimizationResult);
        const prefResult = (0, dimension_scorers_1.scorePref)(world, plan, tagAffinity, diversityPenalty, mustSeeBoost);
        const timeResult = (0, dimension_scorers_1.scoreTime)(world, plan, optimizationResult, travelWeight, waitWeight);
        const reqResult = (0, dimension_scorers_1.scoreReq)(world, plan, optimizationResult, dropPenaltyWeight, rewardWeight);
        return {
            cost: costResult.score,
            risk: riskResult.score,
            pref: prefResult.score,
            time: timeResult.score,
            req: reqResult.score,
            metrics: {},
            costMetrics: costResult.metrics,
            riskMetrics: riskResult.metrics,
            prefMetrics: prefResult.metrics,
            timeMetrics: timeResult.metrics,
            reqMetrics: reqResult.metrics,
        };
    }
    computeWeights(world, plan, planRequest) {
        const pace = world.context.preferences.pace;
        const policyProfile = (0, objective_config_1.getPolicyProfile)(pace);
        const objectiveWeights = policyProfile.objectiveWeights;
        const weights = (0, weight_computer_1.computeFinalWeights)(objectiveWeights, world, plan, planRequest);
        return weights;
    }
    aggregateScore(dims, weights) {
        const sum = weights.cost + weights.risk + weights.pref + weights.time + weights.req;
        if (sum === 0) {
            return 0;
        }
        const total = (weights.cost * dims.cost +
            weights.risk * dims.risk +
            weights.pref * dims.pref +
            weights.time * dims.time +
            weights.req * dims.req) /
            sum;
        return Math.max(0, Math.min(1, total));
    }
};
exports.ToTEvaluatorService = ToTEvaluatorService;
exports.ToTEvaluatorService = ToTEvaluatorService = ToTEvaluatorService_1 = __decorate([
    (0, common_1.Injectable)()
], ToTEvaluatorService);
//# sourceMappingURL=tot-evaluator.service.js.map