"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ConstraintConflictResolver_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstraintConflictResolver = void 0;
const common_1 = require("@nestjs/common");
let ConstraintConflictResolver = ConstraintConflictResolver_1 = class ConstraintConflictResolver {
    constructor() {
        this.logger = new common_1.Logger(ConstraintConflictResolver_1.name);
    }
    async detectAndExplainConflicts(constraints, plan, state) {
        var _a, _b, _c, _d, _e, _f, _g;
        const conflicts = [];
        if (((_a = constraints.hard_constraints) === null || _a === void 0 ? void 0 : _a.budget) && ((_b = constraints.soft_constraints) === null || _b === void 0 ? void 0 : _b.comfort_level)) {
            const budgetConflict = this.detectBudgetVsComfortConflict(constraints, plan, state);
            if (budgetConflict) {
                conflicts.push(budgetConflict);
            }
        }
        if (((_c = constraints.soft_constraints) === null || _c === void 0 ? void 0 : _c.pace) && ((_d = constraints.hard_constraints) === null || _d === void 0 ? void 0 : _d.physical_limitations)) {
            const paceConflict = this.detectPaceVsPhysicalConflict(constraints, plan, state);
            if (paceConflict) {
                conflicts.push(paceConflict);
            }
        }
        if (((_e = constraints.hard_constraints) === null || _e === void 0 ? void 0 : _e.date_window) && plan) {
            const dateConflict = this.detectDateWindowVsActivityConflict(constraints, plan, state);
            if (dateConflict) {
                conflicts.push(dateConflict);
            }
        }
        if (((_f = constraints.hard_constraints) === null || _f === void 0 ? void 0 : _f.travel_mode) && plan) {
            const transportConflict = this.detectTransportVsTimeConflict(constraints, plan, state);
            if (transportConflict) {
                conflicts.push(transportConflict);
            }
        }
        if (((_g = constraints.soft_constraints) === null || _g === void 0 ? void 0 : _g.risk_tolerance) && plan) {
            const riskConflict = this.detectRiskToleranceConflict(constraints, plan, state);
            if (riskConflict) {
                conflicts.push(riskConflict);
            }
        }
        const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
        const highCount = conflicts.filter(c => c.severity === 'high').length;
        const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
        const lowCount = conflicts.filter(c => c.severity === 'low').length;
        return {
            conflicts,
            has_conflicts: conflicts.length > 0,
            critical_count: criticalCount,
            high_count: highCount,
            medium_count: mediumCount,
            low_count: lowCount,
        };
    }
    detectBudgetVsComfortConflict(constraints, plan, state) {
        const budget = constraints.hard_constraints.budget;
        const comfort = constraints.soft_constraints.comfort_level;
        const hotelQualityCostMap = {
            low: 0.2,
            medium: 0.35,
            high: 0.5,
        };
        const estimatedHotelCost = budget.max * hotelQualityCostMap[comfort.hotel_quality];
        const maxHotelBudget = budget.max * 0.4;
        if (estimatedHotelCost > maxHotelBudget) {
            const overrunPercent = Math.round(((estimatedHotelCost - maxHotelBudget) / budget.max) * 100);
            const severity = overrunPercent > 20 ? 'high' : overrunPercent > 10 ? 'medium' : 'low';
            return {
                between: ['budget', 'hotel_quality'],
                description: `高住宿品质（${comfort.hotel_quality}）与当前预算存在冲突，预计住宿成本将超过预算的${Math.round((estimatedHotelCost / budget.max) * 100)}%`,
                severity,
                tradeoff_options: [
                    `增加预算 ${overrunPercent}%`,
                    '减少住宿夜数',
                    '接受非市中心位置',
                    `降低住宿品质要求至 ${comfort.hotel_quality === 'high' ? 'medium' : 'low'}`,
                ],
                details: {
                    budget_max: budget.max,
                    budget_currency: budget.currency,
                    hotel_quality: comfort.hotel_quality,
                    estimated_hotel_cost: estimatedHotelCost,
                    max_hotel_budget: maxHotelBudget,
                    overrun_percent: overrunPercent,
                },
            };
        }
        return null;
    }
    detectPaceVsPhysicalConflict(constraints, plan, state) {
        const pace = constraints.soft_constraints.pace;
        const physical = constraints.hard_constraints.physical_limitations;
        const paceHoursMap = {
            relaxed: 4,
            moderate: 6,
            intense: 8,
        };
        const requiredHours = paceHoursMap[pace.preference];
        const maxHours = physical.daily_activity_hours_max;
        if (maxHours && requiredHours > maxHours) {
            const severity = requiredHours - maxHours > 2 ? 'high' : 'medium';
            return {
                between: ['pace', 'physical_limitations'],
                description: `紧凑节奏（${pace.preference}）需要每日约${requiredHours}小时活动时间，但体力限制为每日最多${maxHours}小时`,
                severity,
                tradeoff_options: [
                    `调整节奏为 ${pace.preference === 'intense' ? 'moderate' : 'relaxed'}`,
                    maxHours < 6 ? '增加体力限制（如果可能）' : '接受部分天数的紧凑安排',
                    '在行程中增加休息日',
                ],
                details: {
                    pace_preference: pace.preference,
                    required_hours: requiredHours,
                    max_hours: maxHours,
                    deficit_hours: requiredHours - maxHours,
                },
            };
        }
        return null;
    }
    detectDateWindowVsActivityConflict(constraints, plan, state) {
        const dateWindow = constraints.hard_constraints.date_window;
        const startDate = new Date(dateWindow.start);
        const endDate = new Date(dateWindow.end);
        const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const totalActivities = plan.days.reduce((sum, day) => sum + day.timeSlots.filter(slot => slot.type !== 'rest' && slot.type !== 'transport').length, 0);
        const avgActivitiesPerDay = totalActivities / days;
        if (avgActivitiesPerDay > 5) {
            return {
                between: ['date_window', 'activity_count'],
                description: `在${days}天的行程中安排了${totalActivities}个活动，平均每天${avgActivitiesPerDay.toFixed(1)}个，可能导致行程过于紧凑`,
                severity: avgActivitiesPerDay > 7 ? 'high' : 'medium',
                tradeoff_options: [
                    '延长行程日期',
                    '减少活动数量',
                    '接受紧凑的行程安排',
                ],
                details: {
                    days,
                    total_activities: totalActivities,
                    avg_activities_per_day: avgActivitiesPerDay,
                },
            };
        }
        return null;
    }
    detectTransportVsTimeConflict(constraints, plan, state) {
        const travelMode = constraints.hard_constraints.travel_mode;
        if (travelMode.no_early_morning) {
            const earlyActivitiesWithDay = plan.days.flatMap(day => day.timeSlots
                .filter(slot => {
                const hour = parseInt(slot.time.split(':')[0]);
                return hour < 7;
            })
                .map(slot => ({ slot, dayNumber: day.day })));
            if (earlyActivitiesWithDay.length > 0) {
                return {
                    between: ['travel_mode', 'time_window'],
                    description: `禁止早起，但行程中包含${earlyActivitiesWithDay.length}个早于7点的活动`,
                    severity: 'medium',
                    tradeoff_options: [
                        '调整活动时间到7点之后',
                        '移除需要早起的活动',
                        '允许早起（如果可能）',
                    ],
                    affected_days: Array.from(new Set(earlyActivitiesWithDay.map(a => a.dayNumber))),
                    details: {
                        early_activity_count: earlyActivitiesWithDay.length,
                        no_early_morning: true,
                    },
                };
            }
        }
        if (travelMode.no_late_night) {
            const lateActivitiesWithDay = plan.days.flatMap(day => day.timeSlots
                .filter(slot => {
                const hour = parseInt(slot.time.split(':')[0]);
                return hour >= 22;
            })
                .map(slot => ({ slot, dayNumber: day.day })));
            if (lateActivitiesWithDay.length > 0) {
                return {
                    between: ['travel_mode', 'time_window'],
                    description: `禁止夜车，但行程中包含${lateActivitiesWithDay.length}个晚于22点的活动`,
                    severity: 'medium',
                    tradeoff_options: [
                        '调整活动时间到22点之前',
                        '移除需要夜车的活动',
                        '允许夜车（如果可能）',
                    ],
                    affected_days: Array.from(new Set(lateActivitiesWithDay.map(a => a.dayNumber))),
                    details: {
                        late_activity_count: lateActivitiesWithDay.length,
                        no_late_night: true,
                    },
                };
            }
        }
        return null;
    }
    detectRiskToleranceConflict(constraints, plan, state) {
        const riskTolerance = constraints.soft_constraints.risk_tolerance;
        if (riskTolerance.level === 'low') {
            const highRiskActivities = plan.days.flatMap(day => day.timeSlots.filter(slot => {
                return slot.riskLevel === 'high';
            }));
            if (highRiskActivities.length > 0) {
                return {
                    between: ['risk_tolerance', 'activity_risk'],
                    description: `用户风险容忍度为低，但行程中包含${highRiskActivities.length}个高风险活动`,
                    severity: 'high',
                    tradeoff_options: [
                        '替换为低风险活动',
                        '确认用户是否接受高风险活动',
                        '调整风险容忍度设置',
                    ],
                    details: {
                        user_risk_tolerance: riskTolerance.level,
                        high_risk_activity_count: highRiskActivities.length,
                    },
                };
            }
        }
        return null;
    }
    generateTradeoffExplanation(conflict, currentPlan) {
        var _a, _b;
        const [constraintA, constraintB] = conflict.between;
        return {
            conflict_type: `${constraintA} vs ${constraintB}`,
            current_state: {
                constraint_a_value: ((_a = conflict.details) === null || _a === void 0 ? void 0 : _a[constraintA]) || 'unknown',
                constraint_b_value: ((_b = conflict.details) === null || _b === void 0 ? void 0 : _b[constraintB]) || 'unknown',
                conflict_reason: conflict.description,
            },
            options: conflict.tradeoff_options.map((option, index) => {
                let recommendation = 'optional';
                if (option.includes('增加') || option.includes('调整')) {
                    recommendation = 'recommended';
                }
                else if (option.includes('接受') || option.includes('允许')) {
                    recommendation = 'optional';
                }
                return {
                    option,
                    impact: {
                        constraint_a_change: this.analyzeConstraintChange(option, constraintA),
                        constraint_b_change: this.analyzeConstraintChange(option, constraintB),
                        overall_impact: this.analyzeOverallImpact(option, conflict.severity),
                    },
                    recommendation,
                };
            }),
        };
    }
    analyzeConstraintChange(option, constraint) {
        if (option.includes('增加')) {
            return `增加${constraint}的值`;
        }
        else if (option.includes('减少') || option.includes('降低')) {
            return `减少${constraint}的值`;
        }
        else if (option.includes('调整')) {
            return `调整${constraint}的设置`;
        }
        return `保持${constraint}不变`;
    }
    analyzeOverallImpact(option, severity) {
        if (option.includes('增加') || option.includes('延长')) {
            return severity === 'critical' || severity === 'high' ? 'positive' : 'neutral';
        }
        else if (option.includes('减少') || option.includes('降低')) {
            return 'negative';
        }
        return 'neutral';
    }
};
exports.ConstraintConflictResolver = ConstraintConflictResolver;
exports.ConstraintConflictResolver = ConstraintConflictResolver = ConstraintConflictResolver_1 = __decorate([
    (0, common_1.Injectable)()
], ConstraintConflictResolver);
//# sourceMappingURL=constraint-conflict-resolver.service.js.map