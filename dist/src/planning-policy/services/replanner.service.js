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
exports.ReplannerService = void 0;
const common_1 = require("@nestjs/common");
const cost_model_service_1 = require("./cost-model.service");
const day_scheduler_service_1 = require("./day-scheduler.service");
let ReplannerService = class ReplannerService {
    constructor(dayScheduler) {
        this.dayScheduler = dayScheduler;
    }
    freezePrefix(previousStops, nowMin, lockWindowMin) {
        const frozen = [];
        const remainingPrev = [];
        for (const s of previousStops) {
            const isPast = s.endMin <= nowMin;
            const isOngoing = s.startMin <= nowMin && nowMin < s.endMin;
            const isWithinLock = s.startMin >= nowMin && s.startMin <= nowMin + lockWindowMin;
            if (isPast || isOngoing || isWithinLock) {
                frozen.push(s);
            }
            else {
                remainingPrev.push(s);
            }
        }
        return { frozen, remainingPrev };
    }
    applyEventToPolicy(policy, event) {
        const next = JSON.parse(JSON.stringify(policy));
        if (event.type === 'WEATHER_CHANGED') {
            next.context.isRaining = event.isRaining;
            next.weights.rainWalkMultiplier = event.isRaining
                ? Math.max(next.weights.rainWalkMultiplier, 2.2)
                : 1.0;
        }
        if (event.type === 'TRAFFIC_DISRUPTION') {
            const mul = event.severity === 3 ? 1.25 : event.severity === 2 ? 1.12 : 1.06;
            next.weights.valueOfTimePerMin *= mul;
        }
        if (event.type === 'USER_EDIT') {
            next.weights.planChangePenalty *= 0.7;
        }
        return next;
    }
    buildPoiBanList(event, nowMin) {
        var _a, _b;
        const banned = new Set();
        if (event.type === 'POI_CLOSED') {
            const eff = (_a = event.effectiveFromMin) !== null && _a !== void 0 ? _a : nowMin;
            if (nowMin >= eff) {
                banned.add(event.poiId);
            }
        }
        if (event.type === 'USER_EDIT') {
            for (const id of (_b = event.removedStopIds) !== null && _b !== void 0 ? _b : []) {
                banned.add(id);
            }
        }
        return banned;
    }
    extractRemainingPoiOrder(remainingPrev) {
        return remainingPrev.filter((s) => s.kind === 'POI').map((s) => s.id);
    }
    buildCandidatePoiLists(args) {
        const { originalOrder, poiPool, bannedPoiIds, pinnedPoiIds } = args;
        const byId = new Map(poiPool.map((p) => [p.id, p]));
        const pinned = pinnedPoiIds
            .filter((id) => !bannedPoiIds.has(id))
            .map((id) => byId.get(id))
            .filter(Boolean);
        const original = originalOrder
            .filter((id) => !bannedPoiIds.has(id))
            .map((id) => byId.get(id))
            .filter(Boolean);
        const used = new Set([
            ...pinned.map((p) => p.id),
            ...original.map((p) => p.id),
        ]);
        const extras = poiPool.filter((p) => !bannedPoiIds.has(p.id) && !used.has(p.id));
        const list1 = [...pinned, ...original, ...extras];
        const list2 = [...pinned, ...original, ...extras.slice(0, 10)];
        const list3 = [...pinned, ...extras];
        return [list1, list2, list3];
    }
    diffStops(prevRemaining, newRemaining) {
        const prevIds = prevRemaining
            .filter((s) => s.kind === 'POI')
            .map((s) => s.id);
        const newIds = newRemaining
            .filter((s) => s.kind === 'POI')
            .map((s) => s.id);
        const prevSet = new Set(prevIds);
        const newSet = new Set(newIds);
        const kept = prevIds.filter((id) => newSet.has(id));
        const removed = prevIds.filter((id) => !newSet.has(id));
        const added = newIds.filter((id) => !prevSet.has(id));
        const prevTime = new Map(prevRemaining
            .filter((s) => s.kind === 'POI')
            .map((s) => [s.id, s.startMin]));
        const moved = newRemaining
            .filter((s) => s.kind === 'POI' && prevTime.has(s.id))
            .filter((s) => { var _a; return Math.abs(((_a = prevTime.get(s.id)) !== null && _a !== void 0 ? _a : s.startMin) - s.startMin) >= 45; })
            .map((s) => s.id);
        const changeCount = removed.length + added.length + moved.length;
        return {
            keptStopIds: kept,
            removedStopIds: removed,
            addedStopIds: added,
            movedStopIds: moved,
            changeCount,
        };
    }
    async replanRemaining(basePolicy, req) {
        var _a, _b, _c, _d, _e, _f, _g;
        const lockWindowMin = (_a = req.lockWindowMin) !== null && _a !== void 0 ? _a : 30;
        const { frozen, remainingPrev } = this.freezePrefix(req.previous.stops, req.nowMin, lockWindowMin);
        const policy = this.applyEventToPolicy(basePolicy, req.event);
        const bannedPoiIds = this.buildPoiBanList(req.event, req.nowMin);
        const pinned = new Set([
            ...((_b = req.pinnedPoiIds) !== null && _b !== void 0 ? _b : []),
            ...((_c = (req.event.type === 'USER_EDIT'
                ? req.event.pinnedStopIds
                : [])) !== null && _c !== void 0 ? _c : []),
        ]);
        const pinnedPoiIds = Array.from(pinned);
        const originalOrder = this.extractRemainingPoiOrder(remainingPrev);
        const poiLists = this.buildCandidatePoiLists({
            originalOrder,
            poiPool: req.poiPool,
            bannedPoiIds,
            pinnedPoiIds,
        });
        const lastFrozen = frozen.length > 0 ? frozen[frozen.length - 1] : null;
        const startLoc = lastFrozen
            ? { lat: lastFrozen.lat, lng: lastFrozen.lng }
            : req.currentLocation;
        const startMin = Math.max(req.nowMin, (_d = lastFrozen === null || lastFrozen === void 0 ? void 0 : lastFrozen.endMin) !== null && _d !== void 0 ? _d : req.nowMin);
        let best = null;
        for (const candidatePois of poiLists) {
            const dayReq = {
                dateISO: 'N/A',
                dayOfWeek: req.dayOfWeek,
                startMin,
                endMin: req.endMin,
                startLocation: startLoc,
                pois: candidatePois,
                restStops: req.restStops,
                getTransit: req.getTransit,
                mustSeePoiIds: pinnedPoiIds,
                bufferMin: 10,
            };
            const plannedRemaining = await this.dayScheduler.scheduleDay(policy, dayReq);
            const mergedStops = [...frozen, ...plannedRemaining.stops];
            const d = this.diffStops(remainingPrev, plannedRemaining.stops);
            const budget = (_e = req.changeBudget) !== null && _e !== void 0 ? _e : {
                maxChangeCount: 3,
                maxTimeShiftMin: 60,
                allowAddNewPoi: false,
                allowRemoveMustSee: false,
            };
            if (budget.maxChangeCount !== undefined && d.changeCount > budget.maxChangeCount) {
                continue;
            }
            if (!budget.allowAddNewPoi && d.addedStopIds.length > 0) {
                continue;
            }
            const maxTimeShift = this.calculateMaxTimeShift(remainingPrev, plannedRemaining.stops);
            if (budget.maxTimeShiftMin !== undefined && maxTimeShift > budget.maxTimeShiftMin) {
                continue;
            }
            const score = cost_model_service_1.DefaultCostModelInstance.itineraryCost({
                totalTravelMin: plannedRemaining.metrics.totalTravelMin,
                totalWalkMin: plannedRemaining.metrics.totalWalkMin,
                totalTransfers: plannedRemaining.metrics.totalTransfers,
                totalQueueMin: plannedRemaining.metrics.totalQueueMin,
                overtimeMin: plannedRemaining.metrics.overtimeMin,
                totalStairsCount: 0,
                planChangeCount: d.changeCount,
            }, policy);
            const explain = [];
            explain.push(`冻结已发生/锁定窗口内行程（锁定 ${lockWindowMin} 分钟），仅重排剩余部分`);
            if (req.event.type === 'WEATHER_CHANGED') {
                explain.push(req.event.isRaining
                    ? '检测到下雨：降低步行与室外优先级'
                    : '天气转好：恢复步行可用性');
            }
            if (req.event.type === 'POI_CLOSED') {
                explain.push(`景点闭馆：移除 ${req.event.poiId}`);
            }
            if (req.event.type === 'CROWD_SPIKE') {
                explain.push(`拥挤上升：降低 ${req.event.poiId} 的优先级（可用排队模型进一步细化）`);
            }
            if (pinnedPoiIds.length) {
                explain.push(`保留用户钉住/必去：${pinnedPoiIds.join(', ')}`);
            }
            const structuredExplain = this.buildStructuredExplanation(req.event, d, req.previous, plannedRemaining, pinnedPoiIds);
            if (!best || score < best.score) {
                best = {
                    plan: { stops: mergedStops, metrics: plannedRemaining.metrics },
                    diff: d,
                    score,
                    explain,
                    structuredExplain,
                };
            }
        }
        if (!best) {
            return {
                merged: {
                    stops: frozen,
                    metrics: {
                        totalTravelMin: 0,
                        totalWalkMin: 0,
                        totalTransfers: 0,
                        totalQueueMin: 0,
                        overtimeMin: 0,
                        hpEnd: basePolicy.pacing.hpMax,
                    },
                },
                diff: {
                    keptStopIds: [],
                    removedStopIds: [],
                    addedStopIds: [],
                    movedStopIds: [],
                    changeCount: 0,
                },
                explain: [
                    '重排失败：候选不足或可达性/时间窗约束过严，仅保留已冻结部分',
                ],
                structuredExplain: [
                    {
                        reason: 'FEASIBILITY_ISSUE',
                        description: '重排失败：候选不足或可达性/时间窗约束过严，仅保留已冻结部分',
                    },
                ],
                withinBudget: true,
            };
        }
        const budget = (_f = req.changeBudget) !== null && _f !== void 0 ? _f : {
            maxChangeCount: 3,
            maxTimeShiftMin: 60,
            allowAddNewPoi: false,
            allowRemoveMustSee: false,
        };
        const withinBudget = (budget.maxChangeCount === undefined || best.diff.changeCount <= budget.maxChangeCount) &&
            (budget.allowAddNewPoi || best.diff.addedStopIds.length === 0);
        const maxTimeShift = this.calculateMaxTimeShift(remainingPrev, best.plan.stops.filter(s => !frozen.some(f => f.id === s.id)));
        return {
            merged: best.plan,
            diff: best.diff,
            explain: best.explain,
            structuredExplain: best.structuredExplain,
            withinBudget,
            budgetUsage: {
                changeCount: best.diff.changeCount,
                maxChangeCount: (_g = budget.maxChangeCount) !== null && _g !== void 0 ? _g : Infinity,
                maxTimeShiftExceeded: budget.maxTimeShiftMin !== undefined && maxTimeShift > budget.maxTimeShiftMin,
            },
        };
    }
    calculateMaxTimeShift(prevStops, newStops) {
        var _a;
        const prevTimeMap = new Map(prevStops.filter((s) => s.kind === 'POI').map((s) => [s.id, s.startMin]));
        let maxShift = 0;
        for (const s of newStops) {
            if (s.kind === 'POI' && prevTimeMap.has(s.id)) {
                const shift = Math.abs(s.startMin - ((_a = prevTimeMap.get(s.id)) !== null && _a !== void 0 ? _a : s.startMin));
                maxShift = Math.max(maxShift, shift);
            }
        }
        return maxShift;
    }
    buildStructuredExplanation(event, diff, previous, newPlan, pinnedPoiIds) {
        var _a, _b;
        const explanations = [];
        let reason;
        let description;
        let impact;
        switch (event.type) {
            case 'WEATHER_CHANGED':
                reason = 'WEATHER_CHANGE';
                description = event.isRaining
                    ? '检测到下雨，调整行程以优先室内景点和便捷交通'
                    : '天气转好，恢复步行和室外景点的可用性';
                impact = {
                    reducedWalkMin: event.isRaining
                        ? Math.max(0, previous.metrics.totalWalkMin - newPlan.metrics.totalWalkMin)
                        : undefined,
                };
                break;
            case 'POI_CLOSED':
                reason = 'POI_CLOSED';
                description = `景点 ${event.poiId} 临时闭馆，已从行程中移除`;
                impact = {
                    savedTimeMin: -30,
                };
                explanations.push({
                    reason,
                    description,
                    impact,
                    alternatives: [
                        {
                            description: '保留原计划',
                            keepOriginal: true,
                            risk: '可能到达后发现闭馆，需要重新安排',
                        },
                    ],
                });
                return explanations;
            case 'CROWD_SPIKE':
                reason = 'CROWD_SPIKE';
                description = `景点 ${event.poiId} 拥挤度上升，预计排队时间增加 ${(_a = event.queueExtraMin) !== null && _a !== void 0 ? _a : 0} 分钟`;
                impact = {
                    improvedOnTimeProb: 5,
                };
                break;
            case 'TRAFFIC_DISRUPTION':
                reason = 'TRAFFIC_DISRUPTION';
                description = `检测到 ${(_b = event.area) !== null && _b !== void 0 ? _b : '该区域'} 交通中断，调整路线以避免延误`;
                impact = {
                    savedTimeMin: 10,
                    improvedOnTimeProb: 10,
                };
                break;
            case 'USER_EDIT':
                reason = 'USER_EDIT';
                description = '根据您的调整重新优化行程';
                break;
            default:
                reason = 'FEASIBILITY_ISSUE';
                description = '因可行性问题调整行程';
        }
        if (!impact) {
            impact = {
                reducedWalkMin: previous.metrics.totalWalkMin > newPlan.metrics.totalWalkMin
                    ? previous.metrics.totalWalkMin - newPlan.metrics.totalWalkMin
                    : undefined,
                reducedTransfers: previous.metrics.totalTransfers > newPlan.metrics.totalTransfers
                    ? previous.metrics.totalTransfers - newPlan.metrics.totalTransfers
                    : undefined,
            };
        }
        explanations.push({
            reason,
            description,
            impact,
        });
        if (pinnedPoiIds.length > 0) {
            explanations.push({
                reason: 'USER_EDIT',
                description: `已保留您指定的必去景点：${pinnedPoiIds.join('、')}`,
            });
        }
        return explanations;
    }
};
exports.ReplannerService = ReplannerService;
exports.ReplannerService = ReplannerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [day_scheduler_service_1.DaySchedulerService])
], ReplannerService);
//# sourceMappingURL=replanner.service.js.map