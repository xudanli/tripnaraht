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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaySchedulerService = void 0;
const common_1 = require("@nestjs/common");
const cost_model_service_1 = require("./cost-model.service");
const hp_simulator_service_1 = require("./hp-simulator.service");
const time_utils_1 = require("../utils/time-utils");
let DaySchedulerService = class DaySchedulerService {
    constructor(hpSimulator) {
        this.hpSimulator = hpSimulator;
    }
    poiUtility(poi, policy, mustSee) {
        var _a, _b, _c;
        const w = policy.weights;
        let score = 0;
        for (const t of poi.tags) {
            score += (_a = w.tagAffinity[t]) !== null && _a !== void 0 ? _a : 1.0;
        }
        if (mustSee) {
            score += w.mustSeeBoost * 10;
        }
        const sens = (_b = poi.weatherSensitivity) !== null && _b !== void 0 ? _b : 0;
        if (((_c = policy.context) === null || _c === void 0 ? void 0 : _c.isRaining) &&
            sens >= 2 &&
            !poi.tags.includes('indoor')) {
            score *= 0.7;
        }
        return score;
    }
    violatesPoiHardConstraints(poi, policy) {
        const c = policy.constraints;
        if (c.requireWheelchairAccess && poi.wheelchairAccess === false) {
            return 'POI_NOT_WHEELCHAIR_ACCESSIBLE';
        }
        if (c.forbidStairs && poi.stairsRequired === true) {
            return 'POI_STAIRS_REQUIRED';
        }
        return null;
    }
    withinTimeWindow(req, arriveMin, poi) {
        var _a;
        if (!poi.openingHours) {
            return { ok: true, waitMin: 0 };
        }
        const oh = poi.openingHours;
        const dateISO = req.dateISO;
        if (dateISO && ((_a = oh.closedDates) === null || _a === void 0 ? void 0 : _a.includes(dateISO))) {
            return { ok: false, waitMin: 0, reason: 'CLOSED_DATE' };
        }
        const applicableWindows = oh.windows.filter((w) => {
            if (w.holidayDates && dateISO) {
                return w.holidayDates.includes(dateISO);
            }
            if (w.holidaysOnly !== undefined) {
                const isHolidayToday = dateISO ? (0, time_utils_1.isHoliday)(dateISO) : false;
                if (w.holidaysOnly !== isHolidayToday) {
                    return false;
                }
            }
            if (w.dayOfWeek !== undefined) {
                return w.dayOfWeek === req.dayOfWeek;
            }
            return true;
        });
        if (applicableWindows.length === 0) {
            return { ok: false, waitMin: 0, reason: 'NO_OPEN_WINDOW' };
        }
        const inWindow = applicableWindows.find((w) => arriveMin >= (0, time_utils_1.hhmmToMin)(w.start) && arriveMin <= (0, time_utils_1.hhmmToMin)(w.end));
        if (inWindow) {
            const lastEntry = (0, time_utils_1.latestEntryMin)(oh, req.dayOfWeek);
            if (lastEntry !== undefined && arriveMin > lastEntry) {
                return { ok: false, waitMin: 0, reason: 'PAST_LAST_ENTRY' };
            }
            return { ok: true, waitMin: 0 };
        }
        const todayStartTimes = applicableWindows
            .map((w) => (0, time_utils_1.hhmmToMin)(w.start))
            .filter((s) => s > arriveMin)
            .sort((a, b) => a - b);
        if (todayStartTimes.length > 0) {
            return { ok: true, waitMin: todayStartTimes[0] - arriveMin };
        }
        return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
    }
    pickBestRestStop(args) {
        const { policy, from, restStops } = args;
        if (restStops.length === 0)
            return null;
        const feasible = restStops.filter((rest) => {
            const c = policy.constraints;
            if (c.requireWheelchairAccess && rest.wheelchairAccess === false) {
                return false;
            }
            return true;
        });
        if (feasible.length === 0) {
            return restStops[0];
        }
        const scored = feasible.map((rest) => {
            const distanceM = (0, time_utils_1.calculateDistance)(from.lat, from.lng, rest.lat, rest.lng);
            const distanceKm = distanceM / 1000;
            let distanceScore = 1.0;
            if (distanceKm <= 0.5) {
                distanceScore = 1.0;
            }
            else if (distanceKm <= 2.0) {
                distanceScore = 1.0 - (distanceKm - 0.5) / 1.5 * 0.5;
            }
            else {
                distanceScore = Math.max(0.3, 0.5 - (distanceKm - 2.0) * 0.1);
            }
            let accessibilityScore = 1.0;
            if (policy.constraints.requireWheelchairAccess) {
                if (rest.wheelchairAccess) {
                    accessibilityScore = 1.2;
                }
                else {
                    accessibilityScore = 0;
                }
            }
            let facilitiesBonus = 0;
            if (rest.restroomNearby) {
                facilitiesBonus += 0.15;
            }
            if (rest.seatingAvailable) {
                facilitiesBonus += 0.15;
            }
            if (rest.tags.includes('indoor')) {
                facilitiesBonus += 0.1;
            }
            if (rest.tags.includes('cafe') || rest.tags.includes('mall')) {
                facilitiesBonus += 0.1;
            }
            const comfortBase = Math.min(rest.restBenefit.comfortScore / 10, 1.0);
            const regenBonus = Math.min(rest.restBenefit.regenHp / 20, 0.2);
            const totalScore = (comfortBase + facilitiesBonus) *
                accessibilityScore *
                distanceScore +
                regenBonus;
            return {
                rest,
                score: totalScore,
                distanceKm,
                details: {
                    comfortBase,
                    facilitiesBonus,
                    accessibilityScore,
                    distanceScore,
                    regenBonus,
                },
            };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0].rest;
    }
    async scheduleDay(policy, req) {
        var _a, _b, _c, _d;
        const bufferMin = (_a = req.bufferMin) !== null && _a !== void 0 ? _a : 10;
        const stops = [];
        let nowMin = req.startMin;
        let loc = req.startLocation;
        let totalTravelMin = 0;
        let totalWalkMin = 0;
        let totalTransfers = 0;
        let totalQueueMin = 0;
        let hpState = {
            hp: policy.pacing.hpMax,
            lastRestAtMin: req.startMin,
            lastBreakAtMin: req.startMin,
        };
        const remaining = req.pois.filter((p) => !this.violatesPoiHardConstraints(p, policy));
        const mustSee = new Set((_b = req.mustSeePoiIds) !== null && _b !== void 0 ? _b : []);
        while (nowMin < req.endMin - 30) {
            if (this.hpSimulator.restNeeded(policy, hpState.hp, nowMin, hpState)) {
                const rest = this.pickBestRestStop({
                    policy,
                    from: loc,
                    restStops: req.restStops,
                });
                if (!rest)
                    break;
                const segs = await req.getTransit(loc, { lat: rest.lat, lng: rest.lng }, policy);
                const bestSeg = segs
                    .sort((a, b) => cost_model_service_1.DefaultCostModelInstance.edgeCost({ segment: a, policy }) -
                    cost_model_service_1.DefaultCostModelInstance.edgeCost({ segment: b, policy }))[0];
                if (!bestSeg)
                    break;
                totalTravelMin += bestSeg.durationMin;
                totalWalkMin += bestSeg.walkMin;
                totalTransfers += bestSeg.transferCount;
                hpState = this.hpSimulator.applyTravelFatigue({
                    policy,
                    hpState,
                    travel: {
                        walkMin: bestSeg.walkMin,
                        stairsCount: (_c = bestSeg.stairsCount) !== null && _c !== void 0 ? _c : 0,
                    },
                    nowMin,
                });
                nowMin += bestSeg.durationMin;
                const restMin = rest.restBenefit.recommendedMin;
                if (nowMin + restMin > req.endMin)
                    break;
                const start = nowMin;
                nowMin += restMin;
                hpState = this.hpSimulator.applyRestRecovery({
                    policy,
                    hpState,
                    restMin,
                    nowMin,
                    restBenefitHp: rest.restBenefit.regenHp,
                });
                stops.push({
                    kind: 'REST',
                    id: rest.id,
                    name: `休息｜${rest.name}`,
                    startMin: start,
                    endMin: nowMin,
                    lat: rest.lat,
                    lng: rest.lng,
                    transitIn: bestSeg,
                    notes: ['根据体力/强制休息间隔自动插入休息点'],
                });
                loc = { lat: rest.lat, lng: rest.lng };
                continue;
            }
            let bestChoice = null;
            for (const poi of remaining) {
                const segs = await req.getTransit(loc, { lat: poi.lat, lng: poi.lng }, policy);
                if (!segs || segs.length === 0)
                    continue;
                const seg = segs
                    .filter((s) => cost_model_service_1.DefaultCostModelInstance.edgeCost({ segment: s, policy }) !==
                    Number.POSITIVE_INFINITY)
                    .sort((a, b) => cost_model_service_1.DefaultCostModelInstance.edgeCost({ segment: a, policy }) -
                    cost_model_service_1.DefaultCostModelInstance.edgeCost({ segment: b, policy }))[0];
                if (!seg)
                    continue;
                const arriveMin = nowMin + seg.durationMin;
                if (seg.walkMin > policy.constraints.maxSingleWalkMin)
                    continue;
                const tw = this.withinTimeWindow(req, arriveMin, poi);
                if (!tw.ok)
                    continue;
                const waitMin = tw.waitMin;
                const startVisitMin = arriveMin + waitMin;
                const visitMin = poi.avgVisitMin;
                const endVisitMin = startVisitMin + visitMin + bufferMin;
                if (endVisitMin > req.endMin)
                    continue;
                const interest = this.poiUtility(poi, policy, mustSee.has(poi.id));
                const travelCost = cost_model_service_1.DefaultCostModelInstance.edgeCost({
                    segment: seg,
                    policy,
                });
                const waitPenalty = waitMin * policy.weights.overtimePenaltyPerMin * 0.4;
                const fatiguePenalty = seg.walkMin *
                    policy.weights.walkPainPerMin *
                    (hpState.hp < 25 ? 1.25 : 1.0);
                const gain = interest * 10 - travelCost - waitPenalty - fatiguePenalty;
                if (!bestChoice || gain > bestChoice.gain) {
                    bestChoice = { poi, seg, gain, waitMin };
                }
            }
            if (!bestChoice) {
                const rest = this.pickBestRestStop({
                    policy,
                    from: loc,
                    restStops: req.restStops,
                });
                if (!rest)
                    break;
                const shortRestMin = Math.min(20, rest.restBenefit.minMin);
                if (nowMin + shortRestMin > req.endMin)
                    break;
                const start = nowMin;
                nowMin += shortRestMin;
                hpState = this.hpSimulator.applyRestRecovery({
                    policy,
                    hpState,
                    restMin: shortRestMin,
                    nowMin,
                    restBenefitHp: 0,
                });
                stops.push({
                    kind: 'REST',
                    id: rest.id,
                    name: `短休｜${rest.name}`,
                    startMin: start,
                    endMin: nowMin,
                    lat: loc.lat,
                    lng: loc.lng,
                    notes: ['无可行景点时插入短休，保证节奏与可行性'],
                });
                continue;
            }
            const { poi, seg, waitMin } = bestChoice;
            totalTravelMin += seg.durationMin;
            totalWalkMin += seg.walkMin;
            totalTransfers += seg.transferCount;
            hpState = this.hpSimulator.applyTravelFatigue({
                policy,
                hpState,
                travel: {
                    walkMin: seg.walkMin,
                    stairsCount: (_d = seg.stairsCount) !== null && _d !== void 0 ? _d : 0,
                },
                nowMin,
            });
            const arrive = nowMin + seg.durationMin;
            if (waitMin > 0) {
                totalQueueMin += waitMin;
                hpState = this.hpSimulator.applyTravelFatigue({
                    policy,
                    hpState,
                    travel: { walkMin: 0, queueMin: waitMin },
                    nowMin: arrive,
                });
            }
            const visitStart = arrive + waitMin;
            const visitEnd = visitStart + poi.avgVisitMin;
            stops.push({
                kind: 'POI',
                id: poi.id,
                name: poi.name,
                startMin: visitStart,
                endMin: visitEnd,
                lat: poi.lat,
                lng: poi.lng,
                transitIn: seg,
                notes: [
                    mustSee.has(poi.id) ? '必去景点加权' : '按兴趣权重选择',
                    waitMin > 0 ? `因未开门等待 ${waitMin} 分钟` : '到达即入场',
                ].filter(Boolean),
            });
            nowMin = visitEnd + bufferMin;
            loc = { lat: poi.lat, lng: poi.lng };
            const idx = remaining.findIndex((p) => p.id === poi.id);
            if (idx >= 0)
                remaining.splice(idx, 1);
            if (hpState.hp <= 8) {
                const rest = this.pickBestRestStop({
                    policy,
                    from: loc,
                    restStops: req.restStops,
                });
                if (!rest)
                    break;
                const restMin = Math.min(30, rest.restBenefit.recommendedMin);
                if (nowMin + restMin > req.endMin)
                    break;
                const start = nowMin;
                nowMin += restMin;
                hpState = this.hpSimulator.applyRestRecovery({
                    policy,
                    hpState,
                    restMin,
                    nowMin,
                    restBenefitHp: rest.restBenefit.regenHp,
                });
                stops.push({
                    kind: 'REST',
                    id: rest.id,
                    name: `强制休息｜${rest.name}`,
                    startMin: start,
                    endMin: nowMin,
                    lat: loc.lat,
                    lng: loc.lng,
                    notes: ['HP 过低触发强制休息（防止行程崩盘）'],
                });
            }
        }
        const overtimeMin = Math.max(0, nowMin - req.endMin);
        return {
            stops,
            metrics: {
                totalTravelMin,
                totalWalkMin,
                totalTransfers,
                totalQueueMin,
                overtimeMin,
                hpEnd: Math.round(hpState.hp),
            },
        };
    }
};
exports.DaySchedulerService = DaySchedulerService;
exports.DaySchedulerService = DaySchedulerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hp_simulator_service_1.HpSimulatorService])
], DaySchedulerService);
//# sourceMappingURL=day-scheduler.service.js.map