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
var DrDreStrategy_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrDreStrategy = void 0;
const common_1 = require("@nestjs/common");
const fatigue_calculator_service_1 = require("../services/fatigue-calculator.service");
const airbnb_integration_service_1 = require("../../../mcp/airbnb-integration.service");
const booking_com_integration_service_1 = require("../../../mcp/booking-com-integration.service");
let DrDreStrategy = DrDreStrategy_1 = class DrDreStrategy {
    constructor(fatigueCalculator, airbnbIntegration, bookingComIntegration) {
        this.fatigueCalculator = fatigueCalculator;
        this.airbnbIntegration = airbnbIntegration;
        this.bookingComIntegration = bookingComIntegration;
        this.logger = new common_1.Logger(DrDreStrategy_1.name);
        this.personaName = 'DR_DRE';
    }
    async evaluate(world, plan) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        this.logger.debug(`Dr.Dre 评估计划: ${plan.tripId}`);
        const pace = this.buildPaceConstraints(world);
        let dayProfiles = this.buildDayProfiles(plan, pace);
        if (this.airbnbIntegration && plan.segments.length > 0) {
            try {
                const segmentsByDay = new Map();
                for (const segment of plan.segments) {
                    const dayIndex = segment.dayIndex || 0;
                    if (!segmentsByDay.has(dayIndex)) {
                        segmentsByDay.set(dayIndex, []);
                    }
                    segmentsByDay.get(dayIndex).push(segment);
                }
                for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
                    const lastSegment = daySegments[daySegments.length - 1];
                    const endPointLocation = ((_a = lastSegment.metadata) === null || _a === void 0 ? void 0 : _a.endLocation) ||
                        ((_b = lastSegment.metadata) === null || _b === void 0 ? void 0 : _b.toLocation) ||
                        ((_c = lastSegment.metadata) === null || _c === void 0 ? void 0 : _c.coordinates);
                    if (endPointLocation && endPointLocation.lat && endPointLocation.lng) {
                        const currentYear = new Date().getFullYear();
                        const month = world.physical.month;
                        const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
                        const checkinDate = dayDate.toISOString().split('T')[0];
                        const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];
                        const partySize = ((_d = world.human) === null || _d === void 0 ? void 0 : _d.partySize) || 2;
                        const impact = await this.airbnbIntegration.checkAccommodationImpactOnPace({ lat: endPointLocation.lat, lng: endPointLocation.lng }, checkinDate, checkoutDate, partySize);
                        if (impact.impact === 'HIGH' && impact.distanceToNearestAccommodation > 10000) {
                            const additionalDistanceKm = impact.distanceToNearestAccommodation / 1000;
                            const dayProfile = dayProfiles.find(d => d.dayIndex === dayIndex);
                            if (dayProfile) {
                                dayProfile.fatigueIndex = Math.min(dayProfile.fatigueIndex * (1 + additionalDistanceKm / 50), 2.0);
                                this.logger.debug(`Day ${dayIndex}: 住宿距离 ${(impact.distanceToNearestAccommodation / 1000).toFixed(1)}km，调整疲劳指数至 ${dayProfile.fatigueIndex.toFixed(2)}`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Airbnb pace impact check failed: ${error.message}, continuing with original pace`);
            }
        }
        if (this.bookingComIntegration && plan.segments.length > 0) {
            try {
                const segmentsByDay = new Map();
                for (const segment of plan.segments) {
                    const dayIndex = segment.dayIndex || 0;
                    if (!segmentsByDay.has(dayIndex)) {
                        segmentsByDay.set(dayIndex, []);
                    }
                    segmentsByDay.get(dayIndex).push(segment);
                }
                for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
                    const firstSegment = daySegments[0];
                    const lastSegment = daySegments[daySegments.length - 1];
                    const pickupLocation = ((_e = firstSegment.metadata) === null || _e === void 0 ? void 0 : _e.startLocation) ||
                        ((_f = firstSegment.metadata) === null || _f === void 0 ? void 0 : _f.fromLocation) ||
                        ((_g = firstSegment.metadata) === null || _g === void 0 ? void 0 : _g.coordinates);
                    const dropoffLocation = ((_h = lastSegment.metadata) === null || _h === void 0 ? void 0 : _h.endLocation) ||
                        ((_j = lastSegment.metadata) === null || _j === void 0 ? void 0 : _j.toLocation) ||
                        ((_k = lastSegment.metadata) === null || _k === void 0 ? void 0 : _k.coordinates);
                    if (pickupLocation && dropoffLocation &&
                        pickupLocation.lat && pickupLocation.lng &&
                        dropoffLocation.lat && dropoffLocation.lng) {
                        const currentYear = new Date().getFullYear();
                        const month = world.physical.month;
                        const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
                        const pickupTime = '10:00';
                        const dropoffTime = '18:00';
                        const driverAge = ((_l = world.human) === null || _l === void 0 ? void 0 : _l.driverAge) || 25;
                        const impact = await this.bookingComIntegration.checkCarRentalImpactOnPace(pickupLocation, dropoffLocation, pickupTime, dropoffTime, driverAge);
                        if (impact.impactLevel === 'HIGH') {
                            const dayProfile = dayProfiles.find(d => d.dayIndex === dayIndex);
                            if (dayProfile) {
                                const additionalDistanceKm = impact.distanceToPickupLocation / 1000;
                                dayProfile.fatigueIndex = Math.min(dayProfile.fatigueIndex * (1 + additionalDistanceKm / 50), 2.0);
                                this.logger.debug(`Day ${dayIndex}: 租车位置影响节奏，调整疲劳指数至 ${dayProfile.fatigueIndex.toFixed(2)}`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Booking.com car rental impact check failed: ${error.message}`);
            }
        }
        const logs = [];
        const overloadedDays = dayProfiles.filter(d => d.fatigueIndex > 1.1);
        const severeDays = dayProfiles.filter(d => d.fatigueIndex > 1.4);
        const rollingIssues = this.detectRollingFatigue(dayProfiles, pace);
        const ops = [];
        for (const day of severeDays) {
            const op = this.planSplitDay(day, dayProfiles, pace);
            if (op) {
                ops.push(op);
            }
        }
        if (rollingIssues.length) {
            const op = this.planBufferDay(rollingIssues, dayProfiles, pace, world.human);
            if (op) {
                ops.push(op);
            }
        }
        if (ops.length === 0 && overloadedDays.length > 0) {
            for (const day of overloadedDays) {
                const op = this.planSplitDay(day, dayProfiles, pace);
                if (op) {
                    ops.push(op);
                    break;
                }
            }
        }
        if (!ops.length) {
            return {
                allowed: true,
                action: 'ALLOW',
                updatedPlan: plan,
                logs: [
                    {
                        persona: 'DR_DRE',
                        action: 'ALLOW',
                        explanation: '日节奏与连续疲劳均在可接受范围内，无需结构调整',
                        reasonCodes: [],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'HUMAN',
                        decisionStage: 'PACE_ADJUST',
                    },
                ],
            };
        }
        let updatedPlan = { ...plan };
        for (const op of ops) {
            updatedPlan = this.applyOp(updatedPlan, op);
            logs.push({
                persona: 'DR_DRE',
                action: 'ADJUST',
                explanation: this.describeOp(op),
                reasonCodes: [op.type],
                evidenceRefs: [],
                timestamp: new Date().toISOString(),
                decisionSource: 'HUMAN',
                decisionStage: 'PACE_ADJUST',
            });
        }
        this.logger.debug(`Dr.Dre 评估完成: ADJUST, 操作数: ${ops.length}`);
        return {
            allowed: true,
            action: 'ADJUST',
            updatedPlan,
            logs,
        };
    }
    buildPaceConstraints(world) {
        var _a;
        const human = world.human;
        const routeDirection = world.routeDirection;
        const softConstraints = ((_a = routeDirection.constraints) === null || _a === void 0 ? void 0 : _a.soft) || {};
        const maxDailyAscentM = Math.min(human.maxDailyAscentM, softConstraints.maxDailyAscentM || Infinity);
        const rollingAscent3DaysM = human.rollingAscent3DaysM;
        let maxDailyDistanceKm = 22;
        if (human.preferredPace === 'SLOW') {
            maxDailyDistanceKm = human.bufferDayBias === 'HIGH' ? 16 : 18;
        }
        else if (human.preferredPace === 'FAST') {
            maxDailyDistanceKm = 24;
        }
        else {
            maxDailyDistanceKm = 22;
        }
        let maxMovingHours = 9;
        if (human.preferredPace === 'SLOW') {
            maxMovingHours = 7;
        }
        else if (human.preferredPace === 'FAST') {
            maxMovingHours = 10;
        }
        return {
            maxDailyAscentM,
            maxDailyDistanceKm,
            maxMovingHours,
            rollingAscent3DaysM,
        };
    }
    buildDayProfiles(plan, pace) {
        var _a;
        const daysMap = new Map();
        for (const seg of plan.segments) {
            const list = (_a = daysMap.get(seg.dayIndex)) !== null && _a !== void 0 ? _a : [];
            list.push(seg);
            daysMap.set(seg.dayIndex, list);
        }
        return Array.from(daysMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([dayIndex, segments]) => {
            const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
            const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
            const maxSlopePct = segments.reduce((m, seg) => { var _a; return Math.max(m, (_a = seg.slopePct) !== null && _a !== void 0 ? _a : 0); }, 0);
            const estMovingHours = this.fatigueCalculator.estimateMovingHours(totalDistanceKm, totalAscentM);
            const dp = {
                dayIndex,
                segments,
                totalDistanceKm,
                totalAscentM,
                maxSlopePct,
                estMovingHours,
                fatigueIndex: 0,
            };
            dp.fatigueIndex = this.fatigueCalculator.computeFatigueIndex(dp, pace);
            return dp;
        });
    }
    detectRollingFatigue(days, pace) {
        const issues = [];
        for (let i = 0; i < days.length - 2; i++) {
            const window = days.slice(i, i + 3);
            const total = window.reduce((s, d) => s + d.totalAscentM, 0);
            if (total > pace.rollingAscent3DaysM) {
                issues.push({
                    startDay: window[0].dayIndex,
                    endDay: window[2].dayIndex,
                    totalAscent: total,
                });
            }
        }
        return issues;
    }
    planSplitDay(day, allDays, pace) {
        const segs = day.segments;
        if (segs.length <= 1) {
            return null;
        }
        let best = null;
        for (let i = 0; i < segs.length - 1; i++) {
            const firstSegs = segs.slice(0, i + 1);
            const secondSegs = segs.slice(i + 1);
            const firstProfile = this.buildDayProfileFromSegments(day.dayIndex, firstSegs, pace);
            const secondProfile = this.buildDayProfileFromSegments(day.dayIndex + 1, secondSegs, pace);
            const maxFatigue = Math.max(firstProfile.fatigueIndex, secondProfile.fatigueIndex);
            const score = 1 / maxFatigue;
            if (!best || score > best.score) {
                best = { idx: i, score };
            }
        }
        if (!best) {
            return null;
        }
        if (1 / best.score > 1.4) {
            return null;
        }
        return {
            type: 'SPLIT_DAY',
            dayIndex: day.dayIndex,
            splitAfterSegmentIndex: best.idx,
        };
    }
    buildDayProfileFromSegments(dayIndex, segments, pace) {
        const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
        const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
        const maxSlopePct = segments.reduce((m, seg) => { var _a; return Math.max(m, (_a = seg.slopePct) !== null && _a !== void 0 ? _a : 0); }, 0);
        const estMovingHours = this.fatigueCalculator.estimateMovingHours(totalDistanceKm, totalAscentM);
        const dp = {
            dayIndex,
            segments,
            totalDistanceKm,
            totalAscentM,
            maxSlopePct,
            estMovingHours,
            fatigueIndex: 0,
        };
        dp.fatigueIndex = this.fatigueCalculator.computeFatigueIndex(dp, pace);
        return dp;
    }
    planBufferDay(rollingIssues, days, pace, human) {
        if ((human === null || human === void 0 ? void 0 : human.bufferDayBias) === 'LOW') {
            const issue = rollingIssues[0];
            const threshold = pace.rollingAscent3DaysM * 1.2;
            if (issue.totalAscent < threshold) {
                return null;
            }
        }
        const issue = rollingIssues[0];
        const windowDays = days.filter(d => d.dayIndex >= issue.startDay && d.dayIndex <= issue.endDay);
        if (!windowDays.length) {
            return null;
        }
        const worst = windowDays.reduce((max, d) => d.fatigueIndex > max.fatigueIndex ? d : max);
        let template = 'REST';
        if ((human === null || human === void 0 ? void 0 : human.bufferDayBias) === 'LOW') {
            template = 'LIGHT_WALK';
        }
        else if ((human === null || human === void 0 ? void 0 : human.bufferDayBias) === 'HIGH') {
            template = 'REST';
        }
        return {
            type: 'INSERT_BUFFER_DAY',
            insertAfterDayIndex: worst.dayIndex,
            template,
        };
    }
    applyOp(plan, op) {
        if (op.type === 'SPLIT_DAY') {
            return this.applySplit(plan, op);
        }
        if (op.type === 'INSERT_BUFFER_DAY') {
            return this.applyBuffer(plan, op);
        }
        return plan;
    }
    applySplit(plan, op) {
        const segs = [...plan.segments];
        const result = [];
        const processedSegments = new Set();
        for (const seg of segs) {
            if (seg.dayIndex < op.dayIndex) {
                result.push(seg);
                processedSegments.add(seg.segmentId);
            }
        }
        const sameDaySegs = segs
            .filter(s => s.dayIndex === op.dayIndex)
            .sort((a, b) => {
            return 0;
        });
        if (sameDaySegs.length > 0) {
            const firstPart = sameDaySegs.slice(0, op.splitAfterSegmentIndex + 1);
            const secondPart = sameDaySegs.slice(op.splitAfterSegmentIndex + 1);
            for (const s of firstPart) {
                result.push(s);
                processedSegments.add(s.segmentId);
            }
            for (const s of secondPart) {
                result.push({ ...s, dayIndex: s.dayIndex + 1 });
                processedSegments.add(s.segmentId);
            }
        }
        for (const seg of segs) {
            if (!processedSegments.has(seg.segmentId) && seg.dayIndex > op.dayIndex) {
                result.push({
                    ...seg,
                    dayIndex: seg.dayIndex + 1,
                });
            }
        }
        return { ...plan, segments: result };
    }
    applyBuffer(plan, op) {
        const segs = [...plan.segments];
        const result = [];
        for (const seg of segs) {
            if (seg.dayIndex <= op.insertAfterDayIndex) {
                result.push(seg);
            }
            else {
                result.push({
                    ...seg,
                    dayIndex: seg.dayIndex + 1,
                });
            }
        }
        const bufferSegment = {
            segmentId: `REST_${op.insertAfterDayIndex + 1}_${Date.now()}`,
            dayIndex: op.insertAfterDayIndex + 1,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: {
                type: 'REST_DAY',
                template: op.template || 'REST',
            },
        };
        const insertIndex = result.findIndex(s => s.dayIndex > op.insertAfterDayIndex);
        if (insertIndex >= 0) {
            result.splice(insertIndex, 0, bufferSegment);
        }
        else {
            result.push(bufferSegment);
        }
        return { ...plan, segments: result };
    }
    describeOp(op) {
        if (op.type === 'SPLIT_DAY') {
            return `将第 ${op.dayIndex} 天拆分为两天，以降低单日负荷`;
        }
        if (op.type === 'INSERT_BUFFER_DAY') {
            return `在第 ${op.insertAfterDayIndex} 天之后插入缓冲日，缓解连续疲劳`;
        }
        return '进行了节奏调整';
    }
};
exports.DrDreStrategy = DrDreStrategy;
exports.DrDreStrategy = DrDreStrategy = DrDreStrategy_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [fatigue_calculator_service_1.FatigueCalculatorService,
        airbnb_integration_service_1.AirbnbIntegrationService,
        booking_com_integration_service_1.BookingComIntegrationService])
], DrDreStrategy);
//# sourceMappingURL=dr-dre-strategy.service.js.map