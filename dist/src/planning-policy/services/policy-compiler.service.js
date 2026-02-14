"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyCompilerService = void 0;
const common_1 = require("@nestjs/common");
const planning_policy_interface_1 = require("../interfaces/planning-policy.interface");
const MOBILITY_BASE = {
    [planning_policy_interface_1.MobilityProfile.IRON_LEGS]: {
        hpMax: 100,
        regenRate: 0.5,
        walkSpeedMultiplier: 0.8,
        stairPenalty: 1.0,
        forcedRestIntervalMin: 180,
        terrainRules: {
            forbidStairs: false,
            wheelchairOnly: false,
            maxContinuousWalkMin: 60,
            maxDailyWalkMin: 240,
        },
    },
    [planning_policy_interface_1.MobilityProfile.ACTIVE_SENIOR]: {
        hpMax: 80,
        regenRate: 0.4,
        walkSpeedMultiplier: 1.2,
        stairPenalty: 9999,
        forcedRestIntervalMin: 120,
        terrainRules: {
            forbidStairs: true,
            wheelchairOnly: false,
            maxContinuousWalkMin: 15,
            maxDailyWalkMin: 120,
        },
    },
    [planning_policy_interface_1.MobilityProfile.CITY_POTATO]: {
        hpMax: 60,
        regenRate: 0.3,
        walkSpeedMultiplier: 1.0,
        stairPenalty: 1.5,
        forcedRestIntervalMin: 60,
        terrainRules: {
            forbidStairs: false,
            wheelchairOnly: false,
            maxContinuousWalkMin: 20,
            maxDailyWalkMin: 120,
        },
    },
    [planning_policy_interface_1.MobilityProfile.LIMITED]: {
        hpMax: 40,
        regenRate: 0.2,
        walkSpeedMultiplier: 1.5,
        stairPenalty: 9999,
        forcedRestIntervalMin: 45,
        terrainRules: {
            forbidStairs: true,
            wheelchairOnly: true,
            maxContinuousWalkMin: 10,
            maxDailyWalkMin: 60,
        },
    },
};
function mobilityRank(m) {
    switch (m) {
        case planning_policy_interface_1.MobilityProfile.LIMITED:
            return 4;
        case planning_policy_interface_1.MobilityProfile.ACTIVE_SENIOR:
            return 3;
        case planning_policy_interface_1.MobilityProfile.CITY_POTATO:
            return 2;
        case planning_policy_interface_1.MobilityProfile.IRON_LEGS:
            return 1;
        default:
            return 2;
    }
}
function mergeInterestMix(travelers) {
    var _a;
    const sum = travelers.reduce((a, t) => { var _a; return a + ((_a = t.weight) !== null && _a !== void 0 ? _a : 1); }, 0) || 1;
    const mix = {
        [planning_policy_interface_1.InterestProfile.ADULT]: 0,
        [planning_policy_interface_1.InterestProfile.ELDERLY]: 0,
        [planning_policy_interface_1.InterestProfile.CHILD]: 0,
    };
    for (const t of travelers) {
        mix[t.type] += ((_a = t.weight) !== null && _a !== void 0 ? _a : 1) / sum;
    }
    return mix;
}
function computeValueOfTimePerMin(ctx, tripType, totalBudgetCny, days, people) {
    const basePerMin = (() => {
        if (ctx.budgetSensitivity === 'LOW')
            return 4;
        if (ctx.budgetSensitivity === 'HIGH')
            return 0.8;
        return 2;
    })();
    const tripTypeMul = {
        BUSINESS: 1.4,
        LEISURE: 1.0,
        FAMILY: 0.8,
        BACKPACKING: 0.7,
    };
    const timeMul = ctx.timeSensitivity === 'HIGH' ? 1.3 : ctx.timeSensitivity === 'LOW' ? 0.85 : 1.0;
    const budgetPerPersonPerDay = totalBudgetCny && days && people ? totalBudgetCny / days / people : undefined;
    const budgetMul = budgetPerPersonPerDay && budgetPerPersonPerDay > 1500
        ? 1.15
        : budgetPerPersonPerDay && budgetPerPersonPerDay < 400
            ? 0.85
            : 1.0;
    return basePerMin * tripTypeMul[tripType] * timeMul * budgetMul;
}
function buildTagAffinity(mix) {
    const base = {
        museum: 1.0,
        culture: 1.0,
        nature: 1.0,
        shopping: 1.0,
        playground: 1.0,
        indoor: 1.0,
        wheelchair: 1.0,
        stairs: 1.0,
        photoSpot: 1.0,
        interactive: 1.0,
    };
    base.museum += 0.3 * mix[planning_policy_interface_1.InterestProfile.ADULT];
    base.culture += 0.35 * mix[planning_policy_interface_1.InterestProfile.ADULT];
    base.photoSpot += 0.25 * mix[planning_policy_interface_1.InterestProfile.ADULT];
    base.indoor += 0.35 * mix[planning_policy_interface_1.InterestProfile.ELDERLY];
    base.culture += 0.15 * mix[planning_policy_interface_1.InterestProfile.ELDERLY];
    base.nature += 0.05 * mix[planning_policy_interface_1.InterestProfile.ELDERLY];
    base.playground += 0.6 * mix[planning_policy_interface_1.InterestProfile.CHILD];
    base.interactive += 0.5 * mix[planning_policy_interface_1.InterestProfile.CHILD];
    base.indoor += 0.2 * mix[planning_policy_interface_1.InterestProfile.CHILD];
    return base;
}
let PolicyCompilerService = class PolicyCompilerService {
    compilePlanningPolicy(args) {
        var _a, _b, _c;
        const { travelers, context: ctx, tripType } = args;
        const worst = (_a = travelers
            .map((t) => t.mobilityTag)
            .sort((a, b) => mobilityRank(b) - mobilityRank(a))[0]) !== null && _a !== void 0 ? _a : planning_policy_interface_1.MobilityProfile.CITY_POTATO;
        const pacingBase = MOBILITY_BASE[worst];
        const mix = mergeInterestMix(travelers);
        const constraints = {
            requireWheelchairAccess: ctx.hasLimitedMobility || worst === planning_policy_interface_1.MobilityProfile.LIMITED,
            forbidStairs: worst === planning_policy_interface_1.MobilityProfile.ACTIVE_SENIOR || worst === planning_policy_interface_1.MobilityProfile.LIMITED,
            maxTransfers: ctx.hasElderly ? 1 : 2,
            maxSingleWalkMin: pacingBase.terrainRules.maxContinuousWalkMin,
            maxTotalWalkMinPerDay: pacingBase.terrainRules.maxDailyWalkMin,
            mustHaveRestroomEveryMin: mix[planning_policy_interface_1.InterestProfile.CHILD] > 0 ? 90 : mix[planning_policy_interface_1.InterestProfile.ELDERLY] > 0 ? 120 : 180,
        };
        const vot = computeValueOfTimePerMin(ctx, tripType, args.totalBudgetCny, args.days, args.people);
        const riskTol = (_b = ctx.riskTolerance) !== null && _b !== void 0 ? _b : 'MEDIUM';
        const stability = (_c = ctx.planStabilityPreference) !== null && _c !== void 0 ? _c : 'MEDIUM';
        const weights = {
            tagAffinity: buildTagAffinity(mix),
            diversityPenalty: 0.12,
            mustSeeBoost: 0.35,
            valueOfTimePerMin: vot,
            walkPainPerMin: worst === planning_policy_interface_1.MobilityProfile.IRON_LEGS
                ? 0.6
                : worst === planning_policy_interface_1.MobilityProfile.CITY_POTATO
                    ? 1.0
                    : 1.4,
            transferPain: 8,
            stairPain: constraints.forbidStairs ? 9999 : 6,
            crowdPainPerMin: 0.8,
            rainWalkMultiplier: ctx.isRaining ? 2.2 : 1.0,
            luggageTransitPenalty: ctx.hasLuggage || ctx.isMovingDay ? 18 : 0,
            elderlyTransferMultiplier: ctx.hasElderly ? 1.6 : 1.0,
            planChangePenalty: stability === 'HIGH' ? 18 : stability === 'LOW' ? 4 : 10,
            overtimePenaltyPerMin: riskTol === 'LOW' ? 3.0 : riskTol === 'HIGH' ? 1.2 : 2.0,
        };
        const policy = {
            pacing: pacingBase,
            constraints,
            weights,
            context: ctx,
            derived: {
                groupInterestMix: mix,
                groupMobilityWorst: worst,
            },
        };
        return policy;
    }
};
exports.PolicyCompilerService = PolicyCompilerService;
exports.PolicyCompilerService = PolicyCompilerService = __decorate([
    (0, common_1.Injectable)()
], PolicyCompilerService);
//# sourceMappingURL=policy-compiler.service.js.map