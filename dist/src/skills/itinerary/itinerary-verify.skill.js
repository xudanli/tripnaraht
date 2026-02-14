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
var ItineraryVerifySkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryVerifySkill = void 0;
const common_1 = require("@nestjs/common");
const skill_decorator_1 = require("../decorators/skill.decorator");
const opening_hours_util_1 = require("../../common/utils/opening-hours.util");
const luxon_1 = require("luxon");
let ItineraryVerifySkill = ItineraryVerifySkill_1 = class ItineraryVerifySkill {
    constructor() {
        this.logger = new common_1.Logger(ItineraryVerifySkill_1.name);
        this.metadata = {
            name: 'itinerary.verify',
            description: '验证行程的可行性（开放时间冲突、换乘 buffer、可达性、疲劳阈值）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['itinerary'],
                typeChecks: {
                    itinerary: {
                        type: 'object',
                    },
                },
                extractors: {
                    itinerary: {
                        type: 'step',
                        stepId: 'itinerary.generate',
                        path: 'result.itinerary',
                    },
                },
            },
        };
        this.logger.log(`[ItineraryVerifySkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 itinerary.verify: request_id=${input.itinerary.request_id}`);
        try {
            const { itinerary, research_data } = input;
            const issues = [];
            this.verifyOpeningHours(itinerary, research_data, issues);
            this.verifyTransferBuffers(itinerary, issues);
            this.verifyReachability(itinerary, research_data, issues);
            this.verifyFatigueThresholds(itinerary, issues);
            this.verifyTimeWindowOverlaps(itinerary, issues);
            const errorCount = issues.filter(i => i.severity === 'ERROR').length;
            const warningCount = issues.filter(i => i.severity === 'WARNING').length;
            return {
                verified: errorCount === 0,
                issues,
                summary: {
                    total_issues: issues.length,
                    error_count: errorCount,
                    warning_count: warningCount,
                },
            };
        }
        catch (error) {
            this.logger.error(`itinerary.verify 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    verifyOpeningHours(itinerary, researchData, issues) {
        var _a;
        const openingHoursData = researchData === null || researchData === void 0 ? void 0 : researchData.opening_hours_evidence;
        if (!openingHoursData) {
            return;
        }
        const openingHoursMap = new Map();
        if (Array.isArray(openingHoursData)) {
            openingHoursData.forEach((item) => {
                if (item.poi_id && item.opening_hours) {
                    openingHoursMap.set(item.poi_id, item);
                }
            });
        }
        else if (openingHoursData.opening_hours && Array.isArray(openingHoursData.opening_hours)) {
            openingHoursData.opening_hours.forEach((item) => {
                if (item.poi_id && item.opening_hours) {
                    openingHoursMap.set(item.poi_id, item);
                }
            });
        }
        for (const day of itinerary.days) {
            const dayDate = luxon_1.DateTime.fromISO(day.date);
            for (const item of day.items) {
                if (item.type !== 'POI' || !((_a = item.location_ref) === null || _a === void 0 ? void 0 : _a.place_id)) {
                    continue;
                }
                const poiId = item.location_ref.place_id;
                const openingHoursInfo = openingHoursMap.get(poiId);
                if (!openingHoursInfo) {
                    issues.push({
                        type: 'OPENING_HOURS_CONFLICT',
                        severity: 'WARNING',
                        item_id: item.id,
                        day: day.date,
                        message: `POI "${item.location_ref.name}" 缺少开放时间数据`,
                        suggestion: '请确认该地点在指定时间是否开放',
                    });
                    continue;
                }
                const startTime = this.parseTimeWindow(item.start_window, dayDate);
                const endTime = this.parseTimeWindow(item.end_window, dayDate);
                if (startTime && endTime) {
                    const isOpen = openingHoursInfo.is_open_now;
                    const openingHours = openingHoursInfo.opening_hours;
                    if (isOpen === false) {
                        issues.push({
                            type: 'OPENING_HOURS_CONFLICT',
                            severity: 'ERROR',
                            item_id: item.id,
                            day: day.date,
                            message: `POI "${item.location_ref.name}" 在 ${day.date} ${item.start_window} 可能未开放`,
                            suggestion: openingHours ? `建议调整到开放时间：${openingHours}` : '请检查该地点的开放时间',
                        });
                    }
                    else if (openingHours && typeof openingHours === 'string') {
                        const hoursStr = openingHours;
                        const checkDate = startTime.toJSDate();
                        const timezone = 'UTC';
                        if (!opening_hours_util_1.OpeningHoursUtil.isOpenAt(hoursStr, checkDate, timezone)) {
                            issues.push({
                                type: 'OPENING_HOURS_CONFLICT',
                                severity: 'ERROR',
                                item_id: item.id,
                                day: day.date,
                                message: `POI "${item.location_ref.name}" 在 ${item.start_window} 不在开放时间内`,
                                suggestion: `开放时间：${hoursStr}`,
                            });
                        }
                    }
                }
            }
        }
    }
    verifyTransferBuffers(itinerary, issues) {
        var _a, _b;
        const MIN_TRANSFER_BUFFER_MINUTES = 30;
        for (const day of itinerary.days) {
            const items = day.items.filter(item => item.type !== 'REST');
            for (let i = 0; i < items.length - 1; i++) {
                const currentItem = items[i];
                const nextItem = items[i + 1];
                if (currentItem.type === 'TRANSIT' || nextItem.type === 'TRANSIT') {
                    const currentEnd = this.parseTimeWindow(currentItem.end_window, luxon_1.DateTime.fromISO(day.date));
                    const nextStart = this.parseTimeWindow(nextItem.start_window, luxon_1.DateTime.fromISO(day.date));
                    if (currentEnd && nextStart) {
                        const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
                        if (bufferMinutes < MIN_TRANSFER_BUFFER_MINUTES) {
                            issues.push({
                                type: 'TRANSFER_BUFFER_INSUFFICIENT',
                                severity: bufferMinutes < 15 ? 'ERROR' : 'WARNING',
                                item_id: nextItem.id,
                                day: day.date,
                                message: `换乘时间不足：从 "${((_a = currentItem.location_ref) === null || _a === void 0 ? void 0 : _a.name) || '上一站'}" 到 "${((_b = nextItem.location_ref) === null || _b === void 0 ? void 0 : _b.name) || '下一站'}" 只有 ${Math.round(bufferMinutes)} 分钟`,
                                suggestion: `建议至少预留 ${MIN_TRANSFER_BUFFER_MINUTES} 分钟换乘时间`,
                            });
                        }
                    }
                }
            }
        }
    }
    verifyReachability(itinerary, researchData, issues) {
        const transportEvidence = researchData === null || researchData === void 0 ? void 0 : researchData.transport_evidence;
        if (!transportEvidence) {
            return;
        }
        if (transportEvidence.options && Array.isArray(transportEvidence.options)) {
            const hasValidOption = transportEvidence.options.some((option) => option.duration_minutes && option.duration_minutes > 0);
            if (!hasValidOption) {
                issues.push({
                    type: 'REACHABILITY_ISSUE',
                    severity: 'ERROR',
                    message: '未找到可行的交通路线',
                    suggestion: '请检查起点和终点的可达性',
                });
            }
        }
    }
    verifyFatigueThresholds(itinerary, issues) {
        var _a, _b;
        const MAX_DAILY_WALK_KM = 15;
        const MAX_DAILY_ACTIVITY_HOURS = 10;
        for (const day of itinerary.days) {
            let totalWalkDistance = 0;
            let totalActivityMinutes = 0;
            for (const item of day.items) {
                if (item.type === 'WALK' && ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.distance_meters)) {
                    totalWalkDistance += item.metadata.distance_meters / 1000;
                }
                if (item.type !== 'REST' && ((_b = item.metadata) === null || _b === void 0 ? void 0 : _b.duration_minutes)) {
                    totalActivityMinutes += item.metadata.duration_minutes;
                }
                else if (item.start_window && item.end_window) {
                    const start = this.parseTimeWindow(item.start_window, luxon_1.DateTime.fromISO(day.date));
                    const end = this.parseTimeWindow(item.end_window, luxon_1.DateTime.fromISO(day.date));
                    if (start && end) {
                        totalActivityMinutes += end.diff(start, 'minutes').minutes;
                    }
                }
            }
            if (totalWalkDistance > MAX_DAILY_WALK_KM) {
                issues.push({
                    type: 'FATIGUE_THRESHOLD_EXCEEDED',
                    severity: 'WARNING',
                    day: day.date,
                    message: `每日步行距离 ${totalWalkDistance.toFixed(1)} 公里超过建议值 ${MAX_DAILY_WALK_KM} 公里`,
                    suggestion: '建议减少步行距离或增加休息时间',
                });
            }
            const totalActivityHours = totalActivityMinutes / 60;
            if (totalActivityHours > MAX_DAILY_ACTIVITY_HOURS) {
                issues.push({
                    type: 'FATIGUE_THRESHOLD_EXCEEDED',
                    severity: 'WARNING',
                    day: day.date,
                    message: `每日活动时间 ${totalActivityHours.toFixed(1)} 小时超过建议值 ${MAX_DAILY_ACTIVITY_HOURS} 小时`,
                    suggestion: '建议减少活动数量或增加休息时间',
                });
            }
        }
    }
    verifyTimeWindowOverlaps(itinerary, issues) {
        var _a, _b;
        for (const day of itinerary.days) {
            const items = day.items.filter(item => item.type !== 'REST');
            const dayDate = luxon_1.DateTime.fromISO(day.date);
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const item1 = items[i];
                    const item2 = items[j];
                    const start1 = this.parseTimeWindow(item1.start_window, dayDate);
                    const end1 = this.parseTimeWindow(item1.end_window, dayDate);
                    const start2 = this.parseTimeWindow(item2.start_window, dayDate);
                    const end2 = this.parseTimeWindow(item2.end_window, dayDate);
                    if (start1 && end1 && start2 && end2) {
                        if (start1 < end2 && start2 < end1) {
                            issues.push({
                                type: 'TIME_WINDOW_OVERLAP',
                                severity: 'ERROR',
                                item_id: item2.id,
                                day: day.date,
                                message: `时间窗重叠：${((_a = item1.location_ref) === null || _a === void 0 ? void 0 : _a.name) || '活动1'} 和 ${((_b = item2.location_ref) === null || _b === void 0 ? void 0 : _b.name) || '活动2'} 的时间窗重叠`,
                                suggestion: '请调整其中一个活动的时间',
                            });
                        }
                    }
                }
            }
        }
    }
    parseTimeWindow(timeWindow, baseDate) {
        if (!timeWindow) {
            return null;
        }
        if (timeWindow.includes('T') || timeWindow.includes('Z')) {
            try {
                return luxon_1.DateTime.fromISO(timeWindow);
            }
            catch {
                return null;
            }
        }
        const timeMatch = timeWindow.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            return baseDate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        }
        return null;
    }
};
exports.ItineraryVerifySkill = ItineraryVerifySkill;
exports.ItineraryVerifySkill = ItineraryVerifySkill = ItineraryVerifySkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'itinerary.verify',
        description: '验证行程的可行性（开放时间冲突、换乘 buffer、可达性、疲劳阈值）',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ItineraryVerifySkill);
//# sourceMappingURL=itinerary-verify.skill.js.map