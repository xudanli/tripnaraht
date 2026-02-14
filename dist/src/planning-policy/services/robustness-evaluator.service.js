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
exports.RobustnessEvaluatorService = exports.MapPoiLookup = void 0;
exports.mulberry32 = mulberry32;
const common_1 = require("@nestjs/common");
const cost_model_service_1 = require("./cost-model.service");
const hp_simulator_service_1 = require("./hp-simulator.service");
const time_utils_1 = require("../utils/time-utils");
function mulberry32(seed) {
    let t = seed >>> 0;
    return {
        next() {
            t += 0x6d2b79f5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        },
    };
}
function normal01(rng) {
    const u1 = Math.max(rng.next(), 1e-12);
    const u2 = Math.max(rng.next(), 1e-12);
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function sampleTruncatedNormal(rng, mean, std, min = 0, max = Number.POSITIVE_INFINITY) {
    if (std <= 0)
        return clamp(mean, min, max);
    for (let i = 0; i < 12; i++) {
        const v = mean + std * normal01(rng);
        if (v >= min && v <= max)
            return v;
    }
    return clamp(mean, min, max);
}
class MapPoiLookup {
    constructor(map) {
        this.map = map;
    }
    getPoiById(id) {
        return this.map.get(id);
    }
}
exports.MapPoiLookup = MapPoiLookup;
let RobustnessEvaluatorService = class RobustnessEvaluatorService {
    constructor(hpSimulator) {
        this.hpSimulator = hpSimulator;
    }
    evaluateDayRobustness(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        const cfg = {
            samples: (_b = (_a = args.config) === null || _a === void 0 ? void 0 : _a.samples) !== null && _b !== void 0 ? _b : 300,
            seed: (_d = (_c = args.config) === null || _c === void 0 ? void 0 : _c.seed) !== null && _d !== void 0 ? _d : 42,
            onTimeSlackMin: (_f = (_e = args.config) === null || _e === void 0 ? void 0 : _e.onTimeSlackMin) !== null && _f !== void 0 ? _f : 0,
            defaultTransitStdRatio: (_h = (_g = args.config) === null || _g === void 0 ? void 0 : _g.defaultTransitStdRatio) !== null && _h !== void 0 ? _h : 0.12,
            defaultQueueStdRatio: (_k = (_j = args.config) === null || _j === void 0 ? void 0 : _j.defaultQueueStdRatio) !== null && _k !== void 0 ? _k : 0.35,
            defaultVisitStdRatio: (_m = (_l = args.config) === null || _l === void 0 ? void 0 : _l.defaultVisitStdRatio) !== null && _m !== void 0 ? _m : 0.25,
            visitStandHpPerMin: (_p = (_o = args.config) === null || _o === void 0 ? void 0 : _o.visitStandHpPerMin) !== null && _p !== void 0 ? _p : 0.06,
        };
        const finishes = [];
        const overtimes = [];
        const hps = [];
        const costs = [];
        const transitDeltas = [];
        const queueDeltas = [];
        const visitDeltas = [];
        const windowWaitDeltas = [];
        let missAnyCount = 0;
        const missCountsByPoi = {};
        const poiSeen = new Set();
        let waitAnyCount = 0;
        const waitSamplesByPoi = {};
        const completedCounts = [];
        const completionRates = [];
        const slackAllByPoi = {};
        const deadlineTypeAllByPoi = {};
        for (let i = 0; i < cfg.samples; i++) {
            const local = mulberry32((cfg.seed + i * 9973) >>> 0);
            const sim = this.simulateOnce({
                policy: args.policy,
                schedule: args.schedule,
                dayEndMin: args.dayEndMin,
                dateISO: args.dateISO,
                dayOfWeek: args.dayOfWeek,
                cfg,
                poiLookup: args.poiLookup,
                rng: local,
            });
            finishes.push(sim.finishMin);
            overtimes.push(sim.overtimeMin);
            hps.push(sim.hpEnd);
            costs.push(sim.cost);
            transitDeltas.push(sim.transitDelta);
            queueDeltas.push(sim.queueDelta);
            visitDeltas.push(sim.visitDelta);
            windowWaitDeltas.push(sim.windowWaitDelta);
            if (sim.missedAnyWindow) {
                missAnyCount++;
            }
            for (const [poiId, reasons] of Object.entries(sim.missedByPoi)) {
                poiSeen.add(poiId);
                missCountsByPoi[poiId] = (_q = missCountsByPoi[poiId]) !== null && _q !== void 0 ? _q : {};
                for (const [reason, count] of Object.entries(reasons)) {
                    missCountsByPoi[poiId][reason] =
                        ((_r = missCountsByPoi[poiId][reason]) !== null && _r !== void 0 ? _r : 0) + count;
                }
            }
            if (sim.waitedAnyWindow) {
                waitAnyCount++;
            }
            for (const [poiId, waits] of Object.entries((_s = sim.waitByPoi) !== null && _s !== void 0 ? _s : {})) {
                ((_t = waitSamplesByPoi[poiId]) !== null && _t !== void 0 ? _t : (waitSamplesByPoi[poiId] = [])).push(...waits);
            }
            completedCounts.push(sim.completedPoiCount);
            completionRates.push(sim.plannedPoiCount
                ? sim.completedPoiCount / sim.plannedPoiCount
                : 1);
            for (const [poiId, samples] of Object.entries((_u = sim.perPoiSlackSamples) !== null && _u !== void 0 ? _u : {})) {
                ((_v = slackAllByPoi[poiId]) !== null && _v !== void 0 ? _v : (slackAllByPoi[poiId] = [])).push(...samples);
            }
            for (const [poiId, typeCounts] of Object.entries((_w = sim.perPoiDeadlineTypeCounts) !== null && _w !== void 0 ? _w : {})) {
                deadlineTypeAllByPoi[poiId] = (_x = deadlineTypeAllByPoi[poiId]) !== null && _x !== void 0 ? _x : {};
                for (const [type, cnt] of Object.entries(typeCounts)) {
                    deadlineTypeAllByPoi[poiId][type] =
                        ((_y = deadlineTypeAllByPoi[poiId][type]) !== null && _y !== void 0 ? _y : 0) + cnt;
                }
            }
        }
        const timeWindowMissProb = missAnyCount / cfg.samples;
        const perPoiMissProb = Array.from(poiSeen).map((poiId) => {
            var _a;
            const reasons = (_a = missCountsByPoi[poiId]) !== null && _a !== void 0 ? _a : {};
            const totalMiss = Object.values(reasons).reduce((a, b) => a + b, 0);
            const missProb = totalMiss / cfg.samples;
            const reasonTop = Object.entries(reasons)
                .map(([reason, cnt]) => ({ reason, prob: cnt / cfg.samples }))
                .sort((a, b) => b.prob - a.prob)
                .slice(0, 3);
            return { poiId, missProb, reasonTop };
        });
        perPoiMissProb.sort((a, b) => b.missProb - a.missProb);
        const windowWaitProb = waitAnyCount / cfg.samples;
        const perPoiWaitProb = Object.entries(waitSamplesByPoi).map(([poiId, waits]) => {
            const waitProb = Math.min(1, waits.length / cfg.samples);
            const sorted = [...waits].sort((a, b) => a - b);
            const q = (p) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0;
            return {
                poiId,
                waitProb,
                waitP50Min: q(0.5),
                waitP90Min: q(0.9),
            };
        });
        perPoiWaitProb.sort((a, b) => b.waitProb - a.waitProb);
        const completedPoiMean = this.mean(completedCounts);
        const completedPoiP10 = this.quantile(completedCounts, 0.1);
        const completionRateMean = this.mean(completionRates);
        const completionRateP10 = this.quantile(completionRates, 0.1);
        const perPoiEntrySlack = Object.entries(slackAllByPoi).map(([poiId, arr]) => {
            var _a;
            const slackMeanMin = this.mean(arr);
            const slackP10Min = this.quantile(arr, 0.1);
            const slackP50Min = this.quantile(arr, 0.5);
            const slackP90Min = this.quantile(arr, 0.9);
            const slackNegProb = arr.filter((x) => x < 0).length / Math.max(1, arr.length);
            const tc = (_a = deadlineTypeAllByPoi[poiId]) !== null && _a !== void 0 ? _a : {};
            const total = Object.values(tc).reduce((a, b) => a + b, 0) || 1;
            const deadlineTypeTop = Object.entries(tc)
                .map(([type, cnt]) => ({
                type: type,
                prob: cnt / total,
            }))
                .sort((a, b) => b.prob - a.prob)
                .slice(0, 2);
            return {
                poiId,
                slackMeanMin,
                slackP10Min,
                slackP50Min,
                slackP90Min,
                slackNegProb,
                deadlineTypeTop,
            };
        });
        perPoiEntrySlack.sort((a, b) => a.slackP10Min - b.slackP10Min);
        const onTime = finishes.filter((f) => f <= args.dayEndMin + cfg.onTimeSlackMin).length /
            cfg.samples;
        const overtimeMean = this.mean(overtimes);
        const overtimeP90 = this.quantile(overtimes, 0.9);
        const hpMean = this.mean(hps);
        const hpP10 = this.quantile(hps, 0.1);
        const costMean = this.mean(costs);
        const costP90 = this.quantile(costs, 0.9);
        return {
            samples: cfg.samples,
            onTimeProb: onTime,
            expectedOvertimeMin: overtimeMean,
            overtimeP90Min: overtimeP90,
            hpEndMean: hpMean,
            hpEndP10: hpP10,
            costMean,
            costP90,
            riskLevel: this.riskLevelFromAll(onTime, overtimeP90, hpP10, completionRateP10),
            diagnostics: {
                avgTransitDeltaMin: this.mean(transitDeltas),
                avgQueueDeltaMin: this.mean(queueDeltas),
                avgVisitDeltaMin: this.mean(visitDeltas),
                avgWindowWaitDeltaMin: this.mean(windowWaitDeltas),
            },
            timeWindowMissProb,
            perPoiMissProb,
            windowWaitProb,
            perPoiWaitProb,
            completedPoiMean,
            completedPoiP10,
            completionRateMean,
            completionRateP10,
            perPoiEntrySlack,
        };
    }
    simulateOnce(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var _j, _k;
        const { policy, schedule, dayEndMin, dateISO, dayOfWeek, cfg, poiLookup, rng, } = args;
        const stops = schedule.stops;
        const startMin = (_b = (_a = stops[0]) === null || _a === void 0 ? void 0 : _a.startMin) !== null && _b !== void 0 ? _b : 0;
        let t = startMin;
        let hpState = {
            hp: policy.pacing.hpMax,
            lastRestAtMin: startMin,
            lastBreakAtMin: startMin,
        };
        let transitDelta = 0;
        let queueDelta = 0;
        let visitDelta = 0;
        let windowWaitDelta = 0;
        let totalTravelMin = 0;
        let totalWalkMin = 0;
        let totalTransfers = 0;
        let totalQueueMin = 0;
        let missedAnyWindow = false;
        const missedByPoi = {};
        const markMiss = (poiId, reason) => {
            var _a, _b;
            missedAnyWindow = true;
            missedByPoi[poiId] = (_a = missedByPoi[poiId]) !== null && _a !== void 0 ? _a : {};
            missedByPoi[poiId][reason] = ((_b = missedByPoi[poiId][reason]) !== null && _b !== void 0 ? _b : 0) + 1;
        };
        let waitedAnyWindow = false;
        const waitByPoi = {};
        const plannedPoiIds = new Set(stops.filter((s) => s.kind === 'POI').map((s) => s.id));
        let completedPoiCount = 0;
        const perPoiSlackSamples = {};
        const perPoiDeadlineTypeCounts = {};
        for (const s of stops) {
            if (s.transitIn) {
                const edgeCost = cost_model_service_1.DefaultCostModelInstance.edgeCost({
                    segment: s.transitIn,
                    policy,
                });
                if (edgeCost === Number.POSITIVE_INFINITY) {
                    t = dayEndMin + 9999;
                    break;
                }
                const sampled = this.sampleTransitDuration(rng, s.transitIn, cfg);
                transitDelta += sampled - s.transitIn.durationMin;
                t += sampled;
                totalTravelMin += sampled;
                totalWalkMin += s.transitIn.walkMin;
                totalTransfers += s.transitIn.transferCount;
                hpState = this.hpSimulator.applyTravelFatigue({
                    policy,
                    hpState,
                    travel: {
                        walkMin: s.transitIn.walkMin,
                        stairsCount: (_c = s.transitIn.stairsCount) !== null && _c !== void 0 ? _c : 0,
                    },
                    nowMin: t,
                });
            }
            else {
                t = Math.max(t, s.startMin);
            }
            if (s.kind === 'POI') {
                const poi = poiLookup.getPoiById(s.id);
                if (!poi) {
                    t = Math.max(t, s.endMin);
                    continue;
                }
                const arriveMin = t;
                const tw = (0, time_utils_1.withinTimeWindowForEvaluation)({
                    openingHours: poi.openingHours,
                    dateISO,
                    dayOfWeek,
                    arriveMin,
                });
                if (!tw.ok) {
                    const reason = tw.ok === false ? tw.reason : 'UNKNOWN';
                    markMiss(poi.id, reason);
                    continue;
                }
                if (tw.waitMin > 0) {
                    waitedAnyWindow = true;
                    windowWaitDelta += tw.waitMin;
                    ((_d = waitByPoi[_j = poi.id]) !== null && _d !== void 0 ? _d : (waitByPoi[_j] = [])).push(tw.waitMin);
                    t += tw.waitMin;
                    hpState = this.hpSimulator.applyTravelFatigue({
                        policy,
                        hpState,
                        travel: { walkMin: 0, queueMin: tw.waitMin },
                        nowMin: t,
                    });
                }
                const entryMin = arriveMin + ((_e = tw.waitMin) !== null && _e !== void 0 ? _e : 0);
                const deadlineInfo = (0, time_utils_1.getEntryDeadlineInfoForEvaluation)({
                    openingHours: poi.openingHours,
                    dateISO,
                    dayOfWeek,
                    entryMin,
                });
                if (deadlineInfo.deadlineMin !== undefined) {
                    const slack = deadlineInfo.deadlineMin - entryMin;
                    ((_f = perPoiSlackSamples[_k = poi.id]) !== null && _f !== void 0 ? _f : (perPoiSlackSamples[_k] = [])).push(slack);
                    const type = deadlineInfo.lastEntryMin !== undefined &&
                        deadlineInfo.windowEndMin !== undefined
                        ? deadlineInfo.deadlineMin === deadlineInfo.lastEntryMin
                            ? 'LAST_ENTRY'
                            : 'WINDOW_END'
                        : deadlineInfo.lastEntryMin !== undefined
                            ? 'LAST_ENTRY'
                            : deadlineInfo.windowEndMin !== undefined
                                ? 'WINDOW_END'
                                : 'UNKNOWN';
                    perPoiDeadlineTypeCounts[poi.id] =
                        (_g = perPoiDeadlineTypeCounts[poi.id]) !== null && _g !== void 0 ? _g : {};
                    perPoiDeadlineTypeCounts[poi.id][type] =
                        ((_h = perPoiDeadlineTypeCounts[poi.id][type]) !== null && _h !== void 0 ? _h : 0) + 1;
                }
                const q = this.sampleQueueMin(rng, poi, cfg);
                queueDelta += q;
                totalQueueMin += q;
                if (q > 0) {
                    hpState = this.hpSimulator.applyTravelFatigue({
                        policy,
                        hpState,
                        travel: { walkMin: 0, queueMin: q },
                        nowMin: t,
                    });
                }
                t += q;
                const v = this.sampleVisitMin(rng, poi, cfg);
                const plannedVisit = Math.max(0, s.endMin - s.startMin);
                visitDelta += v - plannedVisit;
                const standHpCost = v * cfg.visitStandHpPerMin;
                hpState = { ...hpState, hp: Math.max(0, hpState.hp - standHpCost) };
                t += v;
                completedPoiCount++;
            }
            else if (s.kind === 'REST') {
                const restMin = Math.max(0, s.endMin - s.startMin);
                t += restMin;
                hpState = this.hpSimulator.applyRestRecovery({
                    policy,
                    hpState,
                    restMin,
                    nowMin: t,
                    restBenefitHp: 0,
                });
            }
            else {
                const d = Math.max(0, s.endMin - s.startMin);
                t += d;
            }
        }
        const overtimeMin = Math.max(0, t - dayEndMin);
        const cost = cost_model_service_1.DefaultCostModelInstance.itineraryCost({
            totalTravelMin,
            totalWalkMin,
            totalTransfers,
            totalQueueMin,
            overtimeMin,
            totalStairsCount: 0,
            planChangeCount: 0,
        }, policy);
        return {
            finishMin: t,
            overtimeMin,
            hpEnd: hpState.hp,
            cost,
            transitDelta,
            queueDelta,
            visitDelta,
            windowWaitDelta,
            missedAnyWindow,
            missedByPoi,
            waitedAnyWindow,
            waitByPoi,
            plannedPoiCount: plannedPoiIds.size,
            completedPoiCount,
            perPoiSlackSamples,
            perPoiDeadlineTypeCounts,
        };
    }
    sampleTransitDuration(rng, seg, cfg) {
        const base = Math.max(0, seg.durationMin);
        const rel = seg.reliability;
        const std = typeof rel === 'number'
            ? base * clamp((1 - rel) * 0.6, 0.05, 0.35)
            : base * cfg.defaultTransitStdRatio;
        return sampleTruncatedNormal(rng, base, std, 0);
    }
    sampleQueueMin(rng, poi, cfg) {
        var _a, _b;
        const mean = Math.max(0, (_a = poi.queueMinMean) !== null && _a !== void 0 ? _a : 0);
        const std = Math.max(0, (_b = poi.queueMinStd) !== null && _b !== void 0 ? _b : mean * cfg.defaultQueueStdRatio);
        return sampleTruncatedNormal(rng, mean, std, 0);
    }
    sampleVisitMin(rng, poi, cfg) {
        var _a, _b;
        const mean = Math.max(5, (_a = poi.avgVisitMin) !== null && _a !== void 0 ? _a : 30);
        const std = Math.max(0, (_b = poi.visitMinStd) !== null && _b !== void 0 ? _b : mean * cfg.defaultVisitStdRatio);
        return sampleTruncatedNormal(rng, mean, std, 5);
    }
    mean(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    quantile(arr, q) {
        if (arr.length === 0)
            return 0;
        const a = [...arr].sort((x, y) => x - y);
        const pos = (a.length - 1) * clamp(q, 0, 1);
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        if (lo === hi)
            return a[lo];
        const w = pos - lo;
        return a[lo] * (1 - w) + a[hi] * w;
    }
    riskLevelFromAll(onTimeProb, overtimeP90, hpP10, completionP10) {
        if (completionP10 < 0.5)
            return 'HIGH';
        if (completionP10 < 0.7) {
            return onTimeProb >= 0.7 ? 'MEDIUM' : 'HIGH';
        }
        if (onTimeProb >= 0.8 && overtimeP90 <= 15 && hpP10 >= 18)
            return 'LOW';
        if (onTimeProb >= 0.6 && overtimeP90 <= 35 && hpP10 >= 10)
            return 'MEDIUM';
        return 'HIGH';
    }
    generateOptimizationSuggestions(metrics, opts) {
        var _a, _b, _c, _d, _e, _f;
        const bufferMin = (_a = opts === null || opts === void 0 ? void 0 : opts.bufferMin) !== null && _a !== void 0 ? _a : 12;
        const missProbThreshold = (_b = opts === null || opts === void 0 ? void 0 : opts.missProbThreshold) !== null && _b !== void 0 ? _b : 0.10;
        const waitProbThreshold = (_c = opts === null || opts === void 0 ? void 0 : opts.waitProbThreshold) !== null && _c !== void 0 ? _c : 0.30;
        const missByPoi = new Map(metrics.perPoiMissProb.map((x) => [x.poiId, x]));
        const waitByPoi = new Map(metrics.perPoiWaitProb.map((x) => [x.poiId, x]));
        const suggestions = [];
        for (const slack of metrics.perPoiEntrySlack) {
            const miss = missByPoi.get(slack.poiId);
            const missProb = (_d = miss === null || miss === void 0 ? void 0 : miss.missProb) !== null && _d !== void 0 ? _d : 0;
            const need = missProb >= missProbThreshold ||
                slack.slackP90Min < 0 ||
                slack.slackP50Min < 0;
            if (!need)
                continue;
            const targetNeg = slack.slackP90Min < 0
                ? slack.slackP90Min
                : slack.slackP50Min < 0
                    ? slack.slackP50Min
                    : 0;
            const minutes = Math.ceil(Math.max(0, -targetNeg + bufferMin));
            if (minutes >= 10) {
                const dt = (_f = (_e = slack.deadlineTypeTop) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.type;
                const dtText = dt === 'LAST_ENTRY'
                    ? '最晚入场'
                    : dt === 'WINDOW_END'
                        ? '营业结束'
                        : '时间窗';
                suggestions.push({
                    type: 'SHIFT_EARLIER',
                    poiId: slack.poiId,
                    minutes,
                    reason: `入场裕量偏紧（P90=${slack.slackP90Min.toFixed(0)}min），主要受${dtText}约束`,
                });
                if (minutes >= 60) {
                    suggestions.push({
                        type: 'UPGRADE_TRANSIT',
                        poiId: slack.poiId,
                        reason: `需要提前 ${minutes} 分钟才稳，建议考虑更快交通以减少侵入式改动`,
                    });
                }
            }
        }
        for (const w of metrics.perPoiWaitProb) {
            if (w.waitProb < waitProbThreshold)
                continue;
            suggestions.push({
                type: 'REORDER_AVOID_WAIT',
                poiId: w.poiId,
                reason: `等待概率 ${(w.waitProb * 100).toFixed(0)}%（P90 等待 ${w.waitP90Min}min），建议调整时间段/换序避开分段营业`,
            });
        }
        if (metrics.completionRateP10 < 0.7) {
            suggestions.unshift({
                type: 'REORDER_AVOID_WAIT',
                poiId: 'GLOBAL',
                reason: `完成率 P10=${(metrics.completionRateP10 * 100).toFixed(0)}%，建议整体降低密度或增加 1 次休息/缓冲`,
            });
        }
        const seen = new Set();
        return suggestions.filter((s) => {
            const key = `${s.type}:${s.poiId}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    shiftScheduleEarlier(schedule, poiId, minutes) {
        const delta = Math.max(0, Math.floor(minutes));
        if (delta === 0)
            return schedule;
        const idx = schedule.stops.findIndex((s) => s.kind === 'POI' && s.id === poiId);
        if (idx < 0)
            return schedule;
        const stops = schedule.stops.map((s, i) => {
            if (i < idx)
                return s;
            return {
                ...s,
                startMin: Math.max(0, s.startMin - delta),
                endMin: Math.max(0, s.endMin - delta),
            };
        });
        return { ...schedule, stops };
    }
    swapWithNeighborPoi(schedule, poiId, direction) {
        const stops = [...schedule.stops];
        const idx = stops.findIndex((s) => s.kind === 'POI' && s.id === poiId);
        if (idx < 0)
            return schedule;
        const step = direction === 'PREV' ? -1 : 1;
        let j = idx + step;
        while (j >= 0 && j < stops.length && stops[j].kind !== 'POI') {
            j += step;
        }
        if (j < 0 || j >= stops.length)
            return schedule;
        const tmp = stops[idx];
        stops[idx] = stops[j];
        stops[j] = tmp;
        return { ...schedule, stops };
    }
    getScheduleStructureSignature(schedule) {
        return schedule.stops
            .filter((s) => s.kind === 'POI')
            .map((s) => s.id)
            .join('>');
    }
    getScheduleTimeSignature(schedule) {
        return schedule.stops
            .map((s) => `${s.kind}:${s.id}:${s.startMin}-${s.endMin}`)
            .join('|');
    }
    isValidCandidate(candidate, base) {
        const warnings = [];
        const clampedToZero = candidate.stops.filter((s) => s.startMin === 0 && base.stops.some(bs => bs.id === s.id && bs.startMin > 0)).length;
        const negativeCount = candidate.stops.filter((s) => s.startMin < 0).length;
        const minStartMin = Math.min(...candidate.stops.map(s => s.startMin).filter(m => m >= 0));
        const firstPoiIdx = candidate.stops.findIndex(s => s.kind === 'POI');
        let shiftDelta = 0;
        if (firstPoiIdx >= 0 && base.stops.length > firstPoiIdx) {
            shiftDelta = base.stops[firstPoiIdx].startMin - candidate.stops[firstPoiIdx].startMin;
        }
        if (clampedToZero > 2 || (minStartMin === 0 && firstPoiIdx > 0 && shiftDelta > 90)) {
            return {
                valid: false,
                reason: `变形过大：${clampedToZero} 个 stop 被夹到 0，或极端提前（delta=${shiftDelta.toFixed(0)}min）`,
            };
        }
        if (clampedToZero > 0) {
            warnings.push('SHIFT_CLAMPED');
        }
        for (let i = 1; i < candidate.stops.length; i++) {
            const prev = candidate.stops[i - 1];
            const curr = candidate.stops[i];
            if (prev.kind === 'POI' &&
                curr.kind === 'POI' &&
                curr.startMin < prev.startMin - 30) {
                warnings.push('TIMELINE_BROKEN');
                return {
                    valid: true,
                    reason: '时间轴不连续（V1 限制），仅方向性对比',
                    warnings,
                };
            }
        }
        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }
    calculateDeltaSummary(candidate, base) {
        const missDelta = candidate.timeWindowMissProb - base.timeWindowMissProb;
        const waitDelta = candidate.windowWaitProb - base.windowWaitProb;
        const completionP10Delta = candidate.completionRateP10 - base.completionRateP10;
        const onTimeDelta = candidate.onTimeProb - base.onTimeProb;
        let reason;
        const improvements = [];
        if (missDelta < -0.05) {
            const pp = (-missDelta * 100).toFixed(0);
            improvements.push(`错过风险下降 ${pp}pp（最晚入场裕量更充足）`);
        }
        if (waitDelta < -0.05) {
            const pp = (-waitDelta * 100).toFixed(0);
            improvements.push(`等待风险下降 ${pp}pp（避开分段营业窗口）`);
        }
        if (completionP10Delta > 0.05) {
            const pp = (completionP10Delta * 100).toFixed(0);
            improvements.push(`完成率 P10 提升 +${pp}pp（SKIP 导致的假稳被修复）`);
        }
        if (onTimeDelta > 0.05) {
            const pp = (onTimeDelta * 100).toFixed(0);
            improvements.push(`准点概率提升 +${pp}pp`);
        }
        if (improvements.length > 0) {
            reason = `主要改善：${improvements[0]}`;
            if (improvements.length > 1) {
                reason += `；${improvements.slice(1).join('；')}`;
            }
        }
        return {
            missDelta,
            waitDelta,
            completionP10Delta,
            onTimeDelta,
            reason,
        };
    }
    calculateImpactCost(candidate, base, action) {
        let timeShiftAbsSumMin = 0;
        let movedStopCount = 0;
        const basePoiOrder = base.stops
            .filter((s) => s.kind === 'POI')
            .map((s) => s.id);
        const candidatePoiOrder = candidate.stops
            .filter((s) => s.kind === 'POI')
            .map((s) => s.id);
        const poiOrderChanged = JSON.stringify(basePoiOrder) !== JSON.stringify(candidatePoiOrder);
        const baseStopMap = new Map();
        base.stops.forEach((s) => baseStopMap.set(s.id, s));
        for (const candidateStop of candidate.stops) {
            const baseStop = baseStopMap.get(candidateStop.id);
            if (baseStop) {
                const delta = Math.abs(candidateStop.startMin - baseStop.startMin);
                if (delta > 0) {
                    timeShiftAbsSumMin += delta;
                    movedStopCount++;
                }
            }
            else {
                movedStopCount++;
            }
        }
        let severity;
        if (poiOrderChanged) {
            severity = 'MEDIUM';
        }
        else {
            const shiftMinutes = (action === null || action === void 0 ? void 0 : action.type) === 'SHIFT_EARLIER' ? action.minutes : 0;
            if (shiftMinutes >= 90 || (shiftMinutes > 60 && movedStopCount > 8)) {
                severity = 'HIGH';
            }
            else if (shiftMinutes <= 30 && movedStopCount <= 5) {
                severity = 'LOW';
            }
            else {
                severity = 'MEDIUM';
            }
        }
        return {
            timeShiftAbsSumMin,
            movedStopCount,
            poiOrderChanged,
            severity,
        };
    }
    calculateConfidence(deltaSummary) {
        var _a, _b, _c, _d;
        if (!deltaSummary) {
            return {
                level: 'LOW',
                reason: '改善幅度较小（< 5pp）',
            };
        }
        const missImprovePp = Math.max(0, -((_a = deltaSummary.missDelta) !== null && _a !== void 0 ? _a : 0) * 100);
        const completionGainPp = Math.max(0, ((_b = deltaSummary.completionP10Delta) !== null && _b !== void 0 ? _b : 0) * 100);
        const waitImprovePp = Math.max(0, -((_c = deltaSummary.waitDelta) !== null && _c !== void 0 ? _c : 0) * 100);
        const onTimeGainPp = Math.max(0, ((_d = deltaSummary.onTimeDelta) !== null && _d !== void 0 ? _d : 0) * 100);
        if (missImprovePp >= 10 || completionGainPp >= 10) {
            const reasons = [];
            if (missImprovePp >= 10)
                reasons.push(`Miss ↓${missImprovePp.toFixed(0)}pp`);
            if (completionGainPp >= 10)
                reasons.push(`CompletionP10 ↑${completionGainPp.toFixed(0)}pp`);
            return {
                level: 'HIGH',
                reason: reasons.join(', '),
            };
        }
        if (missImprovePp >= 5 || completionGainPp >= 5) {
            const reasons = [];
            if (missImprovePp >= 5)
                reasons.push(`Miss ↓${missImprovePp.toFixed(0)}pp`);
            if (completionGainPp >= 5)
                reasons.push(`CompletionP10 ↑${completionGainPp.toFixed(0)}pp`);
            if (waitImprovePp >= 5)
                reasons.push(`Wait ↓${waitImprovePp.toFixed(0)}pp`);
            if (onTimeGainPp >= 5)
                reasons.push(`OnTime ↑${onTimeGainPp.toFixed(0)}pp`);
            return {
                level: 'MEDIUM',
                reason: reasons.length > 0 ? reasons.join(', ') : '改善幅度中等',
            };
        }
        return {
            level: 'LOW',
            reason: '改善幅度较小（< 5pp）',
        };
    }
    calculateExplainTopDrivers(deltaSummary) {
        var _a, _b, _c, _d;
        if (!deltaSummary)
            return undefined;
        const drivers = [];
        const missDelta = (_a = deltaSummary.missDelta) !== null && _a !== void 0 ? _a : 0;
        const waitDelta = (_b = deltaSummary.waitDelta) !== null && _b !== void 0 ? _b : 0;
        const completionDelta = (_c = deltaSummary.completionP10Delta) !== null && _c !== void 0 ? _c : 0;
        const onTimeDelta = (_d = deltaSummary.onTimeDelta) !== null && _d !== void 0 ? _d : 0;
        if (missDelta < -0.01) {
            drivers.push({ driver: 'MISS', deltaPp: -missDelta * 100 });
        }
        if (waitDelta < -0.01) {
            drivers.push({ driver: 'WAIT', deltaPp: -waitDelta * 100 });
        }
        if (completionDelta > 0.01) {
            drivers.push({ driver: 'COMPLETION_P10', deltaPp: completionDelta * 100 });
        }
        if (onTimeDelta > 0.01) {
            drivers.push({ driver: 'ONTIME', deltaPp: onTimeDelta * 100 });
        }
        return drivers.sort((a, b) => b.deltaPp - a.deltaPp).slice(0, 3);
    }
    getSeedForCandidate(baseSeed, candidateId) {
        const seed0 = (Math.floor(baseSeed) || 0) >>> 0;
        let hash = 2166136261 >>> 0;
        for (let i = 0; i < candidateId.length; i++) {
            hash ^= candidateId.charCodeAt(i);
            hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
        }
        return (seed0 + (hash % 100000)) >>> 0;
    }
    async evaluateWhatIfReport(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const { policy, schedule: baseSchedule, dayEndMin, dateISO, dayOfWeek, poiLookup, } = args;
        const baseSeed = (Math.floor((_b = (_a = args.config) === null || _a === void 0 ? void 0 : _a.seed) !== null && _b !== void 0 ? _b : 42) || 0) >>> 0;
        const baseSamples = (_f = (_d = (_c = args.budgetStrategy) === null || _c === void 0 ? void 0 : _c.baseSamples) !== null && _d !== void 0 ? _d : (_e = args.config) === null || _e === void 0 ? void 0 : _e.samples) !== null && _f !== void 0 ? _f : 300;
        const candidateSamples = (_k = (_h = (_g = args.budgetStrategy) === null || _g === void 0 ? void 0 : _g.candidateSamples) !== null && _h !== void 0 ? _h : (_j = args.config) === null || _j === void 0 ? void 0 : _j.samples) !== null && _k !== void 0 ? _k : 300;
        const confirmSamples = (_m = (_l = args.budgetStrategy) === null || _l === void 0 ? void 0 : _l.confirmSamples) !== null && _m !== void 0 ? _m : 600;
        const meta = {
            baseSamples,
            candidateSamples,
            confirmSamples,
            baseSeed,
        };
        const baseMetrics = this.evaluateDayRobustness({
            policy,
            schedule: baseSchedule,
            dayEndMin,
            dateISO,
            dayOfWeek,
            poiLookup,
            config: {
                samples: baseSamples,
                seed: baseSeed,
            },
        });
        const base = {
            id: 'BASE',
            title: '原计划',
            description: '当前生成的行程',
            schedule: baseSchedule,
            metrics: baseMetrics,
        };
        const candidates = [];
        const seenStructureSigs = new Set();
        const baseStructureSig = this.getScheduleStructureSignature(baseSchedule);
        seenStructureSigs.add(baseStructureSig);
        const suggestions = (_o = args.suggestions) !== null && _o !== void 0 ? _o : this.generateOptimizationSuggestions(baseMetrics);
        const top = suggestions
            .filter((s) => s.type !== 'UPGRADE_TRANSIT')
            .slice(0, 3);
        const candidatePool = [];
        for (const s of top) {
            if (s.type === 'SHIFT_EARLIER') {
                const schedule2 = this.shiftScheduleEarlier(baseSchedule, s.poiId, s.minutes);
                const structureSig = this.getScheduleStructureSignature(schedule2);
                if (seenStructureSigs.has(structureSig))
                    continue;
                const valid = this.isValidCandidate(schedule2, baseSchedule);
                if (!valid.valid)
                    continue;
                const candidateId = `SHIFT:${s.poiId}:${s.minutes}`;
                const candidateSeed = this.getSeedForCandidate(baseSeed, candidateId);
                const metrics2 = this.evaluateDayRobustness({
                    policy,
                    schedule: schedule2,
                    dayEndMin,
                    dateISO,
                    dayOfWeek,
                    poiLookup,
                    config: {
                        samples: candidateSamples,
                        seed: candidateSeed,
                    },
                });
                const deltaSummary = this.calculateDeltaSummary(metrics2, baseMetrics);
                const action = {
                    type: 'SHIFT_EARLIER',
                    poiId: s.poiId,
                    minutes: s.minutes,
                };
                const impactCost = this.calculateImpactCost(schedule2, baseSchedule, action);
                const confidence = this.calculateConfidence(deltaSummary);
                const explainTopDrivers = this.calculateExplainTopDrivers(deltaSummary);
                const candidate = {
                    id: candidateId,
                    title: `提前 ${s.minutes} 分钟`,
                    description: `${s.poiId} 前移 ${s.minutes} 分钟（最小扰动）${valid.reason ? `（${valid.reason}）` : ''}`,
                    schedule: schedule2,
                    metrics: metrics2,
                    deltaSummary,
                    scheduleWarnings: valid.warnings,
                    impactCost,
                    confidence,
                    explainTopDrivers,
                    action,
                };
                seenStructureSigs.add(structureSig);
                candidatePool.push({
                    candidate,
                    action,
                    signature: structureSig,
                    score: 0,
                });
            }
            if (s.type === 'REORDER_AVOID_WAIT') {
                const prev = this.swapWithNeighborPoi(baseSchedule, s.poiId, 'PREV');
                const next = this.swapWithNeighborPoi(baseSchedule, s.poiId, 'NEXT');
                const swaps = [
                    { schedule: prev, direction: 'PREV' },
                    { schedule: next, direction: 'NEXT' },
                ];
                for (const swap of swaps) {
                    const structureSig = this.getScheduleStructureSignature(swap.schedule);
                    if (seenStructureSigs.has(structureSig))
                        continue;
                    const valid = this.isValidCandidate(swap.schedule, baseSchedule);
                    const candidateId = `SWAP_${swap.direction}:${s.poiId}`;
                    const candidateSeed = this.getSeedForCandidate(baseSeed, candidateId);
                    const metrics2 = this.evaluateDayRobustness({
                        policy,
                        schedule: swap.schedule,
                        dayEndMin,
                        dateISO,
                        dayOfWeek,
                        poiLookup,
                        config: {
                            samples: candidateSamples,
                            seed: candidateSeed,
                        },
                    });
                    const deltaSummary = this.calculateDeltaSummary(metrics2, baseMetrics);
                    const action = {
                        type: 'SWAP_NEIGHBOR',
                        poiId: s.poiId,
                        direction: swap.direction,
                    };
                    const impactCost = this.calculateImpactCost(swap.schedule, baseSchedule, action);
                    const confidence = this.calculateConfidence(deltaSummary);
                    const explainTopDrivers = this.calculateExplainTopDrivers(deltaSummary);
                    const candidate = {
                        id: candidateId,
                        title: swap.direction === 'PREV'
                            ? '换序（与前一个 POI 交换）'
                            : '换序（与后一个 POI 交换）',
                        description: `尝试通过换序降低等待风险（分段营业/午休）${valid.reason ? `（${valid.reason}）` : ''}`,
                        schedule: swap.schedule,
                        metrics: metrics2,
                        deltaSummary,
                        scheduleWarnings: valid.warnings,
                        impactCost,
                        confidence,
                        explainTopDrivers,
                        action,
                    };
                    seenStructureSigs.add(structureSig);
                    candidatePool.push({
                        candidate,
                        action,
                        signature: structureSig,
                        score: 0,
                    });
                }
            }
        }
        const score = (m) => {
            return (m.timeWindowMissProb * 3.0 +
                m.windowWaitProb * 1.5 +
                (1 - m.completionRateP10) * 2.5 +
                (1 - m.onTimeProb) * 1.0);
        };
        candidatePool.forEach((item) => {
            item.score = score(item.candidate.metrics);
        });
        const bestByStructureSig = new Map();
        for (const item of candidatePool) {
            const structureSig = item.signature;
            const existing = bestByStructureSig.get(structureSig);
            if (!existing || item.score < existing.score) {
                bestByStructureSig.set(structureSig, item);
            }
        }
        candidates.push(...Array.from(bestByStructureSig.values()).map((item) => item.candidate));
        const gate = (c) => {
            var _a, _b, _c, _d, _e, _f;
            const delta = c.deltaSummary;
            if (!delta)
                return true;
            const missImprove = -((_a = delta.missDelta) !== null && _a !== void 0 ? _a : 0);
            const waitImprove = -((_b = delta.waitDelta) !== null && _b !== void 0 ? _b : 0);
            const completionDrop = -((_c = delta.completionP10Delta) !== null && _c !== void 0 ? _c : 0);
            const onTimeImprove = (_d = delta.onTimeDelta) !== null && _d !== void 0 ? _d : 0;
            if (completionDrop > 0.05 && missImprove < 0.15) {
                return false;
            }
            if (missImprove < 0) {
                const completionGain = (_e = delta.completionP10Delta) !== null && _e !== void 0 ? _e : 0;
                if (completionGain < 0.15) {
                    return false;
                }
            }
            const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
            const baseRiskLevel = riskOrder[base.metrics.riskLevel];
            const candidateRiskLevel = riskOrder[c.metrics.riskLevel];
            if (candidateRiskLevel > baseRiskLevel) {
                if (missImprove < 0.15 && ((_f = delta.completionP10Delta) !== null && _f !== void 0 ? _f : 0) < 0.15) {
                    return false;
                }
            }
            return true;
        };
        const eligible = candidates.filter(gate);
        let winner;
        if (eligible.length > 0) {
            const benefitScore = (m) => {
                return (-(m.timeWindowMissProb * 3.0) -
                    m.windowWaitProb * 1.5 +
                    m.completionRateP10 * 2.5 +
                    m.onTimeProb * 1.0);
            };
            const sortedByBenefit = [...eligible].sort((a, b) => benefitScore(b.metrics) - benefitScore(a.metrics));
            const top2 = sortedByBenefit.slice(0, 2);
            if (top2.length === 1) {
                winner = top2[0];
            }
            else if (top2.length === 2) {
                const severityOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
                const severity0 = (_q = (_p = top2[0].impactCost) === null || _p === void 0 ? void 0 : _p.severity) !== null && _q !== void 0 ? _q : 'MEDIUM';
                const severity1 = (_s = (_r = top2[1].impactCost) === null || _r === void 0 ? void 0 : _r.severity) !== null && _s !== void 0 ? _s : 'MEDIUM';
                if (severityOrder[severity0] < severityOrder[severity1]) {
                    winner = top2[0];
                }
                else if (severityOrder[severity0] > severityOrder[severity1]) {
                    winner = top2[1];
                }
                else {
                    winner = benefitScore(top2[0].metrics) >= benefitScore(top2[1].metrics) ? top2[0] : top2[1];
                }
            }
        }
        let riskWarning = undefined;
        if (winner) {
            const warnMsg = this.getRiskWarning(winner);
            if (warnMsg) {
                riskWarning = { candidateId: winner.id, message: warnMsg };
            }
        }
        return {
            base,
            candidates,
            winnerId: winner === null || winner === void 0 ? void 0 : winner.id,
            riskWarning,
            meta,
        };
    }
    applyCandidateSchedule(report, candidateId) {
        const candidate = report.candidates.find((c) => c.id === candidateId);
        if (!candidate || !candidate.action) {
            return null;
        }
        return candidate.schedule;
    }
    async reEvaluateAfterApply(args) {
        var _a, _b, _c;
        return this.evaluateDayRobustness({
            policy: args.policy,
            schedule: args.appliedSchedule,
            dayEndMin: args.dayEndMin,
            dateISO: args.dateISO,
            dayOfWeek: args.dayOfWeek,
            poiLookup: args.poiLookup,
            config: {
                samples: (_a = args.reEvaluateSamples) !== null && _a !== void 0 ? _a : 600,
                seed: (_c = (_b = args.config) === null || _b === void 0 ? void 0 : _b.seed) !== null && _c !== void 0 ? _c : 42,
            },
        });
    }
    getRiskWarning(candidate) {
        var _a;
        const impact = candidate.impactCost;
        const confidence = candidate.confidence;
        const deltaSummary = candidate.deltaSummary;
        if (!impact || !confidence || !deltaSummary) {
            return undefined;
        }
        const missImprove = -((_a = deltaSummary.missDelta) !== null && _a !== void 0 ? _a : 0) * 100;
        if (impact.severity === 'HIGH' &&
            confidence.level !== 'HIGH' &&
            missImprove < 10) {
            return '改动较大但收益有限，建议先尝试换序或局部提前（V2 支持）';
        }
        return undefined;
    }
};
exports.RobustnessEvaluatorService = RobustnessEvaluatorService;
exports.RobustnessEvaluatorService = RobustnessEvaluatorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hp_simulator_service_1.HpSimulatorService])
], RobustnessEvaluatorService);
//# sourceMappingURL=robustness-evaluator.service.js.map