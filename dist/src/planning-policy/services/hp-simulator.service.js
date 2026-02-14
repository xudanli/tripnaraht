"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HpSimulatorService = void 0;
const common_1 = require("@nestjs/common");
const planning_policy_interface_1 = require("../interfaces/planning-policy.interface");
let HpSimulatorService = class HpSimulatorService {
    defaultFatigueParams(policy) {
        const worst = policy.derived.groupMobilityWorst;
        if (worst === planning_policy_interface_1.MobilityProfile.IRON_LEGS) {
            return {
                walkHpPerMin: 0.25,
                standHpPerMin: 0.1,
                stairsHpPerUnit: 0.5,
                continuousWalkPenalty: 1.2,
            };
        }
        if (worst === planning_policy_interface_1.MobilityProfile.CITY_POTATO) {
            return {
                walkHpPerMin: 0.45,
                standHpPerMin: 0.18,
                stairsHpPerUnit: 0.9,
                continuousWalkPenalty: 1.5,
            };
        }
        if (worst === planning_policy_interface_1.MobilityProfile.ACTIVE_SENIOR) {
            return {
                walkHpPerMin: 0.55,
                standHpPerMin: 0.22,
                stairsHpPerUnit: 999,
                continuousWalkPenalty: 2.0,
            };
        }
        return {
            walkHpPerMin: 0.7,
            standHpPerMin: 0.25,
            stairsHpPerUnit: 999,
            continuousWalkPenalty: 2.2,
        };
    }
    applyTravelFatigue(args) {
        var _a, _b, _c;
        const { policy, hpState, travel, nowMin } = args;
        const p = this.defaultFatigueParams(policy);
        const continuousLimit = policy.pacing.terrainRules.maxContinuousWalkMin;
        const contWalk = travel.walkMin;
        const contMul = contWalk > continuousLimit ? p.continuousWalkPenalty : 1.0;
        const stair = (_a = travel.stairsCount) !== null && _a !== void 0 ? _a : 0;
        const stairCost = stair > 0 ? stair * p.stairsHpPerUnit : 0;
        const walkCost = travel.walkMin *
            p.walkHpPerMin *
            contMul *
            (((_b = policy.context) === null || _b === void 0 ? void 0 : _b.isRaining) ? 1.15 : 1.0);
        const standCost = ((_c = travel.queueMin) !== null && _c !== void 0 ? _c : 0) * p.standHpPerMin;
        let hp = hpState.hp - (walkCost + standCost + stairCost);
        if (hp < 0)
            hp = 0;
        return {
            hp,
            lastRestAtMin: hpState.lastRestAtMin,
            lastBreakAtMin: nowMin,
        };
    }
    applyRestRecovery(args) {
        const { policy, hpState, restMin, nowMin, restBenefitHp } = args;
        const regen = policy.pacing.regenRate;
        const base = policy.pacing.hpMax * regen * (restMin / 60);
        let hp = hpState.hp + base + (restBenefitHp !== null && restBenefitHp !== void 0 ? restBenefitHp : 0);
        if (hp > policy.pacing.hpMax)
            hp = policy.pacing.hpMax;
        return {
            hp,
            lastRestAtMin: nowMin,
            lastBreakAtMin: nowMin,
        };
    }
    restNeeded(policy, hp, nowMin, hpState) {
        const forced = policy.pacing.forcedRestIntervalMin;
        const since = nowMin - hpState.lastRestAtMin;
        const hpThreshold = policy.derived.groupMobilityWorst === planning_policy_interface_1.MobilityProfile.IRON_LEGS ? 18 : 22;
        return since >= forced || hp <= hpThreshold;
    }
};
exports.HpSimulatorService = HpSimulatorService;
exports.HpSimulatorService = HpSimulatorService = __decorate([
    (0, common_1.Injectable)()
], HpSimulatorService);
//# sourceMappingURL=hp-simulator.service.js.map