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
var CriticService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriticService = void 0;
const common_1 = require("@nestjs/common");
const event_telemetry_service_1 = require("./event-telemetry.service");
let CriticService = CriticService_1 = class CriticService {
    constructor(eventTelemetry) {
        this.eventTelemetry = eventTelemetry;
        this.logger = new common_1.Logger(CriticService_1.name);
    }
    async validateFeasibility(state) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        const violations = [];
        const timeWindowViolations = this.checkTimeWindows(state);
        violations.push(...timeWindowViolations);
        const dayBoundaryViolations = this.checkDayBoundaries(state);
        violations.push(...dayBoundaryViolations);
        const hasSchedule = state.result.timeline && state.result.timeline.length > 0;
        if (hasSchedule) {
            const lunchViolations = this.checkLunchAnchors(state);
            violations.push(...lunchViolations);
        }
        else {
            this.logger.debug('Critic: 尚未生成 schedule，跳过 LUNCH_MISSING 检查');
        }
        const robustTimeViolations = this.checkRobustTravelTime(state);
        violations.push(...robustTimeViolations);
        const waitViolations = this.checkWaitVisibility(state);
        violations.push(...waitViolations);
        const hasOptimizationResults = ((_b = (_a = state.compute) === null || _a === void 0 ? void 0 : _a.optimization_results) === null || _b === void 0 ? void 0 : _b.length) > 0;
        if (hasOptimizationResults && !hasSchedule) {
            violations.push({
                type: 'SCHEDULE_MISSING',
                message: '优化已完成但未生成 schedule，可能是优化失败',
                details: {
                    optimization_results_count: ((_d = (_c = state.compute) === null || _c === void 0 ? void 0 : _c.optimization_results) === null || _d === void 0 ? void 0 : _d.length) || 0,
                    timeline_length: ((_f = (_e = state.result) === null || _e === void 0 ? void 0 : _e.timeline) === null || _f === void 0 ? void 0 : _f.length) || 0,
                },
            });
            this.logger.warn('Critic: 检测到优化结果但 schedule 为空，标记为失败');
        }
        if (state.result.status === 'READY' && !hasSchedule) {
            violations.push({
                type: 'SCHEDULE_MISSING',
                message: `状态为 READY 但 schedule 为空，无法返回给用户`,
                details: {
                    status: state.result.status,
                    timeline_length: ((_h = (_g = state.result) === null || _g === void 0 ? void 0 : _g.timeline) === null || _h === void 0 ? void 0 : _h.length) || 0,
                    nodes_count: state.draft.nodes.length,
                },
            });
            this.logger.warn(`Critic: 状态 READY 但 schedule 为空，标记为失败`);
        }
        const userInput = state.user_input || '';
        const requiredPoiKeywords = this.extractRequiredPoiKeywords(userInput);
        if (requiredPoiKeywords.length > 0 && state.draft.nodes.length > 0) {
            const nodeNames = state.draft.nodes.map(n => (n.name || '').toLowerCase());
            const missingPois = requiredPoiKeywords.filter(keyword => !nodeNames.some(name => name.includes(keyword.toLowerCase())));
            if (missingPois.length > 0) {
                violations.push({
                    type: 'CONSTRAINTS_UNSATISFIED',
                    message: `用户指定的 POI 未完全解析: ${missingPois.join(', ')}`,
                    details: {
                        required_pois: requiredPoiKeywords,
                        missing_pois: missingPois,
                        resolved_nodes: state.draft.nodes.map(n => n.name),
                    },
                });
                this.logger.warn(`Critic: 用户指定的 POI 未完全解析: ${missingPois.join(', ')}`);
            }
        }
        const requiredDays = this.extractRequiredDays(userInput);
        if (requiredDays > 0 && ((_j = state.trip) === null || _j === void 0 ? void 0 : _j.days)) {
            const actualDays = state.trip.days;
            if (actualDays !== requiredDays) {
                violations.push({
                    type: 'DAYS_COUNT_MISMATCH',
                    message: `用户要求 ${requiredDays} 天，但行程只有 ${actualDays} 天`,
                    details: {
                        required_days: requiredDays,
                        actual_days: actualDays,
                    },
                });
                this.logger.warn(`Critic: 天数不匹配: 要求 ${requiredDays} 天，实际 ${actualDays} 天`);
            }
        }
        if (hasOptimizationResults && !((_k = state.compute) === null || _k === void 0 ? void 0 : _k.time_matrix_robust) && !((_l = state.compute) === null || _l === void 0 ? void 0 : _l.time_matrix_api)) {
            violations.push({
                type: 'TIME_MATRIX_REQUIRED_WHEN_OPTIMIZE',
                message: '优化已完成但缺少 time_matrix，优化结果可能不准确',
                details: {
                    has_time_matrix_robust: !!((_m = state.compute) === null || _m === void 0 ? void 0 : _m.time_matrix_robust),
                    has_time_matrix_api: !!((_o = state.compute) === null || _o === void 0 ? void 0 : _o.time_matrix_api),
                },
            });
            this.logger.warn('Critic: 优化已完成但缺少 time_matrix');
        }
        const min_slack = this.calculateMinSlack(state);
        const total_wait = this.calculateTotalWait(state);
        const result = {
            pass: violations.length === 0,
            violations,
            min_slack,
            total_wait,
        };
        if (this.eventTelemetry) {
            this.eventTelemetry.recordCriticResult(state.request_id, violations.map(v => `${v.type}: ${v.message}`), result.pass, result.pass ? [] : violations.map(v => v.type), {
                min_slack,
                total_wait,
                violation_count: violations.length,
            });
        }
        return result;
    }
    checkTimeWindows(state) {
        const violations = [];
        const timeline = state.result.timeline || [];
        for (const event of timeline) {
            if (event.type === 'NODE' && event.node_id) {
            }
        }
        return violations;
    }
    checkDayBoundaries(state) {
        var _a;
        const violations = [];
        const timeline = state.result.timeline || [];
        const dayBoundary = (_a = state.trip.day_boundaries) === null || _a === void 0 ? void 0 : _a[0];
        if (!dayBoundary) {
            return violations;
        }
        if (timeline.length > 0) {
            const lastEvent = timeline[timeline.length - 1];
            const eventTime = lastEvent.end || lastEvent.start;
            if (!eventTime) {
                return violations;
            }
            const endTime = this.parseTime(eventTime);
            const dayEnd = this.parseTime(dayBoundary.end);
            if (endTime > dayEnd) {
                violations.push({
                    type: 'DAY_BOUNDARY_VIOLATION',
                    message: `行程结束时间 ${eventTime} 超过了日界 ${dayBoundary.end}`,
                    details: { endTime: eventTime, dayEnd: dayBoundary.end },
                });
            }
        }
        return violations;
    }
    checkLunchAnchors(state) {
        var _a;
        const violations = [];
        if (!((_a = state.trip.lunch_break) === null || _a === void 0 ? void 0 : _a.enabled)) {
            return violations;
        }
        const timeline = state.result.timeline || [];
        const lunchEvents = timeline.filter(e => e.type === 'LUNCH');
        if (lunchEvents.length === 0) {
            violations.push({
                type: 'LUNCH_MISSING',
                message: '缺少午餐休息时间',
            });
        }
        else if (lunchEvents.length > 1) {
            violations.push({
                type: 'LUNCH_MULTIPLE',
                message: `午餐休息时间过多：${lunchEvents.length} 个`,
            });
        }
        else {
            const lunch = lunchEvents[0];
            if (!lunch.start || !state.trip.lunch_break.window || state.trip.lunch_break.window.length < 2) {
                return violations;
            }
            const lunchStart = this.parseTime(lunch.start);
            const windowStart = this.parseTime(state.trip.lunch_break.window[0]);
            const windowEnd = this.parseTime(state.trip.lunch_break.window[1]);
            if (lunchStart < windowStart || lunchStart > windowEnd) {
                violations.push({
                    type: 'LUNCH_WINDOW_VIOLATION',
                    message: `午餐时间 ${lunch.start} 不在窗口 [${state.trip.lunch_break.window[0]}, ${state.trip.lunch_break.window[1]}] 内`,
                    details: { lunchTime: lunch.start, window: state.trip.lunch_break.window },
                });
            }
        }
        return violations;
    }
    checkRobustTravelTime(state) {
        const violations = [];
        if (state.draft.nodes.length > 0 && state.compute.time_matrix_robust === null) {
            violations.push({
                type: 'ROBUST_TIME_MISSING',
                message: '缺少鲁棒时间矩阵',
            });
        }
        return violations;
    }
    extractRequiredPoiKeywords(userInput) {
        if (!userInput || userInput.trim().length === 0) {
            return [];
        }
        const keywords = [];
        const input = userInput.toLowerCase();
        const patterns = [
            /包含\s*([^，,。.\n]+)/g,
            /去\s*([^，,。.\n]+)/g,
            /参观\s*([^，,。.\n]+)/g,
            /游览\s*([^，,。.\n]+)/g,
            /包括\s*([^，,。.\n]+)/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(input)) !== null) {
                const poiName = match[1].trim();
                if (poiName && !poiName.match(/^\d+/) && poiName.length > 1) {
                    keywords.push(poiName);
                }
            }
        }
        const commaSeparated = input.match(/([^，,。.\n]+[、,，]([^，,。.\n]+[、,，])*[^，,。.\n]+)/);
        if (commaSeparated) {
            const parts = commaSeparated[0].split(/[、,，]/);
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed && trimmed.length > 1 && !trimmed.match(/^\d+/)) {
                    keywords.push(trimmed);
                }
            }
        }
        return Array.from(new Set(keywords));
    }
    extractRequiredDays(userInput) {
        if (!userInput || userInput.trim().length === 0) {
            return 0;
        }
        const input = userInput.toLowerCase();
        const patterns = [
            /(\d+)\s*天/,
            /(\d+)\s*日/,
            /(\d+)\s*晚/,
            /(\d+)\s*days?/i,
        ];
        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) {
                const days = parseInt(match[1], 10);
                if (days > 0 && days <= 30) {
                    return days;
                }
            }
        }
        return 0;
    }
    checkWaitVisibility(state) {
        const violations = [];
        const timeline = state.result.timeline || [];
        for (const event of timeline) {
            if (event.type === 'NODE' && event.wait_min && event.wait_min > 15) {
                const hasWaitEvent = timeline.some(e => e.type === 'WAIT' && e.node_id === event.node_id);
                if (!hasWaitEvent) {
                    violations.push({
                        type: 'WAIT_NOT_VISIBLE',
                        message: `节点 ${event.node_id} 有 ${event.wait_min} 分钟等待但未显式显示`,
                        node_id: event.node_id,
                        details: { wait_min: event.wait_min },
                    });
                }
            }
        }
        return violations;
    }
    calculateMinSlack(state) {
        return undefined;
    }
    calculateTotalWait(state) {
        const timeline = state.result.timeline || [];
        let totalWait = 0;
        for (const event of timeline) {
            if (event.type === 'WAIT' || (event.type === 'NODE' && event.wait_min)) {
                totalWait += event.wait_min || 0;
            }
        }
        return totalWait;
    }
    parseTime(timeStr) {
        if (!timeStr) {
            return 0;
        }
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
};
exports.CriticService = CriticService;
exports.CriticService = CriticService = CriticService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_telemetry_service_1.EventTelemetryService])
], CriticService);
//# sourceMappingURL=critic.service.js.map